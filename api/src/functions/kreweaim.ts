/**
 * KreweAIM (AI Mastery) routes:
 *
 *   GET /api/tenants/{tenantId}/aim-members   — ids of users assigned KreweAIM
 *   /api/kreweaim/me/...                       — the caller's own program (below)
 *
 * Assignment is membership in the KreweAIM security group in the client
 * tenant, managed by client admins or NOIT IT. {tenantId} may be "home" or,
 * for MSP admins, "all".
 */

import { app } from "@azure/functions";
import { fetchAimMembers, fetchAimMembersAllTenants } from "../lib/graphClient";
import { config } from "../lib/config";
import type { CallerContext } from "../lib/authMiddleware";
import { BadRequestError, NotFoundError, readJsonBody, withAuth } from "../lib/http";
import {
  readProfile,
  readState,
  writeState,
  type LearnerProfile,
  type LearnerState,
} from "../lib/kreweaimLearner";
import {
  coachConfigured,
  generateLesson,
  generateQuiz,
  quizPlatforms,
  scoreQuiz,
  unassessedPlatforms,
} from "../lib/kreweaimCoach";

app.http("tenantAimMembers", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/aim-members",
  handler: withAuth(async (_request, _caller, tenantId) => {
    const result =
      tenantId === "all"
        ? await fetchAimMembersAllTenants(config.clientTenants, config.kreweAimGroup)
        : await fetchAimMembers(tenantId, config.kreweAimGroup);
    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=300" },
      jsonBody: {
        value: result.memberIds,
        groupFound: result.groupFound,
        groupName: config.kreweAimGroup,
        failedTenants: result.failedTenants ?? 0,
      },
    };
  }),
});

// ─── Personal KreweAIM: the signed-in person's own program ─────────
//
//   GET  /api/kreweaim/me                      status, skills check, lessons
//   POST /api/kreweaim/me/quiz/start           prepare the skills check
//   POST /api/kreweaim/me/quiz/answers         score it   { answers, selfRating }
//   POST /api/kreweaim/me/lessons              generate the next lesson
//   POST /api/kreweaim/me/lessons/{lessonId}   { status?: "done", feedback?, note? }
//
// Every route acts only for the caller (tid + oid from their token), and only
// while they are in their company's KreweAIM group. Nobody can read or act on
// anyone else's program here.


/** Unfinished lessons someone may hold at once, so generation stays deliberate. */
const MAX_OPEN_LESSONS = 3;

async function enrolledProfile(caller: CallerContext): Promise<{ enrolled: boolean; profile: LearnerProfile | null }> {
  const membership = await fetchAimMembers(caller.tenantId, config.kreweAimGroup);
  const enrolled = membership.memberIds.includes(caller.userObjectId);
  return { enrolled, profile: enrolled ? await readProfile(caller.tenantId, caller.userObjectId) : null };
}

async function requireProfile(caller: CallerContext): Promise<LearnerProfile> {
  const { enrolled, profile } = await enrolledProfile(caller);
  if (!enrolled) throw new NotFoundError("You are not enrolled in KreweAIM.");
  if (!profile) throw new NotFoundError("Your KreweAIM program is still being prepared.");
  return profile;
}

/** Lessons for tools the person still has; a revoked or unapproved tool's lessons stop showing. */
function currentLessons(profile: LearnerProfile | null, state: LearnerState) {
  const tools = new Set((profile?.platforms ?? []).map((p) => p.key));
  return state.lessons.filter((l) => tools.has(l.platform));
}

/** What the person sees. Quiz answers stay on the server. */
function view(profile: LearnerProfile | null, state: LearnerState, enrolled: boolean) {
  const quiz = state.quiz;
  const newTools = profile && quiz?.completedAt ? unassessedPlatforms(profile, state) : [];
  return {
    enrolled,
    ready: !!profile,
    coachReady: coachConfigured(),
    givenName: profile?.givenName ?? null,
    platforms: profile?.platforms ?? [],
    agent: profile?.agent ?? null,
    quiz: !quiz
      ? { status: "not_started" }
      : quiz.completedAt && newTools.length
        ? { status: "new_tools", platforms: newTools }
      : quiz.completedAt
        ? {
            status: "done",
            completedAt: quiz.completedAt,
            results: quiz.questions.map((q) => ({
              id: q.id,
              platform: q.platform,
              question: q.question,
              choices: q.choices,
              picked: quiz.answers[q.id] ?? null,
              answer: q.answer,
              explanation: q.explanation,
            })),
          }
        : {
            status: "in_progress",
            platforms: [...new Set(quiz.questions.map((q) => q.platform))],
            questions: quiz.questions.map(({ id, platform, question, choices }) => ({ id, platform, question, choices })),
          },
    skill: state.skill,
    lessons: currentLessons(profile, state).reverse(),
  };
}

app.http("kreweAimMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "kreweaim/me",
  handler: withAuth(async (_request, caller) => {
    const { enrolled, profile } = await enrolledProfile(caller);
    const { state } = profile ? await readState(caller.tenantId, caller.userObjectId) : { state: { quiz: null, skill: {}, lessons: [] } };
    return { status: 200, headers: { "Cache-Control": "no-store" }, jsonBody: view(profile, state, enrolled) };
  }),
});

app.http("kreweAimQuizStart", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "kreweaim/me/quiz/start",
  handler: withAuth(async (_request, caller) => {
    const profile = await requireProfile(caller);
    const { state, etag } = await readState(caller.tenantId, caller.userObjectId);
    // First visit: the full check. Later: a short check for tools added since (none means nothing to do).
    const platforms = !state.quiz ? quizPlatforms(profile) : state.quiz.completedAt ? unassessedPlatforms(profile, state) : [];
    if (platforms.length) {
      state.quiz = { platforms, questions: await generateQuiz(profile, platforms), createdAt: new Date().toISOString(), completedAt: null, answers: {}, selfRating: {} };
      await writeState(caller.tenantId, caller.userObjectId, state, etag);
    }
    return { status: 200, jsonBody: view(profile, state, true) };
  }),
});

app.http("kreweAimQuizAnswers", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "kreweaim/me/quiz/answers",
  handler: withAuth(async (request, caller) => {
    const profile = await requireProfile(caller);
    const body = await readJsonBody(request);
    const { state, etag } = await readState(caller.tenantId, caller.userObjectId);
    const quiz = state.quiz;
    if (!quiz || quiz.completedAt) throw new BadRequestError("There is no skills check waiting for answers.");
    const answers = (body.answers ?? {}) as Record<string, unknown>;
    const ratings = (body.selfRating ?? {}) as Record<string, unknown>;
    quiz.answers = Object.fromEntries(
      quiz.questions.filter((q) => Number.isInteger(answers[q.id])).map((q) => [q.id, answers[q.id] as number])
    );
    if (Object.keys(quiz.answers).length < quiz.questions.length) throw new BadRequestError("Answer every question first.");
    const asked = quiz.platforms ?? [...new Set(quiz.questions.map((q) => q.platform))];
    quiz.selfRating = Object.fromEntries(
      asked.filter((p) => Number.isInteger(ratings[p])).map((p) => [p, ratings[p] as number])
    );
    quiz.completedAt = new Date().toISOString();
    state.skill = { ...state.skill, ...scoreQuiz(quiz.questions, quiz.answers, quiz.selfRating) };
    await writeState(caller.tenantId, caller.userObjectId, state, etag);
    return { status: 200, jsonBody: view(profile, state, true) };
  }),
});

app.http("kreweAimNextLesson", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "kreweaim/me/lessons",
  handler: withAuth(async (_request, caller) => {
    const profile = await requireProfile(caller);
    const { state, etag } = await readState(caller.tenantId, caller.userObjectId);
    if (!state.quiz?.completedAt) throw new BadRequestError("Take the skills check first so your lessons fit you.");
    if (unassessedPlatforms(profile, state).length) throw new BadRequestError("Take the quick check for your new tools first.");
    if (currentLessons(profile, state).filter((l) => l.status === "new").length >= MAX_OPEN_LESSONS) {
      throw new BadRequestError(`Finish one of your ${MAX_OPEN_LESSONS} open lessons first.`);
    }
    state.lessons.push({ ...(await generateLesson(profile, state)), status: "new", feedback: null, note: null });
    await writeState(caller.tenantId, caller.userObjectId, state, etag);
    return { status: 200, jsonBody: view(profile, state, true) };
  }),
});

app.http("kreweAimLessonUpdate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "kreweaim/me/lessons/{lessonId}",
  handler: withAuth(async (request, caller) => {
    const profile = await requireProfile(caller);
    const body = await readJsonBody(request);
    const { state, etag } = await readState(caller.tenantId, caller.userObjectId);
    const lesson = state.lessons.find((l) => l.id === request.params.lessonId);
    if (!lesson) throw new NotFoundError("That lesson is not yours or no longer exists.");
    if (body.status === "done") lesson.status = "done";
    if (body.feedback === "helped" || body.feedback === "not_helpful") {
      lesson.feedback = body.feedback;
      lesson.status = "done";
    }
    if (typeof body.note === "string") lesson.note = body.note.trim().slice(0, 500) || null;
    await writeState(caller.tenantId, caller.userObjectId, state, etag);
    return { status: 200, jsonBody: view(profile, state, true) };
  }),
});
