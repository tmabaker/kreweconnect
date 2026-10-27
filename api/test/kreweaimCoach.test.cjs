const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ANTHROPIC_API_KEY = "test-key";
const coach = require("../dist/src/lib/kreweaimCoach.js");
const { learnerPath } = require("../dist/src/lib/kreweaimLearner.js");

const profile = {
  schema: 1,
  built: "2026-10-26",
  company: "Example Co",
  givenName: "Pat",
  role: { title: "Project Manager", family: "operations", department: "" },
  vertical: "homebuilding",
  platforms: [
    { key: "m365_copilot", label: "Microsoft 365 Copilot" },
    { key: "copilot_chat", label: "Copilot Chat" },
  ],
  unapprovedReported: ["gemini"],
  planned: { claude: "After the November meeting." },
  agent: null,
  apps: ["Microsoft 365"],
  policy: ["Never paste client financials into a tool."],
  guidance: [{ id: "prompting-fundamentals", title: "Prompting fundamentals", platform: "any", summary: "Give context." }],
};

const q = (id, platform, answer) => ({ id, platform, question: "?", choices: ["a", "b", "c", "d"], answer, explanation: "" });

test("skill blends answers with the person's own rating", () => {
  const questions = [q("1", "m365_copilot", 0), q("2", "m365_copilot", 1), q("3", "copilot_chat", 2), q("4", "copilot_chat", 3)];
  const skill = coach.scoreQuiz(questions, { 1: 0, 2: 1, 3: 0, 4: 0 }, { m365_copilot: 4, copilot_chat: 1 });
  assert.deepEqual(skill, { m365_copilot: 4, copilot_chat: 1 });
  // A missing or invalid rating falls back to what the answers show.
  assert.deepEqual(coach.scoreQuiz(questions, { 1: 0, 2: 0, 3: 2, 4: 3 }, { m365_copilot: 9 }), { m365_copilot: 3, copilot_chat: 4 });
});

test("writing rules: dashes used as punctuation become commas, hyphenated words stay", () => {
  assert.equal(coach.tidy("Open Teams — then ask Copilot"), "Open Teams, then ask Copilot");
  assert.equal(coach.tidy("Draft it - then check it"), "Draft it, then check it");
  assert.equal(coach.tidy("A follow-up email"), "A follow-up email");
  assert.equal(coach.tidy("Review rows 10\u201320 first"), "Review rows 10 to 20 first");
  assert.equal(coach.tidy("Seats left: 5 - 2 = 3"), "Seats left: 5 - 2 = 3");
});

test("the model sees unapproved and planned tools only as things not to teach", () => {
  const text = coach.describeLearner(profile, { quiz: null, skill: { m365_copilot: 2 }, lessons: [] });
  assert.match(text, /NOT approved \(never teach.*gemini/);
  assert.match(text, /Coming later, not approved yet: claude/);
  assert.match(text, /Microsoft 365 Copilot 2/);
  assert.doesNotMatch(text, /@|[0-9a-f]{8}-[0-9a-f]{4}/); // no addresses or ids
});

test("learner paths only accept real ids", () => {
  const t = "11111111-2222-3333-4444-555555555555";
  assert.equal(learnerPath(t, t, "state"), `learners/${t}/${t}/state.json`);
  assert.throws(() => learnerPath("../x", t, "state"));
  assert.throws(() => learnerPath(t, "all", "profile"));
});

function claudeReply(json) {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify(json) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

test("a lesson is limited to the person's tools and cleaned before saving", async () => {
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return claudeReply({
      platform: "m365_copilot",
      title: "Recap a site meeting — fast",
      level: 7,
      minutes: 40,
      why: "You run weekly site meetings.",
      body: "Open the meeting - then ask for the recap.",
      tryIt: { instructions: "Try it now.", prompt: "Summarize [meeting]" },
      takeaway: "Recap the same day.",
    });
  };
  const lesson = await coach.generateLesson(profile, { quiz: null, skill: {}, lessons: [] });
  assert.deepEqual(sent.output_config.format.schema.properties.platform.enum, ["m365_copilot", "copilot_chat"]);
  assert.match(sent.system, /Never paste client financials/);
  assert.equal(lesson.title, "Recap a site meeting, fast");
  assert.equal(lesson.body, "Open the meeting, then ask for the recap.");
  assert.equal(lesson.level, 4);
  assert.equal(lesson.minutes, 15);
  assert.equal(lesson.model, "claude-opus-5-5");
});

test("a lesson for a tool the person does not have is rejected", async () => {
  global.fetch = async () =>
    claudeReply({ platform: "gemini", title: "x", level: 1, minutes: 5, why: "", body: "", tryIt: { instructions: "", prompt: "" }, takeaway: "" });
  await assert.rejects(coach.generateLesson(profile, { quiz: null, skill: {}, lessons: [] }), /tool you do not have/);
});

const qq = (platform, question, answer) => ({ platform, question, choices: ["a", "b", "c", "d"], answer, explanation: "Why." });

test("quiz keeps answers server side and needs a full set for every requested tool", async () => {
  global.fetch = async () =>
    claudeReply({
      questions: [
        qq("m365_copilot", "One?", 2), qq("m365_copilot", "Two?", 1), qq("m365_copilot", "Extra?", 0),
        qq("copilot_chat", "Three?", 3), qq("copilot_chat", "Four?", 0), qq("gemini", "Not theirs?", 0),
      ],
    });
  const questions = await coach.generateQuiz(profile);
  assert.deepEqual(questions.map((q) => q.question), ["One?", "Two?", "Three?", "Four?"]);
  assert.ok(questions.every((q) => q.id && Number.isInteger(q.answer)));

  global.fetch = async () => claudeReply({ questions: [qq("m365_copilot", "One?", 2), qq("m365_copilot", "Two?", 1), qq("copilot_chat", "Only one?", 0)] });
  await assert.rejects(coach.generateQuiz(profile), /incomplete/);
});

test("a tool added to the profile after the check needs its own short check", () => {
  const state = { quiz: null, skill: { m365_copilot: 3 }, lessons: [] };
  assert.deepEqual(coach.unassessedPlatforms(profile, state), ["copilot_chat"]);
  assert.deepEqual(coach.unassessedPlatforms(profile, { ...state, skill: { m365_copilot: 3, copilot_chat: 2 } }), []);
});

test("every earlier lesson title reaches the coach, so long histories never repeat a topic", async () => {
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return claudeReply({ platform: "copilot_chat", title: "New", level: 2, minutes: 5, why: "", body: "", tryIt: { instructions: "", prompt: "" }, takeaway: "" });
  };
  const lessons = Array.from({ length: 15 }, (_, i) => ({ title: `Lesson ${i + 1}`, platform: "copilot_chat", level: 1, status: "done", feedback: null, note: null }));
  await coach.generateLesson(profile, { quiz: null, skill: {}, lessons });
  const user = sent.messages[0].content;
  for (let i = 1; i <= 15; i++) assert.match(user, new RegExp(`Lesson ${i}\\b`));
});

test("lessons carry the policy they were written under; a policy change retires them", async () => {
  global.fetch = async () =>
    claudeReply({ platform: "copilot_chat", title: "x", level: 1, minutes: 5, why: "", body: "", tryIt: { instructions: "", prompt: "" }, takeaway: "" });
  const lesson = await coach.generateLesson(profile, { quiz: null, skill: {}, lessons: [] });
  assert.equal(lesson.policyVersion, coach.policyVersion(profile));
  assert.notEqual(coach.policyVersion({ ...profile, policy: [...profile.policy, "New rule."] }), lesson.policyVersion);
});

test("an unfinished check that asks about a removed tool is stale", () => {
  const quiz = { questions: [{ platform: "m365_copilot" }, { platform: "gemini" }], completedAt: null };
  assert.equal(coach.quizIsStale(profile, quiz), true);
  assert.equal(coach.quizIsStale(profile, { ...quiz, questions: [{ platform: "m365_copilot" }] }), false);
  assert.equal(coach.quizIsStale(profile, { ...quiz, completedAt: "2026-10-26" }), false);
  const fits = { ...quiz, questions: [{ platform: "m365_copilot" }], policyVersion: coach.policyVersion(profile) };
  assert.equal(coach.quizIsStale(profile, fits), false);
  assert.equal(coach.quizIsStale({ ...profile, policy: ["A new rule."] }, fits), true); // policy changed mid-check
});

test("free-form feedback notes never reach the model; unmeasured tools start low", async () => {
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return claudeReply({ platform: "copilot_chat", title: "x", level: 1, minutes: 5, why: "", body: "", tryIt: { instructions: "", prompt: "" }, takeaway: "" });
  };
  const lessons = [{ title: "Old", platform: "copilot_chat", level: 1, status: "done", feedback: "not_helpful", note: "my password is hunter2" }];
  await coach.generateLesson(profile, { quiz: null, skill: { m365_copilot: 3 }, lessons });
  const user = sent.messages[0].content;
  assert.doesNotMatch(user, /hunter2/);
  assert.match(user, /Old .*did NOT help/);
  assert.match(user, /Skill not measured yet for: Copilot Chat/);
});

const lessonFixture = {
  id: "l1", createdAt: "2026-10-27", platform: "m365_copilot", title: "Summarize your backup exports", level: 2, minutes: 10,
  why: "You review backups weekly.", body: "Open the export in your Reports folder.", tryIt: { instructions: "Try it.", prompt: "Summarize [export]" },
  takeaway: "Check weekly.", model: "claude-opus-5-5", policyVersion: "x", status: "new", feedback: null, note: null,
  thread: [{ from: "you", text: "I do not run these exports yet.", at: "t" }, { from: "coach", text: "Start in the portal.", at: "t" }],
};

test("the coach answers inside the lesson, with the conversation so far and the company rules", async () => {
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return claudeReply({ reply: "First, set up the export — then save it weekly." });
  };
  const reply = await coach.coachReply(profile, { quiz: null, skill: { m365_copilot: 2 }, lessons: [] }, lessonFixture, "Where is that setting?");
  assert.equal(reply, "First, set up the export, then save it weekly.");
  const user = sent.messages[0].content;
  assert.match(user, /Summarize your backup exports/);
  assert.match(user, /Learner: I do not run these exports yet\.\n\nCoach: Start in the portal\./);
  assert.match(user, /Learner: Where is that setting\?$/);
  assert.match(sent.system, /Never paste client financials/);
  assert.match(sent.system, /Rework this lesson/);
});

test("a reworked lesson is built from the conversation, never assumes a setup, and stays on the person's tools", async () => {
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return claudeReply({
      platform: "copilot_chat", title: "Set up your first export — then summarize it", level: 1, minutes: 12,
      why: "", body: "", tryIt: { instructions: "", prompt: "" }, takeaway: "",
    });
  };
  const revised = await coach.reworkLesson(profile, { quiz: null, skill: {}, lessons: [] }, lessonFixture, "Start me from scratch");
  assert.deepEqual(sent.output_config.format.schema.properties.platform.enum, ["m365_copilot", "copilot_chat"]);
  assert.match(sent.system, /Never assume a setup/);
  assert.match(sent.messages[0].content, /I do not run these exports yet/);
  assert.match(sent.messages[0].content, /What they want changed: Start me from scratch/);
  assert.equal(revised.title, "Set up your first export, then summarize it");
  assert.equal(revised.platform, "copilot_chat");
  assert.equal(revised.policyVersion, coach.policyVersion(profile));

  global.fetch = async () =>
    claudeReply({ platform: "gemini", title: "x", level: 1, minutes: 5, why: "", body: "", tryIt: { instructions: "", prompt: "" }, takeaway: "" });
  await assert.rejects(coach.reworkLesson(profile, { quiz: null, skill: {}, lessons: [] }, lessonFixture, ""), /tool you do not have/);
});
