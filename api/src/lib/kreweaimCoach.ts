/**
 * KreweAIM coach: a skills check on first visit, then lessons generated for one
 * person from their profile (role, licensed and approved AI tools, apps,
 * company policy), their skill, the lessons they already have and what they
 * said about them.
 *
 * Every lesson is unique, so quality is enforced by the system rather than by
 * reviewing lessons one at a time:
 *  - the output schema only allows the person's own approved tools;
 *  - the instructions carry the company's AI policy and NOIT's guidance;
 *  - the text is checked against NOIT's writing rules before it is saved.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash, randomUUID } from "node:crypto";
import { ServiceUnavailableError } from "./http";
import type { LearnerProfile, LearnerState, Lesson, StoredQuizQuestion } from "./kreweaimLearner";

const DEFAULT_MODEL = "claude-opus-5-5";
// SWA managed functions stop a request at about 45 seconds; the model call gets 30 of them,
// leaving room for the membership check, the profile and state reads and the state write.
const REQUEST_TIMEOUT_MS = 30_000;
const QUIZ_PLATFORMS = 3;
const QUESTIONS_PER_PLATFORM = 2;

export function coachConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function object(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

// ─── Context ─────────────────────────────────────────────────────

function label(profile: LearnerProfile, key: string): string {
  return profile.platforms.find((p) => p.key === key)?.label ?? key;
}

/** The person, as the model sees them. Names only the first name; no ids. */
export function describeLearner(profile: LearnerProfile, state: LearnerState): string {
  const lines = [
    `First name: ${profile.givenName}`,
    `Company: ${profile.company} (industry: ${profile.vertical || "general"})`,
    `Role: ${profile.role.title || "not listed"} (family: ${profile.role.family})${profile.role.department ? `, ${profile.role.department}` : ""}`,
    `AI tools they have and may learn: ${profile.platforms.map((p) => `${p.label} [${p.key}]`).join(", ")}`,
  ];
  if (profile.agent) lines.push(`Their Krewe agent: ${profile.agent.agent}, reached over ${profile.agent.channel}`);
  if (profile.apps.length) lines.push(`Work apps: ${profile.apps.join(", ")}`);
  if (profile.unapprovedReported.length) {
    lines.push(`Tools the company has NOT approved (never teach; steer to approved tools): ${profile.unapprovedReported.join(", ")}`);
  }
  for (const [tool, note] of Object.entries(profile.planned)) lines.push(`Coming later, not approved yet: ${tool}. ${note}`);
  if (Object.keys(state.skill).length) {
    lines.push(
      `Skill (1 new, 4 power user): ${Object.entries(state.skill)
        .map(([k, v]) => `${label(profile, k)} ${v}`)
        .join(", ")}`
    );
    const unknown = profile.platforms.filter((p) => !(p.key in state.skill)).map((p) => p.label);
    if (unknown.length) {
      lines.push(`Skill not measured yet for: ${unknown.join(", ")}. A lesson on one of these starts at level 1 or 2 and steps up from their feedback.`);
    }
  }
  return lines.join("\n");
}

function policyBlock(profile: LearnerProfile): string {
  return profile.policy.length
    ? `The company's AI rules. Every lesson must follow them:\n${profile.policy.map((p) => `- ${p}`).join("\n")}`
    : "The company has not published AI rules beyond safe use: never put passwords, client secrets or personal data into a tool the company has not approved.";
}

// ─── Skills check ────────────────────────────────────────────────

export function quizPlatforms(profile: LearnerProfile): string[] {
  return profile.platforms.slice(0, QUIZ_PLATFORMS).map((p) => p.key);
}

/** Fingerprint of the company's AI policy; lessons written under another version are retired. */
export function policyVersion(profile: LearnerProfile): string {
  return createHash("sha256").update(JSON.stringify(profile.policy)).digest("hex").slice(0, 16);
}

/** An unfinished check that asks about a tool the person no longer has. */
export function quizIsStale(profile: LearnerProfile, quiz: LearnerState["quiz"]): boolean {
  if (!quiz || quiz.completedAt) return false;
  // Written under another company policy: its questions may teach what the rules now forbid.
  if (quiz.policyVersion !== undefined && quiz.policyVersion !== policyVersion(profile)) return true;
  const tools = new Set(profile.platforms.map((p) => p.key));
  return quiz.questions.some((q) => !tools.has(q.platform));
}

/** Top tools the person has no skill estimate for yet (new to their profile since their last check). */
export function unassessedPlatforms(profile: LearnerProfile, state: LearnerState): string[] {
  return quizPlatforms(profile).filter((p) => !(p in state.skill));
}

function quizSchema(platforms: string[]) {
  const question = object({
    platform: { type: "string", enum: platforms },
    question: { type: "string" },
    // Structured outputs only allow minItems 0 or 1; the four-choice rule is checked after.
    choices: { type: "array", items: { type: "string" }, description: "Exactly four choices." },
    answer: { type: "integer", description: "Index 0-3 of the one correct choice." },
    explanation: { type: "string", description: "One sentence on why that choice is right." },
  });
  return object({ questions: { type: "array", items: question } });
}

export async function generateQuiz(profile: LearnerProfile, platforms: string[] = quizPlatforms(profile)): Promise<StoredQuizQuestion[]> {
  const text = await callClaude(
    [
      "You write a short skills check for KreweAIM, a personal AI training program.",
      `Write ${QUESTIONS_PER_PLATFORM} multiple-choice questions for each of these tools: ${platforms.join(", ")}.`,
      "Each question is a realistic situation from this person's own job, asking what works best in that tool.",
      "Mix difficulty: one everyday question and one that separates a capable user from a power user.",
      "Speak to the person as \"you\", never by name.",
      "Exactly one choice is correct. Wrong choices are plausible, not silly, and about as long as the right one. Vary where the right one sits. Plain language, no jargon.",
      "Do not ask about features you are unsure exist. Prefer durable skills: prompting, giving context, checking output, safe use.",
      "Write without dashes as punctuation and never start a sentence with And, But, Or, So or Yet.",
      "",
      policyBlock(profile),
    ].join("\n"),
    `The person:\n${describeLearner(profile, { quiz: null, skill: {}, lessons: [] })}`,
    quizSchema(platforms)
  );
  const parsed = JSON.parse(text) as { questions: Omit<StoredQuizQuestion, "id">[] };
  const valid = parsed.questions.filter(
    (q) => platforms.includes(q.platform) && q.choices.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4
  );
  // Every requested tool needs its full set, or that tool would get no skill estimate.
  const questions = platforms.flatMap((p) => valid.filter((q) => q.platform === p).slice(0, QUESTIONS_PER_PLATFORM));
  if (questions.length < platforms.length * QUESTIONS_PER_PLATFORM) {
    throw new ServiceUnavailableError("The skills check came back incomplete. Try again.");
  }
  return questions.map((q) => ({ ...q, id: randomUUID(), question: tidy(q.question), choices: q.choices.map(tidy), explanation: tidy(q.explanation) }));
}

/**
 * Skill per platform, 1..4: the average of the person's own rating and what
 * their answers show (none right 1, half 2.5, all 4).
 */
export function scoreQuiz(
  questions: StoredQuizQuestion[],
  answers: Record<string, number>,
  selfRating: Record<string, number>
): Record<string, number> {
  const skill: Record<string, number> = {};
  for (const platform of new Set(questions.map((q) => q.platform))) {
    const qs = questions.filter((q) => q.platform === platform);
    const right = qs.filter((q) => answers[q.id] === q.answer).length;
    const shown = 1 + (3 * right) / qs.length;
    const rating = selfRating[platform];
    const self = Number.isInteger(rating) && rating >= 1 && rating <= 4 ? rating : shown;
    skill[platform] = Math.max(1, Math.min(4, Math.round((shown + self) / 2)));
  }
  return skill;
}

// ─── Lessons ─────────────────────────────────────────────────────

function lessonSchema(platforms: string[]) {
  return object({
    platform: { type: "string", enum: platforms },
    title: { type: "string", description: "Short and specific to the person's work." },
    level: { type: "integer", description: "1 new .. 4 power user; match their skill on this tool." },
    minutes: { type: "integer", description: "Time to finish, 3 to 15." },
    why: { type: "string", description: "One or two sentences on why this matters for them now." },
    body: {
      type: "string",
      description: "The lesson, 150 to 350 words. Markdown limited to short paragraphs, '- ' bullets and **bold**.",
    },
    tryIt: object({
      instructions: { type: "string", description: "What to do right now, in one or two sentences." },
      prompt: { type: "string", description: "A ready-to-use prompt with [brackets] for their details." },
    }),
    takeaway: { type: "string", description: "One sentence to remember." },
  });
}

function history(profile: LearnerProfile, state: LearnerState): string {
  if (!state.lessons.length) return "No lessons yet. This is their first: make it an early win on the tool they use most.";
  const recent = state.lessons.slice(-12).map((l) => {
    // The person's free-form note is never sent to the model: it may hold details that must not leave NOIT.
    const said = l.feedback === "helped" ? "helped" : l.feedback === "not_helpful" ? "did NOT help" : l.status === "done" ? "finished" : "not opened yet";
    return `- ${l.title} (${label(profile, l.platform)}, level ${l.level}): ${said}`;
  });
  // Older lessons keep only their titles, so no topic is ever repeated however long the history.
  const older = state.lessons.slice(0, -12).map((l) => l.title);
  const olderBlock = older.length ? `\nEarlier lesson titles (also never repeat): ${older.join("; ")}` : "";
  return `Lessons they already have (never repeat one; build on what helped, fix what did not):\n${recent.join("\n")}${olderBlock}`;
}

const LESSON_RULES = [
  "Teach only tools on their list. Use their tool's real name. Match the level to their skill on that tool, stepping up once a level is mastered.",
  "Make it practical: a real task from their job, the exact way to do it, and a prompt they can paste today.",
  "Never assume a setup, export, folder, report or habit they have not told you about. When the task needs one, the first step shows how to get it.",
  "If you are not sure a feature exists in their version of a tool, teach the durable skill instead of the feature.",
  "Never ask them to paste passwords, client confidential details or personal data anywhere.",
  "Voice: warm, plain, confident. Write without dashes as punctuation, never start a sentence with And, But, Or, So or Yet, and vary sentence length.",
];

function guidanceBlock(profile: LearnerProfile): string {
  return profile.guidance.length
    ? `NOIT guidance that fits this person. Use it as grounding, do not copy it:\n${profile.guidance
        .map((g) => `- [${g.platform}] ${g.title}: ${g.summary}`)
        .join("\n")}`
    : "";
}

type LessonContent = Omit<Lesson, "id" | "createdAt" | "model" | "policyVersion" | "status" | "feedback" | "note" | "thread" | "revisedAt">;

/** Checks a generated lesson against the person's tools and NOIT's writing rules. */
function cleanLesson(text: string, platforms: string[]): LessonContent {
  const raw = JSON.parse(text) as LessonContent;
  if (!platforms.includes(raw.platform)) throw new ServiceUnavailableError("The lesson came back for a tool you do not have. Try again.");
  return {
    platform: raw.platform,
    title: tidy(raw.title),
    level: Math.max(1, Math.min(4, Math.round(raw.level))),
    minutes: Math.max(3, Math.min(15, Math.round(raw.minutes))),
    why: tidy(raw.why),
    body: tidy(raw.body),
    tryIt: { instructions: tidy(raw.tryIt.instructions), prompt: raw.tryIt.prompt.trim() },
    takeaway: tidy(raw.takeaway),
  };
}

function lessonText(profile: LearnerProfile, lesson: Lesson): string {
  return [
    `Title: ${lesson.title} (${label(profile, lesson.platform)}, level ${lesson.level}, ${lesson.minutes} minutes)`,
    `Why: ${lesson.why}`,
    lesson.body,
    `Try it: ${lesson.tryIt.instructions}`,
    `Prompt: ${lesson.tryIt.prompt}`,
    `Takeaway: ${lesson.takeaway}`,
  ].join("\n\n");
}

function threadText(thread: Lesson["thread"]): string {
  return (thread ?? []).map((t) => `${t.from === "you" ? "Learner" : "Coach"}: ${t.text}`).join("\n\n");
}

export async function generateLesson(profile: LearnerProfile, state: LearnerState): Promise<Omit<Lesson, "status" | "feedback" | "note">> {
  const version = policyVersion(profile);
  const platforms = profile.platforms.map((p) => p.key);
  const instructions = [
    "You are the KreweAIM coach. Write the single next lesson for one person, built for them alone.",
    "Pick the tool and topic that will pay off most in their actual work right now, given their role, apps, skill and history.",
    ...LESSON_RULES,
    "",
    policyBlock(profile),
    guidanceBlock(profile),
  ].join("\n");
  const user = `The person:\n${describeLearner(profile, state)}\n\n${history(profile, state)}`;
  const { text, model } = await callClaudeWithModel(instructions, user, lessonSchema(platforms));
  const raw = cleanLesson(text, platforms);
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...raw,
    model,
    policyVersion: version,
  };
}

// ─── Working a lesson through with the coach ─────────────────────

/** Turns a person may send on one lesson, so a conversation stays a lesson and not open chat. */
export const MAX_COACH_TURNS = 12;
export const MAX_COACH_MESSAGE = 1500;

/**
 * The coach's answer to the person, about this lesson: develop the idea, fill in a missing
 * step, adapt it to their setup, or pivot to a nearby task. It stays inside their tools and
 * their company's AI rules, and it does not change the lesson itself.
 */
export async function coachReply(profile: LearnerProfile, state: LearnerState, lesson: Lesson, message: string): Promise<string> {
  const instructions = [
    "You are the KreweAIM coach, working one lesson through with the person it was written for.",
    "Help them develop the idea, fill in a step they are missing, adapt it to how they actually work, or pivot to a nearby task that fits them better.",
    "If the lesson assumed something they do not have yet, start from where they really are and walk them to it.",
    "Be concrete and brief: under 200 words, short paragraphs or '- ' bullets, **bold** sparingly. End with the one next thing to do.",
    "When they want the lesson itself changed, help, and tell them they can press Rework this lesson to rewrite it from this conversation.",
    "Stay on their AI tools and their work. Teach only tools on their list; steer away from tools the company has not approved.",
    "If they share a password, a client confidential detail or personal data, do not repeat it and remind them not to share it.",
    "Voice: warm, plain, confident. Write without dashes as punctuation and never start a sentence with And, But, Or, So or Yet.",
    "",
    policyBlock(profile),
  ].join("\n");
  const soFar = threadText(lesson.thread);
  const user = [
    `The person:\n${describeLearner(profile, state)}`,
    `The lesson:\n${lessonText(profile, lesson)}`,
    soFar ? `Your conversation so far:\n${soFar}` : "",
    `Learner: ${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { text } = await callClaudeWithModel(instructions, user, object({ reply: { type: "string" } }));
  return tidy((JSON.parse(text) as { reply: string }).reply);
}

/** The lesson rewritten from the person's conversation with the coach and any change they asked for. */
export async function reworkLesson(
  profile: LearnerProfile,
  state: LearnerState,
  lesson: Lesson,
  request: string
): Promise<Pick<Lesson, "platform" | "title" | "level" | "minutes" | "why" | "body" | "tryIt" | "takeaway" | "model" | "policyVersion">> {
  const platforms = profile.platforms.map((p) => p.key);
  const instructions = [
    "You are the KreweAIM coach. Rewrite one lesson for the person it was written for, using what they told you.",
    "Keep what worked about the original. Change what they said does not fit: their real starting point, their setup, the task they care about, the depth they want.",
    "A pivot to a different task or tool on their list is fine when that is what they asked for.",
    ...LESSON_RULES,
    "",
    policyBlock(profile),
    guidanceBlock(profile),
  ].join("\n");
  const soFar = threadText(lesson.thread);
  const user = [
    `The person:\n${describeLearner(profile, state)}`,
    `The lesson as it stands:\n${lessonText(profile, lesson)}`,
    soFar ? `Your conversation about it:\n${soFar}` : "",
    request ? `What they want changed: ${request}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const { text, model } = await callClaudeWithModel(instructions, user, lessonSchema(platforms));
  return { ...cleanLesson(text, platforms), model, policyVersion: policyVersion(profile) };
}

// ─── Writing rules ───────────────────────────────────────────────

/**
 * NOIT's writing rules, enforced on every generated text: no em or en dashes
 * and no spaced hyphen used as punctuation. Hyphenated words are untouched.
 */
export function tidy(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2") // number ranges keep their meaning
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/(\S) - (\S)/g, (m, a: string, b: string) => (/\d/.test(a) && /\d/.test(b) ? m : `${a}, ${b}`)) // keep subtraction
    .replace(/,\s*,/g, ",")
    .trim();
}

// ─── Claude ──────────────────────────────────────────────────────

async function callClaude(system: string, user: string, schema: Record<string, unknown>): Promise<string> {
  return (await callClaudeWithModel(system, user, schema)).text;
}

async function callClaudeWithModel(system: string, user: string, schema: Record<string, unknown>): Promise<{ text: string; model: string }> {
  if (!coachConfigured()) throw new ServiceUnavailableError("KreweAIM coaching is not set up yet.");
  const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: process.env.KREWEAIM_MODEL || DEFAULT_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      throw new ServiceUnavailableError("That took too long. Try again.");
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new ServiceUnavailableError("KreweAIM coaching could not sign in to its AI service.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new ServiceUnavailableError(`KreweAIM coaching rejected the request: ${err.message}`);
    }
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIError) {
      throw new ServiceUnavailableError("KreweAIM coaching is busy. Try again shortly.");
    }
    throw err;
  }
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new ServiceUnavailableError("That lesson could not be written. Try again.");
  }
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    JSON.parse(text);
  } catch {
    throw new ServiceUnavailableError("KreweAIM coaching returned an unusable answer. Try again.");
  }
  return { text, model: response.model };
}
