/**
 * App-only Microsoft Graph client, scoped per tenant.
 * Mirrors the field selection the SPA's graphService uses.
 */

import { getAppToken } from "./tokenService";
import { config, selectFieldForAttribute, readAttribute } from "./config";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Base fields are always selectable with User.Read.All.
const USER_SELECT_BASE = [
  "id",
  "displayName",
  "givenName",
  "surname",
  "jobTitle",
  "department",
  "officeLocation",
  "mail",
  "businessPhones",
  "mobilePhone",
  "userPrincipalName",
  "accountEnabled",
  "companyName",
  "userType",
  "assignedLicenses",
  "usageLocation",
];

// Optional fields may be unreadable/unselectable depending on tenant + the
// app's permissions (e.g. birthday). If selecting them 400s, we fall back to
// the base list so the directory never breaks because of an optional field.
const USER_SELECT_OPTIONAL = ["employeeHireDate", "birthday"];

const USER_SELECT_FIELDS_BASE = USER_SELECT_BASE.join(",");

/**
 * Extended $select: base + standard optional fields + any configured custom
 * birthday/anniversary attributes (directory extension or extensionAttributeN).
 * Built per-call so the BIRTHDAY_ATTRIBUTE / ANNIVERSARY_ATTRIBUTE app settings
 * take effect without a code change.
 */
function buildExtendedSelect(): string {
  const fields = [...USER_SELECT_BASE, ...USER_SELECT_OPTIONAL];
  for (const attr of [config.birthdayAttribute, config.anniversaryAttribute]) {
    const f = selectFieldForAttribute(attr);
    if (f && !fields.includes(f)) fields.push(f);
  }
  return fields.join(",");
}

export const USER_SELECT_FIELDS = buildExtendedSelect();

/** Overlay configured custom attributes onto the birthday/hireDate fields. */
function resolveCustomAttributes(user: GraphUser): void {
  const rec = user as unknown as Record<string, unknown>;
  if (config.birthdayAttribute) {
    user.birthday = readAttribute(rec, config.birthdayAttribute) ?? user.birthday ?? null;
  }
  if (config.anniversaryAttribute) {
    user.employeeHireDate = readAttribute(rec, config.anniversaryAttribute) ?? user.employeeHireDate ?? null;
  }
}

const MANAGER_EXPAND = "manager($select=id,displayName)";

/**
 * License SKUs that mark a sign-in account for shared hardware, not a person:
 * Teams Shared Devices (common-area phones — breakrooms, kitchens) and Teams
 * Rooms (conference-room devices). These accounts are licensed and enabled by
 * design, so the licensed-members filter alone can't catch them.
 */
const DEVICE_LICENSE_SKUS = new Set([
  "295a8eb0-f78d-45c7-8b5b-1eed5ed02dff", // Microsoft Teams Shared Devices (MCOCAP)
  "6af4b3d6-14bb-4a2a-960c-6c902aad34f3", // Microsoft Teams Rooms Basic
  "4cde982a-ede4-4409-9ae6-b003453c8ea6", // Microsoft Teams Rooms Pro
  "6070a4c8-34c6-4937-8dfb-39bbc6397a60", // Meeting Room (legacy Teams Rooms Standard)
]);

/**
 * Directory/org-chart inclusion rule: enabled licensed members only, minus
 * guests, shared-device sign-ins (Teams phones/rooms), nameless utility
 * accounts, and anything listed in the DIRECTORY_EXCLUDE app setting.
 */
function isDirectoryPerson(u: GraphUser): boolean {
  if ((u.userType ?? "Member").toLowerCase() === "guest") return false;
  const licenses = u.assignedLicenses ?? [];
  if (licenses.length === 0) return false;
  if (licenses.some((l) => DEVICE_LICENSE_SKUS.has((l.skuId || "").toLowerCase()))) return false;
  // Utility/service accounts (scanners, integrations, shared calendars) are
  // often licensed but nameless; a person has at least a surname or a title.
  if (!u.surname && !u.jobTitle) return false;
  const excluded = config.directoryExclusions;
  if (
    excluded.size > 0 &&
    (excluded.has((u.userPrincipalName || "").toLowerCase()) ||
      excluded.has((u.id || "").toLowerCase()))
  ) {
    return false;
  }
  return true;
}

export class GraphRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GraphRequestError";
    this.status = status;
    this.code = code;
  }
}

interface GraphPagedResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/**
 * Generic Graph request for write operations (and reads that need a
 * non-GET verb). `path` is relative to the v1.0 base, e.g. "/users".
 * Returns the parsed JSON body, or null on 204 No Content.
 */
export async function graphRequest<T = unknown>(
  tenantId: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T | null> {
  const token = await getAppToken(tenantId);
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new GraphRequestError(
      response.status,
      errBody.error?.code || "graph_error",
      errBody.error?.message || `Graph API error: ${response.status}`
    );
  }
  if (response.status === 204) return null;
  return (await response.json()) as T;
}

async function graphFetch<T>(tenantId: string, url: string): Promise<T> {
  const token = await getAppToken(tenantId);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ConsistencyLevel: "eventual",
    },
  });

  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    let parsed: { error?: { code?: string; message?: string } } = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      /* non-JSON body */
    }
    const gcode = parsed.error?.code || "graph_error";
    const gmsg = parsed.error?.message || rawBody.slice(0, 300) || "(no error body)";
    const reqId = response.headers.get("request-id") || response.headers.get("client-request-id") || "";
    throw new GraphRequestError(
      response.status,
      gcode,
      `Graph ${response.status} ${gcode}: ${gmsg}${reqId ? ` [request-id ${reqId}]` : ""}`
    );
  }
  return response.json() as Promise<T>;
}

export interface GraphUser {
  id: string;
  displayName: string;
  givenName: string | null;
  surname: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  mail: string | null;
  businessPhones: string[];
  mobilePhone: string | null;
  userPrincipalName: string;
  accountEnabled: boolean;
  /** "Member" or "Guest" — guests are excluded from the directory. */
  userType?: string | null;
  /** Assigned M365 licenses; a non-empty list marks an actual licensed user. */
  assignedLicenses?: Array<{ skuId: string }>;
  /** Per-employee company (e.g. physical location); distinct from the tenant */
  companyName?: string | null;
  /** Work anniversary source; may be null/unset or a 1604 sentinel in Graph */
  employeeHireDate?: string | null;
  /** Birthday; only the month/day is surfaced. May be null/unset in Graph */
  birthday?: string | null;
  manager?: { id: string; displayName: string } | null;
  /** Set only in the aggregated "all clients" response — the source tenant */
  tenantId?: string;
  tenantDisplayName?: string;
}

async function fetchUsersWithSelect(tenantId: string, select: string): Promise<GraphUser[]> {
  const users: GraphUser[] = [];
  let url = `${GRAPH_BASE}/users?$select=${select}&$expand=${MANAGER_EXPAND}&$top=999&$filter=accountEnabled eq true&$count=true`;
  while (url) {
    const page = await graphFetch<GraphPagedResponse<GraphUser>>(tenantId, url);
    users.push(...page.value);
    url = page["@odata.nextLink"] || "";
  }
  return users;
}

export async function fetchUsers(tenantId: string): Promise<GraphUser[]> {
  let allUsers: GraphUser[];
  try {
    allUsers = await fetchUsersWithSelect(tenantId, buildExtendedSelect());
  } catch (err) {
    // An optional $select field (e.g. birthday) may be unsupported for this
    // app/tenant — retry with only the always-safe base fields rather than
    // letting one optional column take down the whole directory.
    if (err instanceof GraphRequestError && (err.status === 400 || err.status === 404)) {
      allUsers = await fetchUsersWithSelect(tenantId, USER_SELECT_FIELDS_BASE);
    } else {
      throw err;
    }
  }

  for (const user of allUsers) {
    if (user.manager && typeof user.manager === "object") {
      user.manager = {
        id: user.manager.id || "",
        displayName: user.manager.displayName || "",
      };
    }
    resolveCustomAttributes(user);
  }

  return allUsers.filter(isDirectoryPerson);
}

/**
 * Unfiltered user list for the MSP admin pages (modify/remove/passwords/OOO):
 * includes disabled, unlicensed, and guest accounts — an offboarding target is
 * often exactly the account the directory view hides.
 */
export async function fetchUsersAdmin(tenantId: string): Promise<GraphUser[]> {
  const users: GraphUser[] = [];
  let url = `${GRAPH_BASE}/users?$select=${USER_SELECT_FIELDS_BASE}&$expand=${MANAGER_EXPAND}&$top=999`;
  while (url) {
    const page = await graphFetch<GraphPagedResponse<GraphUser>>(tenantId, url);
    users.push(...page.value);
    url = page["@odata.nextLink"] || "";
  }
  for (const user of users) {
    if (user.manager && typeof user.manager === "object") {
      user.manager = {
        id: user.manager.id || "",
        displayName: user.manager.displayName || "",
      };
    }
  }
  return users;
}

/**
 * Aggregate users across multiple client tenants for the MSP "all clients"
 * view. Each user is tagged with its source tenant. Tenants that fail (not
 * consented, secret issue, etc.) are skipped so one bad tenant can't break the
 * whole view.
 */
export async function fetchUsersAllTenants(
  tenants: Array<{ id: string; name: string }>
): Promise<GraphUser[]> {
  const all: GraphUser[] = [];
  await Promise.all(
    tenants.map(async (t) => {
      try {
        const users = await fetchUsers(t.id);
        for (const u of users) {
          u.tenantId = t.id;
          u.tenantDisplayName = t.name;
        }
        all.push(...users);
      } catch {
        // tenant not reachable/consented — skip it
      }
    })
  );
  all.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  return all;
}

export async function fetchUserById(tenantId: string, userId: string): Promise<GraphUser> {
  const path = (select: string) =>
    `${GRAPH_BASE}/users/${encodeURIComponent(userId)}?$select=${select}&$expand=${MANAGER_EXPAND}`;
  let user: GraphUser;
  try {
    user = await graphFetch<GraphUser>(tenantId, path(buildExtendedSelect()));
  } catch (err) {
    if (err instanceof GraphRequestError && (err.status === 400 || err.status === 404)) {
      user = await graphFetch<GraphUser>(tenantId, path(USER_SELECT_FIELDS_BASE));
    } else {
      throw err;
    }
  }
  resolveCustomAttributes(user);
  return user;
}

export async function fetchDirectReports(
  tenantId: string,
  userId: string
): Promise<Array<{ id: string; displayName: string; jobTitle: string | null }>> {
  const response = await graphFetch<
    GraphPagedResponse<{ id: string; displayName: string; jobTitle: string | null }>
  >(
    tenantId,
    `${GRAPH_BASE}/users/${encodeURIComponent(userId)}/directReports?$select=id,displayName,jobTitle`
  );
  return response.value;
}

/** Returns the photo bytes + content type, or null if the user has no photo. */
export async function fetchUserPhoto(
  tenantId: string,
  userId: string
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const token = await getAppToken(tenantId);
  const response = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(userId)}/photo/$value`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) return null;
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "image/jpeg",
  };
}
