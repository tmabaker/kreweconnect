/**
 * KreweAIM API client: the signed-in person's own program. The backend
 * identifies the person from their token; there is no way to ask for anyone
 * else's.
 */
import { apiSend } from "./graphService";

export interface AimPlatform {
  key: string;
  label: string;
}

export interface AimQuestion {
  id: string;
  platform: string;
  question: string;
  choices: string[];
}

export interface AimQuizResult extends AimQuestion {
  picked: number | null;
  answer: number;
  explanation: string;
}

export interface AimLesson {
  id: string;
  createdAt: string;
  platform: string;
  title: string;
  level: number;
  minutes: number;
  why: string;
  body: string;
  tryIt: { instructions: string; prompt: string };
  takeaway: string;
  status: "new" | "done";
  feedback: "helped" | "not_helpful" | null;
  note: string | null;
}

export type AimQuiz =
  | { status: "not_started" }
  | { status: "in_progress"; platforms: string[]; questions: AimQuestion[] }
  | { status: "new_tools"; platforms: string[] }
  | { status: "done"; completedAt: string; results: AimQuizResult[] };

export interface AimMe {
  enrolled: boolean;
  ready: boolean;
  coachReady: boolean;
  givenName: string | null;
  platforms: AimPlatform[];
  agent: { agent: string; channel: string } | null;
  quiz: AimQuiz;
  skill: Record<string, number>;
  lessons: AimLesson[];
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function read(path: string, init?: RequestInit): Promise<AimMe> {
  return (await (await apiSend(path, init)).json()) as AimMe;
}

export const fetchMyAim = () => read("/kreweaim/me");
export const startSkillsCheck = () => read("/kreweaim/me/quiz/start", json({}));
export const submitSkillsCheck = (answers: Record<string, number>, selfRating: Record<string, number>) =>
  read("/kreweaim/me/quiz/answers", json({ answers, selfRating }));
export const nextLesson = () => read("/kreweaim/me/lessons", json({}));
export const updateLesson = (id: string, update: { status?: "done"; feedback?: "helped" | "not_helpful"; note?: string }) =>
  read(`/kreweaim/me/lessons/${encodeURIComponent(id)}`, json(update));
