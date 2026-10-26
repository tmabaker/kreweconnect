/**
 * KreweAIM learner storage. Each enrolled person has two blobs in the private
 * "kreweaim" container, keyed only by their own tenant and object id:
 *
 *   learners/{tenantId}/{userId}/profile.json  written by the KreweAIM engine
 *     (noit-client-tools `aim publish`): role, licensed and approved AI tools,
 *     apps, company AI policy, matched NOIT guidance. Read only here.
 *   learners/{tenantId}/{userId}/state.json    written here: quiz, skill,
 *     generated lessons and the person's feedback on them.
 *
 * Client details (which tools a company approves, its policy) never live in
 * this public repository; they arrive in the profile.
 */

import { BlobServiceClient, type ContainerClient, RestError } from "@azure/storage-blob";
import { ConflictError, NotFoundError, ServiceUnavailableError } from "./http";

const CONTAINER = "kreweaim";
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlatformRef {
  key: string;
  label: string;
}

/** What the engine publishes for one person. */
export interface LearnerProfile {
  schema: number;
  built: string;
  company: string;
  givenName: string;
  role: { title: string; family: string; department: string };
  vertical: string;
  /** AI tools this person has and may be coached on (licensed, rostered, approved). */
  platforms: PlatformRef[];
  /** Tools the company has not approved: never taught, only steered away from. */
  unapprovedReported: string[];
  /** Tools coming later, with the company's note. */
  planned: Record<string, string>;
  /** The person's own agent, when the company runs Krewe agents. */
  agent: { agent: string; channel: string } | null;
  apps: string[];
  /** The company's AI rules, in plain sentences. */
  policy: string[];
  /** NOIT-written guidance that matches this person: grounding, not a script. */
  guidance: Array<{ id: string; title: string; platform: string; summary: string }>;
}

export interface QuizQuestion {
  id: string;
  platform: string;
  question: string;
  choices: string[];
}

export interface StoredQuizQuestion extends QuizQuestion {
  answer: number;
  explanation: string;
}

export interface Lesson {
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
  model: string;
  status: "new" | "done";
  feedback: "helped" | "not_helpful" | null;
  note: string | null;
}

export interface LearnerState {
  quiz: {
    /** Tools this check covered; a tool added to the profile later gets its own short check. */
    platforms?: string[];
    questions: StoredQuizQuestion[];
    createdAt: string;
    completedAt: string | null;
    answers: Record<string, number>;
    selfRating: Record<string, number>;
  } | null;
  /** 1 (new to it) .. 4 (power user), per platform key. */
  skill: Record<string, number>;
  lessons: Lesson[];
}

export const EMPTY_STATE: LearnerState = { quiz: null, skill: {}, lessons: [] };

let containerPromise: Promise<ContainerClient> | null = null;

function connection(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.KREWEAIM_STORAGE_CONNECTION || env.CONTRACTS_STORAGE_CONNECTION || env.CDK_STORAGE_CONNECTION;
}

async function container(): Promise<ContainerClient> {
  const conn = connection();
  if (!conn) throw new ServiceUnavailableError("KreweAIM storage is not configured.");
  if (!containerPromise) {
    containerPromise = (async () => {
      const c = BlobServiceClient.fromConnectionString(conn).getContainerClient(CONTAINER);
      await c.createIfNotExists();
      return c;
    })();
    containerPromise.catch(() => (containerPromise = null));
  }
  return containerPromise;
}

export function learnerPath(tenantId: string, userId: string, file: "profile" | "state"): string {
  if (!GUID_RE.test(tenantId) || !GUID_RE.test(userId)) throw new NotFoundError("Unknown learner.");
  return `learners/${tenantId.toLowerCase()}/${userId.toLowerCase()}/${file}.json`;
}

async function read<T>(path: string): Promise<{ value: T; etag: string } | null> {
  const blob = (await container()).getBlockBlobClient(path);
  try {
    // One request, so the ETag always belongs to the content that was read.
    const response = await blob.download();
    const chunks: Buffer[] = [];
    for await (const chunk of response.readableStreamBody as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as T, etag: response.etag ?? "" };
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return null;
    throw err;
  }
}

export async function readProfile(tenantId: string, userId: string): Promise<LearnerProfile | null> {
  return (await read<LearnerProfile>(learnerPath(tenantId, userId, "profile")))?.value ?? null;
}

export async function readState(tenantId: string, userId: string): Promise<{ state: LearnerState; etag: string | null }> {
  const found = await read<LearnerState>(learnerPath(tenantId, userId, "state"));
  return found ? { state: { ...EMPTY_STATE, ...found.value }, etag: found.etag } : { state: structuredClone(EMPTY_STATE), etag: null };
}

/** Write state only if nobody else changed it since it was read. */
export async function writeState(tenantId: string, userId: string, state: LearnerState, etag: string | null): Promise<void> {
  const blob = (await container()).getBlockBlobClient(learnerPath(tenantId, userId, "state"));
  const body = JSON.stringify(state);
  try {
    await blob.upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: "application/json" },
      conditions: etag ? { ifMatch: etag } : { ifNoneMatch: "*" },
    });
  } catch (err) {
    if (err instanceof RestError && (err.statusCode === 412 || err.statusCode === 409)) {
      throw new ConflictError("Your KreweAIM changed in another window. Reload and try again.");
    }
    throw err;
  }
}
