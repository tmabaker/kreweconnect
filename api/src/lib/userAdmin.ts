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

/* ── group membership (Modify User page) ────────────────────────────── */

const GROUP_SELECT =
  "id,displayName,description,groupTypes,mailEnabled,securityEnabled,onPremisesSyncEnabled,isAssignableToRole";

export interface GroupInfo {
  id: string;
  displayName: string;
  description?: string | null;
  groupTypes?: string[];
  mailEnabled?: boolean;
  securityEnabled?: boolean;
  /** False when Graph can't change this group's membership; reason says why. */
  manageable: boolean;
  reason?: string;
}

/**
 * Whether Graph can change the group's membership, mirroring the skip rules
 * offboarding applies. The reason is display text for the tool pages.
 */
function groupManageability(g: MemberGroup): { manageable: boolean; reason?: string } {
  const isDynamic = (g.groupTypes ?? []).includes("DynamicMembership");
  const isUnified = (g.groupTypes ?? []).includes("Unified");
  if (isDynamic) return { manageable: false, reason: "dynamic membership — edit the membership rule instead" };
  if (g.onPremisesSyncEnabled) return { manageable: false, reason: "synced from on-prem AD" };
  if (g.isAssignableToRole)
    return { manageable: false, reason: "role-assignable group — change membership in the Entra portal" };
  if (g.mailEnabled && !isUnified)
    return {
      manageable: false,
      reason: "Exchange distribution/mail-enabled security group — change membership in Exchange admin or CIPP",
    };
  return { manageable: true };
}

function toGroupInfo(g: MemberGroup & { description?: string | null }): GroupInfo {
  const m = groupManageability(g);
  return {
    id: g.id,
    displayName: g.displayName,
    description: g.description ?? null,
    groupTypes: g.groupTypes ?? [],
    mailEnabled: g.mailEnabled ?? false,
    securityEnabled: g.securityEnabled ?? false,
    manageable: m.manageable,
    reason: m.reason,
  };
}

function byDisplayName(a: GroupInfo, b: GroupInfo): number {
  return a.displayName.localeCompare(b.displayName);
}

/** All groups in the tenant, flagged with whether Graph can edit membership. */
export async function listGroups(tenantId: string): Promise<GroupInfo[]> {
  const groups: MemberGroup[] = [];
  let path = `/groups?$select=${GROUP_SELECT}&$top=999`;
  while (path) {
    const page = await graphRequest<{ value: MemberGroup[]; "@odata.nextLink"?: string }>(
      tenantId,
      "GET",
      path
    );
    groups.push(...(page?.value ?? []));
    path = (page?.["@odata.nextLink"] || "").replace("https://graph.microsoft.com/v1.0", "");
  }
  return groups.map(toGroupInfo).sort(byDisplayName);
}

/** The user's direct group memberships. */
export async function listUserGroups(tenantId: string, userId: string): Promise<GroupInfo[]> {
  const response = await graphRequest<{ value: MemberGroup[] }>(
    tenantId,
    "GET",
    `/users/${encodeURIComponent(userId)}/memberOf/microsoft.graph.group?$select=${GROUP_SELECT}&$top=999`
  );
  return (response?.value ?? []).map(toGroupInfo).sort(byDisplayName);
}

export interface GroupChangeResult {
  id: string;
  displayName: string;
  action: "add" | "remove";
  ok: boolean;
  detail: string;
}

/**
 * Add/remove the user to/from the given groups, one result per group —
 * a failure on one group must not abandon the rest.
 */
export async function setUserGroups(
  tenantId: string,
  userId: string,
  add: string[],
  remove: string[]
): Promise<GroupChangeResult[]> {
  const results: GroupChangeResult[] = [];
  const apply = async (groupId: string, action: "add" | "remove") => {
    let name = groupId;
    try {
      const g = await graphRequest<MemberGroup>(
        tenantId,
        "GET",
        `/groups/${encodeURIComponent(groupId)}?$select=${GROUP_SELECT}`
      );
      if (!g) throw new Error("Group not found.");
      name = g.displayName || groupId;
      const m = groupManageability(g);
      if (!m.manageable) throw new Error(`Can't change membership: ${m.reason}.`);
      if (action === "add") {
        await graphRequest(tenantId, "POST", `/groups/${encodeURIComponent(groupId)}/members/$ref`, {
          "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${encodeURIComponent(userId)}`,
        });
        results.push({ id: groupId, displayName: name, action, ok: true, detail: "Added." });
      } else {
        await graphRequest(
          tenantId,
          "DELETE",
          `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/$ref`
        );
        results.push({ id: groupId, displayName: name, action, ok: true, detail: "Removed." });
      }
    } catch (err) {
      results.push({ id: groupId, displayName: name, action, ok: false, detail: errMessage(err) });
    }
  };
  for (const id of add) await apply(id, "add");
  for (const id of remove) await apply(id, "remove");
  return results;
}

/* ── offboarding (the techtools Remove User page) ───────────────────── */

export interface OffboardOptions {
  disableUser?: boolean;
  revokeSessions?: boolean;
  removeLicenses?: boolean;
  removeGroups?: boolean;
  hideFromGal?: boolean;
  setAutoReply?: boolean;
  autoReplyMessage?: string;
  /** Email address to redirect incoming mail to (inbox rule; original stays). */
  forwardTo?: string;
  deleteUser?: boolean;
}

export interface OffboardActionResult {
  action: string;
  ok: boolean;
  detail: string;
}

interface MemberGroup {
  id: string;
  displayName: string;
  groupTypes?: string[];
  mailEnabled?: boolean;
  securityEnabled?: boolean;
  onPremisesSyncEnabled?: boolean | null;
  isAssignableToRole?: boolean | null;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Remove the user from every group Graph can manage. Dynamic groups,
 * on-prem-synced groups, and Exchange-managed groups (distribution lists,
 * mail-enabled security) can't be edited through Graph — those are reported,
 * not silently skipped.
 */
async function removeFromAllGroups(tenantId: string, userId: string): Promise<string> {
  const response = await graphRequest<{ value: MemberGroup[] }>(
    tenantId,
    "GET",
    `/users/${encodeURIComponent(userId)}/memberOf/microsoft.graph.group` +
      "?$select=id,displayName,groupTypes,mailEnabled,securityEnabled,onPremisesSyncEnabled,isAssignableToRole&$top=999"
  );
  const groups = response?.value ?? [];
  if (groups.length === 0) return "Not a member of any groups.";

  const removed: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const g of groups) {
    // Membership of role-assignable groups can only be changed by callers
    // holding RoleManagement.ReadWrite.Directory — Group.ReadWrite.All is
    // rejected by design (the group can carry admin roles).
    const m = groupManageability(g);
    if (!m.manageable) {
      skipped.push(`${g.displayName} (${m.reason})`);
      continue;
    }
    try {
      await graphRequest(
        tenantId,
        "DELETE",
        `/groups/${g.id}/members/${encodeURIComponent(userId)}/$ref`
      );
      removed.push(g.displayName);
    } catch (err) {
      failed.push(`${g.displayName}: ${errMessage(err)}`);
    }
  }

  const parts = [`Removed from ${removed.length} of ${groups.length} groups.`];
  if (skipped.length) parts.push(`Skipped: ${skipped.join("; ")}.`);
  if (failed.length) parts.push(`Failed: ${failed.join("; ")}.`);
  if (failed.length) throw new Error(parts.join(" "));
  return parts.join(" ");
}

/** Redirect all incoming mail via an inbox rule (needs MailboxSettings.ReadWrite). */
async function forwardMail(tenantId: string, userId: string, forwardTo: string): Promise<string> {
  await graphRequest(
    tenantId,
    "POST",
    `/users/${encodeURIComponent(userId)}/mailFolders/inbox/messageRules`,
    {
      displayName: "NOIT offboarding — forward mail",
      sequence: 1,
      isEnabled: true,
      actions: {
        redirectTo: [{ emailAddress: { address: forwardTo } }],
        stopProcessingRules: false,
      },
    }
  );
  return `Inbox rule created: all mail redirects to ${forwardTo} (a copy stays in the mailbox).`;
}

async function removeAllLicenses(tenantId: string, userId: string): Promise<string> {
  const user = await graphRequest<{ assignedLicenses?: Array<{ skuId: string }> }>(
    tenantId,
    "GET",
    `/users/${encodeURIComponent(userId)}?$select=assignedLicenses`
  );
  const skuIds = (user?.assignedLicenses ?? []).map((l) => l.skuId);
  if (skuIds.length === 0) return "No licenses assigned.";
  await setUserLicenses(tenantId, userId, [], skuIds);
  return `Removed ${skuIds.length} license(s). (Group-assigned licenses must be removed from the assigning group.)`;
}

/**
 * Run the requested offboarding actions in a sensible order, collecting a
 * per-action result instead of failing the whole call on the first error —
 * by the time something fails, earlier actions have already happened.
 */
export async function offboardUser(
  tenantId: string,
  userId: string,
  options: OffboardOptions
): Promise<OffboardActionResult[]> {
  const results: OffboardActionResult[] = [];
  const run = async (action: string, fn: () => Promise<string>) => {
    try {
      results.push({ action, ok: true, detail: await fn() });
    } catch (err) {
      results.push({ action, ok: false, detail: errMessage(err) });
    }
  };

  if (options.disableUser) {
    await run("Block sign-in", async () => {
      try {
        await graphRequest(tenantId, "PATCH", `/users/${encodeURIComponent(userId)}`, {
          accountEnabled: false,
        });
      } catch (err) {
        // Disabling accounts needs the User.EnableDisableAccount.All app role
        // (User.ReadWrite.All alone is not enough), and privileged users
        // (admins / members of role-assignable groups) can't be disabled
        // app-only at all. Make the raw "Insufficient privileges" actionable.
        if (errMessage(err).includes("Insufficient privileges")) {
          throw new Error(
            "Insufficient privileges — the tenant needs to re-consent the app (adds the " +
              "User.EnableDisableAccount.All permission), and admins/members of " +
              "role-assignable groups must be disabled in the Entra portal."
          );
        }
        throw err;
      }
      return "Account disabled.";
    });
  }
  if (options.revokeSessions) {
    await run("Revoke sessions", async () => {
      await revokeSessions(tenantId, userId);
      return "All sign-in sessions revoked.";
    });
  }
  if (options.hideFromGal) {
    await run("Hide from GAL", async () => {
      // Graph only honors showInAddressList for cloud-only accounts; when it
      // refuses, the Exchange admin center / CIPP is the fallback.
      await graphRequest(tenantId, "PATCH", `/users/${encodeURIComponent(userId)}`, {
        showInAddressList: false,
      });
      return "Hidden from the Global Address List.";
    });
  }
  if (options.setAutoReply) {
    await run("Set Out of Office", async () => {
      await setAutoReply(tenantId, userId, {
        status: "alwaysEnabled",
        internalMessage: options.autoReplyMessage || "",
        externalMessage: options.autoReplyMessage || "",
      });
      return "Auto-reply enabled.";
    });
  }
  if (options.forwardTo) {
    await run("Forward email", () => forwardMail(tenantId, userId, options.forwardTo!));
  }
  if (options.removeGroups) {
    await run("Remove from groups", () => removeFromAllGroups(tenantId, userId));
  }
  if (options.removeLicenses) {
    await run("Remove licenses", () => removeAllLicenses(tenantId, userId));
  }
  if (options.deleteUser) {
    await run("Delete user", async () => {
      await graphRequest(tenantId, "DELETE", `/users/${encodeURIComponent(userId)}`);
      return "User deleted (recoverable from Entra deleted users for 30 days).";
    });
  }
  return results;
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
