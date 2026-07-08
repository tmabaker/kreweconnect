/**
 * Graph-direct user administration: the operations the techtools Users /
 * OOO / Vacation pages currently route through CIPP. Each function is one
 * app-only Graph call (plus follow-ups where Graph requires them), using
 * the cached per-tenant token — no CIPP middleman.
 */

import { randomInt } from "node:crypto";
import { graphRequest, fetchUserById, type GraphUser } from "./graphClient";
import { BadRequestError } from "./http";

/* ── password generation ────────────────────────────────────────────── */

// No ambiguous characters (0/O, 1/l/I); always includes each class.
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYMBOL = "!@#$%&*-+?";

export function generatePassword(length = 16): string {
  const all = LOWER + UPPER + DIGIT + SYMBOL;
  const chars = [
    LOWER[randomInt(LOWER.length)],
    UPPER[randomInt(UPPER.length)],
    DIGIT[randomInt(DIGIT.length)],
    SYMBOL[randomInt(SYMBOL.length)],
  ];
  while (chars.length < length) {
    chars.push(all[randomInt(all.length)]);
  }
  // Fisher–Yates so the guaranteed classes aren't always at the front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/* ── create / update ────────────────────────────────────────────────── */

/** Profile fields accepted on create and update, passed through verbatim. */
const PROFILE_FIELDS = [
  "displayName",
  "givenName",
  "surname",
  "jobTitle",
  "department",
  "companyName",
  "officeLocation",
  "mobilePhone",
  "businessPhones",
  "usageLocation",
  "streetAddress",
  "city",
  "state",
  "postalCode",
  "country",
  "accountEnabled",
] as const;

function pickProfileFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    if (input[field] !== undefined) out[field] = input[field];
  }
  return out;
}

export interface CreateUserResult {
  user: GraphUser;
  /** Generated only when the caller didn't supply one */
  password: string;
  licenseWarning?: string;
}

export async function createUser(
  tenantId: string,
  input: Record<string, unknown>
): Promise<CreateUserResult> {
  const userPrincipalName = input.userPrincipalName;
  const displayName = input.displayName;
  if (typeof userPrincipalName !== "string" || !userPrincipalName.includes("@")) {
    throw new BadRequestError("userPrincipalName (user@domain) is required.");
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new BadRequestError("displayName is required.");
  }

  const password =
    typeof input.password === "string" && input.password ? input.password : generatePassword();

  const body: Record<string, unknown> = {
    ...pickProfileFields(input),
    accountEnabled: input.accountEnabled !== false,
    userPrincipalName,
    mailNickname:
      typeof input.mailNickname === "string" && input.mailNickname
        ? input.mailNickname
        : userPrincipalName.split("@")[0],
    passwordProfile: {
      password,
      forceChangePasswordNextSignIn: input.forceChangePasswordNextSignIn !== false,
    },
  };
  // License assignment requires usageLocation; default to US when omitted.
  if (!body.usageLocation) body.usageLocation = "US";

  const created = (await graphRequest<GraphUser>(tenantId, "POST", "/users", body))!;

  let licenseWarning: string | undefined;
  const skuIds = Array.isArray(input.licenseSkuIds)
    ? input.licenseSkuIds.filter((s): s is string => typeof s === "string")
    : [];
  if (skuIds.length > 0) {
    try {
      await setUserLicenses(tenantId, created.id, skuIds, []);
    } catch (err) {
      // User exists at this point — report the license failure, don't fail the call.
      licenseWarning = `User created, but license assignment failed: ${
        err instanceof Error ? err.message : "unknown error"
      }`;
    }
  }

  if (typeof input.managerId === "string" && input.managerId) {
    await graphRequest(tenantId, "PUT", `/users/${encodeURIComponent(created.id)}/manager/$ref`, {
      "@odata.id": `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.managerId)}`,
    });
  }

  return { user: created, password, licenseWarning };
}

export async function updateUser(
  tenantId: string,
  userId: string,
  input: Record<string, unknown>
): Promise<GraphUser> {
  const patch = pickProfileFields(input);
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError("No updatable fields in request body.");
  }
  await graphRequest(tenantId, "PATCH", `/users/${encodeURIComponent(userId)}`, patch);
  if (typeof input.managerId === "string" && input.managerId) {
    await graphRequest(tenantId, "PUT", `/users/${encodeURIComponent(userId)}/manager/$ref`, {
      "@odata.id": `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.managerId)}`,
    });
  }
  return fetchUserById(tenantId, userId);
}

/* ── password / sessions ────────────────────────────────────────────── */

export async function resetPassword(
  tenantId: string,
  userId: string,
  input: Record<string, unknown>
): Promise<{ password: string; forceChangePasswordNextSignIn: boolean }> {
  const password =
    typeof input.password === "string" && input.password ? input.password : generatePassword();
  const forceChange = input.forceChangePasswordNextSignIn !== false;
  await graphRequest(tenantId, "PATCH", `/users/${encodeURIComponent(userId)}`, {
    passwordProfile: { password, forceChangePasswordNextSignIn: forceChange },
  });
  return { password, forceChangePasswordNextSignIn: forceChange };
}

export async function revokeSessions(tenantId: string, userId: string): Promise<void> {
  await graphRequest(tenantId, "POST", `/users/${encodeURIComponent(userId)}/revokeSignInSessions`);
}

/* ── temporary access pass ──────────────────────────────────────────── */

export interface TapInput {
  /** 10–43200 minutes (Graph limits); defaults to 60. */
  lifetimeInMinutes?: number;
  /** One-time use (default) vs reusable within the lifetime. */
  isUsableOnce?: boolean;
  /** Optional ISO start time; omit to start now. */
  startDateTime?: string;
}

export interface TapResult {
  id: string;
  temporaryAccessPass: string;
  lifetimeInMinutes: number;
  isUsableOnce: boolean;
  startDateTime: string;
  methodUsabilityReason?: string;
}

export async function createTemporaryAccessPass(
  tenantId: string,
  userId: string,
  input: TapInput
): Promise<TapResult> {
  let lifetime = typeof input.lifetimeInMinutes === "number" ? input.lifetimeInMinutes : 60;
  // Clamp to Graph's accepted range rather than letting a 400 bubble up opaquely.
  lifetime = Math.max(10, Math.min(43200, Math.round(lifetime)));
  const body: Record<string, unknown> = {
    lifetimeInMinutes: lifetime,
    isUsableOnce: input.isUsableOnce ?? true,
  };
  if (input.startDateTime) body.startDateTime = input.startDateTime;
  const res = await graphRequest<TapResult>(
    tenantId,
    "POST",
    `/users/${encodeURIComponent(userId)}/authentication/temporaryAccessPassMethods`,
    body
  );
  return res!;
}

/* ── licenses ───────────────────────────────────────────────────────── */

export interface SubscribedSku {
  skuId: string;
  skuPartNumber: string;
  prepaidUnits: { enabled: number; suspended: number; warning: number };
  consumedUnits: number;
}

export async function listLicenses(tenantId: string): Promise<SubscribedSku[]> {
  const response = await graphRequest<{ value: SubscribedSku[] }>(
    tenantId,
    "GET",
    "/subscribedSkus?$select=skuId,skuPartNumber,prepaidUnits,consumedUnits"
  );
  return response?.value ?? [];
}

export async function setUserLicenses(
  tenantId: string,
  userId: string,
  addSkuIds: string[],
  removeSkuIds: string[]
): Promise<void> {
  await graphRequest(tenantId, "POST", `/users/${encodeURIComponent(userId)}/assignLicense`, {
    addLicenses: addSkuIds.map((skuId) => ({ skuId, disabledPlans: [] })),
    removeLicenses: removeSkuIds,
  });
}

/* ── out-of-office (mailbox auto-reply) ─────────────────────────────── */

export interface AutoReplyInput {
  /** "disabled" | "alwaysEnabled" | "scheduled" */
  status: string;
  internalMessage?: string;
  externalMessage?: string;
  /** ISO 8601 date-times; required when status is "scheduled" */
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
}

const AUTOREPLY_STATUSES = ["disabled", "alwaysEnabled", "scheduled"];

export async function getMailboxSettings(tenantId: string, userId: string): Promise<unknown> {
  return graphRequest(tenantId, "GET", `/users/${encodeURIComponent(userId)}/mailboxSettings`);
}

export async function setAutoReply(
  tenantId: string,
  userId: string,
  input: AutoReplyInput
): Promise<unknown> {
  if (!AUTOREPLY_STATUSES.includes(input.status)) {
    throw new BadRequestError(`status must be one of: ${AUTOREPLY_STATUSES.join(", ")}`);
  }
  const setting: Record<string, unknown> = {
    status: input.status,
    externalAudience: "all",
  };
  if (input.internalMessage !== undefined) setting.internalReplyMessage = input.internalMessage;
  if (input.externalMessage !== undefined) setting.externalReplyMessage = input.externalMessage;
  if (input.status === "scheduled") {
    if (!input.startDateTime || !input.endDateTime) {
      throw new BadRequestError("scheduled auto-reply requires startDateTime and endDateTime.");
    }
    const timeZone = input.timeZone || "UTC";
    setting.scheduledStartDateTime = { dateTime: input.startDateTime, timeZone };
    setting.scheduledEndDateTime = { dateTime: input.endDateTime, timeZone };
  }
  return graphRequest(tenantId, "PATCH", `/users/${encodeURIComponent(userId)}/mailboxSettings`, {
    automaticRepliesSetting: setting,
  });
}

/* ── conditional access exclusions (OOO / vacation flows) ───────────── */

export interface CaPolicySummary {
  id: string;
  displayName: string;
  state: string;
  excludedUsers: string[];
}

interface CaPolicy {
  id: string;
  displayName: string;
  state: string;
  conditions: {
    users?: {
      excludeUsers?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export async function listCaPolicies(tenantId: string): Promise<CaPolicySummary[]> {
  const response = await graphRequest<{ value: CaPolicy[] }>(
    tenantId,
    "GET",
    "/identity/conditionalAccess/policies?$select=id,displayName,state,conditions"
  );
  return (response?.value ?? []).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    state: p.state,
    excludedUsers: p.conditions?.users?.excludeUsers ?? [],
  }));
}

/** Add or remove a user from a CA policy's excludeUsers list. */
export async function setCaExclusion(
  tenantId: string,
  policyId: string,
  userId: string,
  action: "add" | "remove"
): Promise<CaPolicySummary> {
  const policy = await graphRequest<CaPolicy>(
    tenantId,
    "GET",
    `/identity/conditionalAccess/policies/${encodeURIComponent(policyId)}`
  );
  if (!policy) {
    throw new BadRequestError(`Conditional access policy ${policyId} not found.`);
  }

  const current = policy.conditions?.users?.excludeUsers ?? [];
  const has = current.some((u) => u.toLowerCase() === userId.toLowerCase());
  let excludeUsers = current;
  if (action === "add" && !has) {
    excludeUsers = [...current, userId];
  } else if (action === "remove" && has) {
    excludeUsers = current.filter((u) => u.toLowerCase() !== userId.toLowerCase());
  }

  if (excludeUsers !== current) {
    await graphRequest(
      tenantId,
      "PATCH",
      `/identity/conditionalAccess/policies/${encodeURIComponent(policyId)}`,
      { conditions: { ...policy.conditions, users: { ...policy.conditions.users, excludeUsers } } }
    );
  }

  return {
    id: policy.id,
    displayName: policy.displayName,
    state: policy.state,
    excludedUsers: excludeUsers,
  };
}
