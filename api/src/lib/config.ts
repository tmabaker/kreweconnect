/**
 * Backend configuration from app settings / environment.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required app setting: ${name}`);
  }
  return value;
}

export const config = {
  /**
   * Multi-tenant app registration (same one the SPA uses). Public-by-design
   * value (it ships in the SPA bundle), so a code default is safe — the
   * app setting overrides it when present.
   */
  get clientId(): string {
    return process.env.AZURE_CLIENT_ID || "eaeafccb-5190-48b6-863d-9e13f449acbb";
  },
  /** Client secret for the confidential-client (backend) flow — never defaulted */
  get clientSecret(): string {
    return required("AZURE_CLIENT_SECRET");
  },
  /** NOIT Group's home tenant — callers from this tenant are MSP admins */
  get mspTenantId(): string {
    return process.env.MSP_TENANT_ID || "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e";
  },
  /** Where the admin-consent flow redirects after a client admin accepts */
  get consentRedirectUri(): string {
    return process.env.CONSENT_REDIRECT_URI || "https://krewesuite.noitgroup.com/app/kreweconnect/";
  },
  /**
   * Client tenants to merge in the MSP "all clients" view. Configure via the
   * CLIENT_TENANTS app setting (JSON array of {id,name}); defaults to the pilot
   * tenant. Tenants that haven't consented are skipped gracefully at fetch time.
   */
  get clientTenants(): Array<{ id: string; name: string }> {
    const raw = process.env.CLIENT_TENANTS;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((t) => t && typeof t.id === "string");
        }
      } catch {
        // malformed setting — fall through to default
      }
    }
    return [{ id: "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa", name: "Geaux Automotive" }];
  },
};

/** Build the one-time admin-consent URL for a client tenant. */
export function buildConsentUrl(tenantId: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.consentRedirectUri,
  });
  return `https://login.microsoftonline.com/${tenantId}/adminconsent?${params.toString()}`;
}
