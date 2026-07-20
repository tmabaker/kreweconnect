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
    return [
      { id: "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa", name: "Geaux Automotive" },
      { id: "6444fec1-ccb7-43e6-a075-ba259750173f", name: "Level Homes" },
    ];
  },

  /**
   * Accounts to hide from the directory that no automatic rule can catch —
   * named utility accounts that hold a license and person-like attributes but
   * aren't people (integration accounts, licensed shared mailboxes, vendor
   * logins). DIRECTORY_EXCLUDE app setting: JSON array of strings, matched
   * case-insensitively against userPrincipalName and object id. Kept in app
   * settings, not code, so the client roster never lands in the repo.
   */
  get directoryExclusions(): Set<string> {
    const raw = process.env.DIRECTORY_EXCLUDE;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(
            parsed
              .filter((v): v is string => typeof v === "string")
              .map((v) => v.toLowerCase())
          );
        }
      } catch {
        // malformed setting — treat as empty
      }
    }
    return new Set();
  },

  /**
   * Optional Graph attribute holding an employee's birthday as MM/DD (year
   * omitted for privacy). Either a directory-extension property name
   * (`extension_<appId>_birthday`) or one of `extensionAttribute1`..`15`
   * (read from `onPremisesExtensionAttributes`). Empty → fall back to the
   * standard `birthday` property. Set via the BIRTHDAY_ATTRIBUTE app setting.
   */
  get birthdayAttribute(): string {
    return process.env.BIRTHDAY_ATTRIBUTE || "";
  },

  /**
   * Optional Graph attribute holding the work anniversary. Same shape rules as
   * birthdayAttribute. Empty → fall back to the standard `employeeHireDate`.
   */
  get anniversaryAttribute(): string {
    return process.env.ANNIVERSARY_ATTRIBUTE || "";
  },

  /* ── IT Glue (optional password vaulting) ─────────────────────────── */
  get itGlueApiKey(): string {
    return process.env.ITGLUE_API_KEY || "";
  },
  get itGlueBaseUrl(): string {
    return (process.env.ITGLUE_BASE_URL || "https://api.itglue.com").replace(/\/$/, "");
  },
  /** IT Glue organization id for a tenant, from the ITGLUE_ORG_MAP JSON setting. */
  itGlueOrgFor(tenantId: string): string | null {
    const raw = process.env.ITGLUE_ORG_MAP;
    if (!raw) return null;
    try {
      const map = JSON.parse(raw);
      const v = map && typeof map === "object" ? map[tenantId] : null;
      return v ? String(v) : null;
    } catch {
      return null;
    }
  },
};

/** Map an attribute name to the field that must be added to a Graph $select. */
export function selectFieldForAttribute(attr: string): string | null {
  if (!attr) return null;
  // extensionAttribute1..15 live under onPremisesExtensionAttributes.
  if (/^extensionAttribute([1-9]|1[0-5])$/.test(attr)) return "onPremisesExtensionAttributes";
  // Directory-extension properties are selected by their full name directly.
  return attr;
}

/** Resolve an attribute's value off a fetched user object. */
export function readAttribute(user: Record<string, unknown>, attr: string): string | null {
  if (!attr) return null;
  if (/^extensionAttribute([1-9]|1[0-5])$/.test(attr)) {
    const onPrem = user.onPremisesExtensionAttributes as Record<string, unknown> | undefined;
    const v = onPrem?.[attr];
    return typeof v === "string" && v ? v : null;
  }
  const v = user[attr];
  return typeof v === "string" && v ? v : null;
}

/** Build the one-time admin-consent URL for a client tenant. */
export function buildConsentUrl(tenantId: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.consentRedirectUri,
  });
  return `https://login.microsoftonline.com/${tenantId}/adminconsent?${params.toString()}`;
}
