/**
 * KREWE Governance API client (apps/governance .NET backend, NOC-56).
 *
 * Auth: the same Entra token as the rest of the suite — MSAL
 * `api://eaeafccb…/access_as_user` on the shared app registration. The
 * backend derives staff-vs-client from the verified token (`tid`/`oid`);
 * nothing here grants access, it only presents the token.
 *
 * The backend is not deployed yet (R5 decides the target), so the base URL
 * is configurable: set VITE_GOVERNANCE_API_URL at build time (e.g.
 * `http://localhost:5000` for local `dotnet run`). Falls back to
 * `/governance` — the intended reverse-proxy path once R5 lands.
 */

import { msalInstance } from "../shared/auth/AuthProvider";
import { apiScopes } from "../shared/auth/msalConfig";
import { isDemoMode } from "../shared/auth/demoMode";

const API_BASE =
  (import.meta.env.VITE_GOVERNANCE_API_URL || "/governance").replace(/\/$/, "");

// ─── Types (camelCase mirrors of the API DTOs) ───────────────────

export interface GovCategory {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface GovPolicySummary {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  currentVersion: number;
  nextReviewDate: string | null;
  category: string;
  categoryId: string;
}

export interface GovVariableDef {
  key: string;
  label: string;
  question: string;
  inputType: string; // text | textarea | date | select | number
  options: string | null; // JSON array for select
  isUniversal: boolean;
  required: boolean;
  sortOrder: number;
}

export interface GovPolicyDetail extends GovPolicySummary {
  content: string | null;
  variables: GovVariableDef[];
}

export interface GovPolicyVersion {
  id: string;
  versionNumber: number;
  changeNotes: string | null;
  createdAt: string;
}

export interface GovClient {
  id: string;
  name: string;
  industry: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  mitpClientId: string | null;
}

export interface GovWizardQuestion extends GovVariableDef {
  currentValue: string | null;
}

export interface GovWizard {
  id: string; // policy id
  title: string; // policy title
  clientId: string;
  questions: GovWizardQuestion[];
}

export interface GovAssembledSummary {
  id: number;
  policyId: string;
  policyTitle: string;
  assembledAt: string;
  assembledBy: string;
  acknowledgedByClient: boolean;
  acknowledgedAt: string | null;
}

export interface GovAssembledDetail {
  id: number;
  policyTitle: string;
  client: string;
  assembledContent: string;
  assembledAt: string;
  assembledBy: string;
  acknowledgedByClient: boolean;
  acknowledgedAt: string | null;
}

export interface GovAssemblyOutcome {
  assembledPolicyId: number;
  policyTitle: string;
  clientName: string;
  missingVariables: string[];
}

export interface GovVariableAnswer {
  key: string;
  value: string;
}

export interface GovError {
  code: string;
  message: string;
  statusCode: number;
}

export function isGovError(err: unknown): err is GovError {
  return (
    typeof err === "object" && err !== null && "code" in err && "statusCode" in err
  );
}

// ─── Token + fetch plumbing ──────────────────────────────────────

async function getToken(): Promise<string> {
  if (isDemoMode) {
    throw <GovError>{
      code: "demo_mode",
      message: "KREWE Governance needs a real sign-in — it is not available in demo mode.",
      statusCode: 401,
    };
  }
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) {
    throw <GovError>{
      code: "no_account",
      message: "No signed-in account. Please sign in again.",
      statusCode: 401,
    };
  }
  try {
    const response = await msalInstance.acquireTokenSilent({ ...apiScopes, account });
    return response.accessToken;
  } catch {
    try {
      const response = await msalInstance.acquireTokenPopup({ ...apiScopes, account });
      return response.accessToken;
    } catch {
      throw <GovError>{
        code: "token_failed",
        message: "Failed to acquire an access token. Please sign in again.",
        statusCode: 401,
      };
    }
  }
}

async function govFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      headers: {
        // SWA strips Authorization en route to linked backends, so send the
        // suite's fallback header too (same convention as the directory API).
        Authorization: `Bearer ${token}`,
        "X-KreweConnect-Auth": `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw <GovError>{
        code: "timeout",
        message: "The governance service took too long to respond. Please try again.",
        statusCode: 504,
      };
    }
    throw <GovError>{
      code: "network_error",
      message: "Could not reach the governance service.",
      statusCode: 0,
    };
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({} as any));
    throw <GovError>{
      code: body?.error || body?.code || "api_error",
      message:
        body?.message ||
        (response.status === 403
          ? "You don't have access to this governance resource."
          : `Governance API error: ${response.status} ${response.statusText}`),
      statusCode: response.status,
    };
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

// ─── Clients ─────────────────────────────────────────────────────

export const fetchGovClients = () => govFetch<GovClient[]>("/clients");

export const createGovClient = (input: Partial<GovClient>) =>
  govFetch<{ id: string }>("/clients", { method: "POST", body: JSON.stringify(input) });

export const updateGovClient = (id: string, input: Partial<GovClient> & { isActive?: boolean }) =>
  govFetch<{ id: string }>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(input) });

// ─── Policy library ──────────────────────────────────────────────

export const fetchPolicies = () => govFetch<GovPolicySummary[]>("/policies");

export const fetchPolicy = (id: string) => govFetch<GovPolicyDetail>(`/policies/${id}`);

export const fetchPolicyVersions = (id: string) =>
  govFetch<GovPolicyVersion[]>(`/policies/${id}/versions`);

export const fetchCategories = () => govFetch<GovCategory[]>("/categories");

export const createCategory = (input: { name: string; description?: string; sortOrder?: number }) =>
  govFetch<{ id: string }>("/categories", { method: "POST", body: JSON.stringify(input) });

export const updateCategory = (
  id: string,
  input: { name?: string; description?: string; sortOrder?: number }
) => govFetch<{ id: string }>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(input) });

export interface PolicyCreateInput {
  title: string;
  summary?: string;
  content?: string;
  categoryId: string;
  status?: string;
  nextReviewDate?: string | null;
}

export const createPolicy = (input: PolicyCreateInput) =>
  govFetch<{ id: string; currentVersion: number }>("/policies", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updatePolicy = (
  id: string,
  input: Partial<PolicyCreateInput> & { changeNotes?: string }
) =>
  govFetch<{ id: string; currentVersion: number; versionBumped: boolean }>(`/policies/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const replacePolicyVariables = (id: string, definitions: GovVariableDef[]) =>
  govFetch<{ id: string; count: number }>(`/policies/${id}/variables`, {
    method: "PUT",
    body: JSON.stringify(definitions),
  });

// ─── Wizard ──────────────────────────────────────────────────────

export const fetchWizard = (policyId: string, clientId: string) =>
  govFetch<GovWizard>(`/policies/${policyId}/wizard?clientId=${encodeURIComponent(clientId)}`);

export const saveClientVariables = (clientId: string, answers: GovVariableAnswer[]) =>
  govFetch<{ saved: number }>(`/clients/${clientId}/variables`, {
    method: "PUT",
    body: JSON.stringify(answers),
  });

// ─── Assembly + acknowledgment ───────────────────────────────────

export const assemblePolicy = (policyId: string, clientCompanyId: string, assembledBy: string) =>
  govFetch<GovAssemblyOutcome>(`/policies/${policyId}/assemble`, {
    method: "POST",
    body: JSON.stringify({ clientCompanyId, assembledBy }),
  });

export const fetchAssembledForClient = (clientId: string) =>
  govFetch<GovAssembledSummary[]>(`/clients/${clientId}/assembled`);

export const fetchAssembled = (id: number) => govFetch<GovAssembledDetail>(`/assembled/${id}`);

export const acknowledgeAssembled = (id: number) =>
  govFetch<{ id: number; acknowledgedByClient: boolean; acknowledgedAt: string }>(
    `/assembled/${id}/acknowledge`,
    { method: "POST" }
  );
