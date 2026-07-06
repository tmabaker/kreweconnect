/**
 * App-only Microsoft Graph client, scoped per tenant.
 * Mirrors the field selection the SPA's graphService uses.
 */

import { getAppToken } from "./tokenService";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const USER_SELECT_FIELDS = [
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
].join(",");

const MANAGER_EXPAND = "manager($select=id,displayName)";

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
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new GraphRequestError(
      response.status,
      body.error?.code || "graph_error",
      body.error?.message || `Graph API error: ${response.status}`
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
  manager?: { id: string; displayName: string } | null;
  /** Set only in the aggregated "all clients" response — the source tenant */
  tenantId?: string;
  tenantDisplayName?: string;
}

export async function fetchUsers(tenantId: string): Promise<GraphUser[]> {
  const allUsers: GraphUser[] = [];
  let url = `${GRAPH_BASE}/users?$select=${USER_SELECT_FIELDS}&$expand=${MANAGER_EXPAND}&$top=999&$filter=accountEnabled eq true&$count=true`;

  while (url) {
    const page = await graphFetch<GraphPagedResponse<GraphUser>>(tenantId, url);
    allUsers.push(...page.value);
    url = page["@odata.nextLink"] || "";
  }

  for (const user of allUsers) {
    if (user.manager && typeof user.manager === "object") {
      user.manager = {
        id: user.manager.id || "",
        displayName: user.manager.displayName || "",
      };
    }
  }
  return allUsers;
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
  return graphFetch<GraphUser>(
    tenantId,
    `${GRAPH_BASE}/users/${encodeURIComponent(userId)}?$select=${USER_SELECT_FIELDS}&$expand=${MANAGER_EXPAND}`
  );
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
