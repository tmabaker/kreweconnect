/**
 * Per-tenant app-only token acquisition (client credentials flow).
 *
 * After a client tenant's admin grants one-time consent to the multi-tenant
 * app registration, this service can mint Graph tokens against that tenant's
 * authority. Tokens are cached in memory until shortly before expiry.
 */

import { config, buildConsentUrl } from "./config";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const tokenCache = new Map<string, CachedToken>();

/** Refresh 5 minutes before actual expiry */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export class TenantNotAuthorizedError extends Error {
  readonly consentUrl: string;
  constructor(tenantId: string, aadError: string) {
    super(
      `Tenant ${tenantId} has not authorized this application (${aadError}). ` +
        `An administrator must grant consent first.`
    );
    this.name = "TenantNotAuthorizedError";
    this.consentUrl = buildConsentUrl(tenantId);
  }
}

/**
 * AADSTS error codes that mean "the app is not consented/provisioned in this
 * tenant" — i.e. the admin-consent step hasn't happened (or was revoked).
 */
const CONSENT_ERROR_CODES = [
  "700016", // Application not found in the directory (not provisioned)
  "65001", // User or administrator has not consented
  "7000215", // Invalid client secret (kept separate below)
  "90002", // Tenant not found
];

export async function getAppToken(tenantId: string): Promise<string> {
  const cached = tokenCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    const description = error.error_description || "";

    if (description.includes("7000215")) {
      throw new Error(
        "Backend client secret is invalid or expired — rotate AZURE_CLIENT_SECRET."
      );
    }
    if (CONSENT_ERROR_CODES.some((code) => description.includes(`AADSTS${code}`))) {
      throw new TenantNotAuthorizedError(tenantId, error.error || "consent_required");
    }
    throw new Error(
      `Token acquisition failed for tenant ${tenantId}: ${error.error || response.status} ${description}`
    );
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache.set(tenantId, {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  });

  return token.access_token;
}

/**
 * Check whether a tenant has *usable* consent, without throwing.
 *
 * Acquiring a client-credentials token is necessary but NOT sufficient: Entra
 * issues a token even when the app holds no Graph application role, so a token
 * alone does not prove the directory can be read. That is the exact "an admin
 * clicked Accept but the directory still won't load" failure — the app was
 * provisioned, but the `User.Read.All` *application* permission was never
 * requested/consented. So we additionally probe a minimal `/users` read and
 * only report `authorized: true` when that succeeds.
 */
export async function checkTenantAuthorization(
  tenantId: string
): Promise<{ authorized: boolean; consentUrl: string; detail?: string }> {
  const consentUrl = buildConsentUrl(tenantId);
  let token: string;
  try {
    token = await getAppToken(tenantId);
  } catch (err) {
    if (err instanceof TenantNotAuthorizedError) {
      return { authorized: false, consentUrl: err.consentUrl };
    }
    return {
      authorized: false,
      consentUrl,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Token acquired — now confirm the app can actually read the directory.
  try {
    const probe = await fetch(
      "https://graph.microsoft.com/v1.0/users?$top=1&$select=id",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (probe.ok) {
      return { authorized: true, consentUrl };
    }
    if (probe.status === 401 || probe.status === 403) {
      // Provisioned/consented for sign-in, but missing the application
      // permission that lets it read users. Re-consent (the URL grants the
      // app's currently-requested application permissions) fixes this.
      return {
        authorized: false,
        consentUrl,
        detail:
          "App is consented for sign-in but lacks the User.Read.All application " +
          "permission in this tenant (Graph returned " +
          `${probe.status}). Re-grant admin consent to authorize directory read.`,
      };
    }
    // Transient Graph issue — treat as authorized so a 5xx blip doesn't hide a
    // tenant that is actually fine; the directory call will surface real errors.
    return { authorized: true, consentUrl };
  } catch (err) {
    return {
      authorized: false,
      consentUrl,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
