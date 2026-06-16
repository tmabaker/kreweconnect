/**
 * Microsoft Graph API Service
 *
 * Fetches directory data from Microsoft Graph via GDAP delegated access.
 * Handles token acquisition, pagination, caching, and error handling.
 */

import { msalInstance } from "../shared/auth/AuthProvider";
import { graphScopes, apiScopes } from "../shared/auth/msalConfig";

// ─── Types ───────────────────────────────────────────────────────

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
  /** Per-employee company (e.g. physical location); distinct from the tenant */
  companyName?: string | null;
  /** Work anniversary source; may be null/unset or a 1604 sentinel in Graph */
  employeeHireDate?: string | null;
  /** Birthday; only month/day is surfaced. May be null/unset in Graph */
  birthday?: string | null;
  manager?: {
    id: string;
    displayName: string;
  } | null;
  /** Present only in the aggregated "all clients" response — the source tenant */
  tenantId?: string;
  tenantDisplayName?: string;
}

export interface GraphOrganization {
  id: string;
  displayName: string;
  verifiedDomains: Array<{
    name: string;
    isDefault: boolean;
    isInitial: boolean;
  }>;
}

interface GraphPagedResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export interface GraphError {
  code: string;
  message: string;
  statusCode: number;
  /** Present when code === "consent_required" — the admin-consent URL for the tenant */
  consentUrl?: string;
}

// ─── Cache ───────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearGraphCache(): void {
  cache.clear();
}

export function invalidateTenantCache(tenantId: string): void {
  for (const key of cache.keys()) {
    if (key.includes(tenantId)) {
      cache.delete(key);
    }
  }
}

// ─── Token Acquisition ──────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) {
    throw createGraphError("no_account", "No active account. Please sign in.", 401);
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...graphScopes,
      account,
    });
    return response.accessToken;
  } catch {
    // Silent acquisition failed — try interactive
    try {
      const response = await msalInstance.acquireTokenPopup({
        ...graphScopes,
        account,
      });
      return response.accessToken;
    } catch (interactiveError) {
      throw createGraphError(
        "token_failed",
        "Failed to acquire access token. Please sign in again.",
        401
      );
    }
  }
}

// ─── Backend API Mode ───────────────────────────────────────────
//
// When VITE_USE_BACKEND_API=true, directory data is fetched through the
// KreweConnect Functions API (/api/tenants/{tenantId}/...), which acquires
// app-only Graph tokens against the *target* tenant's authority. This is
// what makes cross-tenant (GDAP-style) access actually work — delegated
// tokens from the browser are always scoped to the user's home tenant.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const useBackendApi = import.meta.env.VITE_USE_BACKEND_API === "true";

async function getApiToken(): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) {
    throw createGraphError("no_account", "No active account. Please sign in.", 401);
  }
  try {
    const response = await msalInstance.acquireTokenSilent({ ...apiScopes, account });
    return response.accessToken;
  } catch {
    try {
      const response = await msalInstance.acquireTokenPopup({ ...apiScopes, account });
      return response.accessToken;
    } catch {
      throw createGraphError(
        "token_failed",
        "Failed to acquire access token. Please sign in again.",
        401
      );
    }
  }
}

async function apiRequest(path: string): Promise<Response> {
  const token = await getApiToken();
  try {
    return await fetch(`${API_BASE}${path}`, {
      headers: {
        // Static Web Apps overwrites Authorization en route to managed
        // functions, so the API reads X-KreweConnect-Auth first.
        Authorization: `Bearer ${token}`,
        "X-KreweConnect-Auth": `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw createGraphError("api_timeout", "The directory service took too long to respond. Please try again.", 504);
    }
    throw createGraphError("network_error", "Could not reach the directory service.", 0);
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await apiRequest(path);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error: GraphError = {
      code: body?.code || "api_error",
      message: body?.message || `API error: ${response.status} ${response.statusText}`,
      statusCode: response.status,
    };
    if (body?.consentUrl) error.consentUrl = body.consentUrl;
    throw error;
  }
  return response.json();
}

/** Check whether a client tenant has granted admin consent to the app. */
export async function fetchTenantAuthStatus(
  tenantId: string
): Promise<{ authorized: boolean; consentUrl: string }> {
  return apiFetch(`/tenants/${tenantId}/status`);
}

// ─── HTTP Helpers ───────────────────────────────────────────────

function createGraphError(code: string, message: string, statusCode: number): GraphError {
  return { code, message, statusCode };
}

export function isGraphError(err: unknown): err is GraphError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    "statusCode" in err
  );
}

async function graphFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ConsistencyLevel: "eventual",
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const graphErr = errorBody?.error;

    if (response.status === 403 || response.status === 401) {
      throw createGraphError(
        graphErr?.code || "access_denied",
        graphErr?.message ||
          "Access denied. GDAP permissions may not be configured for this tenant.",
        response.status
      );
    }

    if (response.status === 404) {
      throw createGraphError(
        graphErr?.code || "not_found",
        graphErr?.message || "Resource not found.",
        404
      );
    }

    throw createGraphError(
      graphErr?.code || "graph_error",
      graphErr?.message || `Graph API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json();
}

// ─── Graph API Methods ──────────────────────────────────────────

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const USER_SELECT_FIELDS = [
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
  "employeeHireDate",
  "birthday",
].join(",");

const MANAGER_EXPAND = "manager($select=id,displayName)";

/**
 * Fetch all users from a tenant via Graph API (with pagination).
 * For MSP admin viewing a client tenant, the tenantId path prefix handles GDAP routing.
 */
export async function fetchUsers(tenantId?: string): Promise<GraphUser[]> {
  const cacheKey = `users:${tenantId || "home"}`;
  const cached = getCached<GraphUser[]>(cacheKey);
  if (cached) return cached;

  if (useBackendApi) {
    const data = await apiFetch<{ value: GraphUser[] }>(
      `/tenants/${tenantId || "home"}/users`
    );
    setCache(cacheKey, data.value);
    return data.value;
  }

  const token = await getAccessToken();
  const allUsers: GraphUser[] = [];

  // Direct-Graph mode (legacy fallback): delegated tokens are always issued
  // by the signed-in user's home tenant, so this path can only ever read the
  // home directory regardless of the selected tenant. Cross-tenant access
  // requires backend mode (VITE_USE_BACKEND_API=true).
  let url = `${GRAPH_BASE}/users?$select=${USER_SELECT_FIELDS}&$expand=${MANAGER_EXPAND}&$top=999&$filter=accountEnabled eq true`;

  while (url) {
    const page = await graphFetch<GraphPagedResponse<GraphUser>>(url, token);
    allUsers.push(...page.value);
    url = page["@odata.nextLink"] || "";
  }

  // Normalize manager field
  for (const user of allUsers) {
    if (user.manager && typeof user.manager === "object" && "@odata.type" in user.manager) {
      // Graph returns manager as an object with @odata.type — extract what we need
      const mgr = user.manager as Record<string, unknown>;
      user.manager = {
        id: (mgr.id as string) || "",
        displayName: (mgr.displayName as string) || "",
      };
    }
  }

  setCache(cacheKey, allUsers);
  return allUsers;
}

/**
 * Fetch a single user's details.
 */
export async function fetchUserById(userId: string, tenantId?: string): Promise<GraphUser> {
  const cacheKey = `user:${tenantId || "home"}:${userId}`;
  const cached = getCached<GraphUser>(cacheKey);
  if (cached) return cached;

  if (useBackendApi) {
    const user = await apiFetch<GraphUser>(
      `/tenants/${tenantId || "home"}/users/${userId}`
    );
    setCache(cacheKey, user);
    return user;
  }

  const token = await getAccessToken();
  const user = await graphFetch<GraphUser>(
    `${GRAPH_BASE}/users/${userId}?$select=${USER_SELECT_FIELDS}&$expand=${MANAGER_EXPAND}`,
    token
  );

  setCache(cacheKey, user);
  return user;
}

/**
 * Fetch a user's profile photo as a blob URL.
 * Returns null if no photo is available.
 */
export async function fetchUserPhoto(
  userId: string,
  tenantId?: string
): Promise<string | null> {
  const cacheKey = `photo:${tenantId || "home"}:${userId}`;
  const cached = getCached<string | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    const response = useBackendApi
      ? await apiRequest(`/tenants/${tenantId || "home"}/users/${userId}/photo`)
      : await fetch(`${GRAPH_BASE}/users/${userId}/photo/$value`, {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        });

    if (!response.ok) {
      setCache(cacheKey, ""); // Cache the "no photo" result
      return null;
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    setCache(cacheKey, blobUrl);
    return blobUrl;
  } catch {
    setCache(cacheKey, "");
    return null;
  }
}

/**
 * Batch-fetch profile photos for multiple users.
 * Returns a map of userId -> blob URL (or null).
 */
export async function fetchUserPhotos(
  userIds: string[],
  tenantId?: string
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Fetch in parallel with concurrency limit
  const CONCURRENCY = 5;
  const queue = [...userIds];

  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!;
      try {
        const photo = await fetchUserPhoto(id, tenantId);
        results.set(id, photo);
      } catch {
        results.set(id, null);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () =>
    worker()
  );
  await Promise.all(workers);

  return results;
}

/**
 * Fetch organization info for the current tenant.
 */
export async function fetchOrganization(): Promise<GraphOrganization | null> {
  const cacheKey = "organization";
  const cached = getCached<GraphOrganization>(cacheKey);
  if (cached) return cached;

  const token = await getAccessToken();

  try {
    const response = await graphFetch<GraphPagedResponse<GraphOrganization>>(
      `${GRAPH_BASE}/organization`,
      token
    );
    const org = response.value?.[0] || null;
    if (org) setCache(cacheKey, org);
    return org;
  } catch {
    return null;
  }
}

/**
 * Fetch GDAP customer tenants accessible via the partner relationship.
 * Uses the /contracts endpoint available to partner admins.
 */
export async function fetchCustomerTenants(): Promise<
  Array<{
    customerId: string;
    displayName: string;
    defaultDomainName: string;
  }>
> {
  const cacheKey = "customerTenants";
  const cached = getCached<
    Array<{ customerId: string; displayName: string; defaultDomainName: string }>
  >(cacheKey);
  if (cached) return cached;

  const token = await getAccessToken();

  try {
    const response = await graphFetch<{
      value: Array<{
        customerId: string;
        displayName: string;
        defaultDomainName: string;
        contractType: string;
      }>;
    }>(`${GRAPH_BASE}/contracts?$top=999`, token);

    const tenants = response.value
      .filter((c) => c.contractType === "subscription")
      .map((c) => ({
        customerId: c.customerId,
        displayName: c.displayName,
        defaultDomainName: c.defaultDomainName,
      }));

    setCache(cacheKey, tenants);
    return tenants;
  } catch {
    // Contracts endpoint may not be available — return empty
    return [];
  }
}

/**
 * Fetch direct reports for a user.
 */
export async function fetchDirectReports(
  userId: string,
  tenantId?: string
): Promise<Array<{ id: string; displayName: string; jobTitle: string | null }>> {
  const cacheKey = `directReports:${tenantId || "home"}:${userId}`;
  const cached =
    getCached<Array<{ id: string; displayName: string; jobTitle: string | null }>>(cacheKey);
  if (cached) return cached;

  if (useBackendApi) {
    const data = await apiFetch<{
      value: Array<{ id: string; displayName: string; jobTitle: string | null }>;
    }>(`/tenants/${tenantId || "home"}/users/${userId}/directReports`);
    setCache(cacheKey, data.value);
    return data.value;
  }

  const token = await getAccessToken();
  const response = await graphFetch<{
    value: Array<{ id: string; displayName: string; jobTitle: string | null }>;
  }>(`${GRAPH_BASE}/users/${userId}/directReports?$select=id,displayName,jobTitle`, token);

  setCache(cacheKey, response.value);
  return response.value;
}
