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
   * Invited client users allowed to manage users in their OWN tenant through
   * the tech-tools pages (create user, update user, reset password, and the
   * license/group edits that are part of Modify). Reads (the KreweConnect
   * directory) are not affected by this list. Configure via the
   * CLIENT_USER_ALLOWLIST app setting: a JSON object mapping tenant id to an
   * array of user object ids and/or UPNs, e.g.
   *   { "<tenantId>": ["<oid>", "user@client.com"] }
   * Matching is case-insensitive. Default: empty (no client user may write).
   */
  get clientUserAllowlist(): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    const raw = process.env.CLIENT_USER_ALLOWLIST;
    if (!raw) return out;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [tenantId, users] of Object.entries(parsed)) {
          if (!Array.isArray(users)) continue;
          out.set(
            tenantId.toLowerCase(),
            new Set(
              users
                .filter((u): u is string => typeof u === "string" && u.trim() !== "")
                .map((u) => u.trim().toLowerCase())
            )
          );
        }
      }
    } catch {
      // malformed setting — treat as empty; writes stay MSP-only
    }
    return out;
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
   * KreweWorks employee portals, one per client (each client runs its own site).
   * KREWEWORKS_PORTALS app setting: JSON object of tenant id -> portal https URL.
   * Defaults to the pilot tenant's portal, which is already public elsewhere.
   */
  get kreweworksPortals(): Array<{ tenantId: string; url: string }> {
    let map: Record<string, unknown> = {
      "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa": "https://yellow-mud-05c042d10.4.azurestaticapps.net",
    };
    const raw = process.env.KREWEWORKS_PORTALS;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) map = parsed;
      } catch {
        // malformed setting: keep the default
      }
    }
    return Object.entries(map)
      .filter(([, url]) => typeof url === "string" && /^https:\/\//.test(url))
      .map(([tenantId, url]) => ({ tenantId: tenantId.toLowerCase(), url: (url as string).replace(/\/$/, "") }));
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

  /**
   * KreweAIM (AI Mastery) assignment group. Members of this security group in a
   * client tenant get the AIM mark on their directory card. Set via the
   * KREWEAIM_GROUP app setting; defaults to the name KreweAIM provisions.
   */
  get kreweAimGroup(): string {
    return process.env.KREWEAIM_GROUP || "KreweAIM Members";
  },

  /* ── Geaux credential delivery (required in production) ─────────── */
  get callRailApiKey(): string {
    return process.env.CALLRAIL_API_KEY || "";
  },
  get callRailAccountId(): string {
    return process.env.CALLRAIL_ACCOUNT_ID || "";
  },
  /** Geaux support number 504-285-9030 ("Geaux Automotive and Taila"). */
  get callRailTrackingNumber(): string {
    return process.env.CALLRAIL_TRACKING_NUMBER || "+15042859030";
  },
  /**
   * CallRail company that owns the tracking number. Required on every send.
   * Geaux texts send from 504-285-9030, which is filed under the Brita, LLC
   * company in CallRail, so they use Brita's company ID. This is intentional
   * (Tammy, 2026-11-05). If the number moves into the Geaux Auto company,
   * set CALLRAIL_COMPANY_ID to that company's ID at the same time.
   */
  get callRailCompanyId(): string {
    return process.env.CALLRAIL_COMPANY_ID || "COM33d5bce50ba54d8798a69fb1b10486f6";
  },
  get callRailWorkerPublicKey(): string {
    return process.env.CALLRAIL_WORKER_PUBLIC_KEY || "";
  },
  get geauxSupportMailbox(): string {
    return process.env.GEAUX_SUPPORT_MAILBOX || "support@geauxautomotive.com";
  },

  /* ── Endpoint handover (Remove User page) ───────────────────────── */
  /**
   * Intune and Autopilot identity for Geaux: the single-tenant "NOIT Autopilot
   * (Geaux)" app. It is the only
   * identity there holding DeviceManagementManagedDevices.PrivilegedOperations.All,
   * which Graph requires for an app-only wipe (verified live 2026-11-09).
   */
  get geauxIntuneClientId(): string {
    return process.env.GEAUX_INTUNE_CLIENT_ID || "";
  },
  get geauxIntuneClientSecret(): string {
    return process.env.GEAUX_INTUNE_CLIENT_SECRET || "";
  },
  /** Group tag stamped on a hash imported from VSA X (read from an existing Geaux record 2026-09-21). */
  get geauxAutopilotGroupTag(): string {
    return process.env.GEAUX_AUTOPILOT_GROUP_TAG ?? "Geaux Corporate";
  },
  /** VSA X API. The Autopilot hash rides in device custom fields there. */
  get vsaxApiKey(): string {
    return process.env.VSAX_API_KEY || "";
  },
  get vsaxApiSecret(): string {
    return process.env.VSAX_API_SECRET || "";
  },
  get vsaxBaseUrl(): string {
    return (process.env.VSAX_BASE_URL || "https://noitgroup.vsax.net").replace(/\/$/, "");
  },
  get vsaxApiVersion(): string {
    return process.env.VSAX_API_VERSION || "v3";
  },
  get geauxVsaxOrganizationId(): number {
    return parseInt(process.env.GEAUX_VSAX_ORG_ID || "89", 10);
  },

  /**
   * Shared key the suite presents to a client's KreweWorks portal when Tech
   * Tools records work on a request. The same value is PORTAL_SERVICE_KEY on
   * that portal's Static Web App.
   */
  get kreweworksServiceKey(): string {
    return process.env.KREWEWORKS_SERVICE_KEY || "";
  },
  get geauxMailClientId(): string {
    return process.env.GEAUX_MAIL_CLIENT_ID || "";
  },
  get geauxMailClientSecret(): string {
    return process.env.GEAUX_MAIL_CLIENT_SECRET || "";
  },
  get geauxManagerMailSubject(): string {
    return process.env.GEAUX_MANAGER_MAIL_SUBJECT || "Geaux Automotive Temporary Credentials";
  },
  get geauxManagerMailTriggerHeader(): string {
    return process.env.GEAUX_MANAGER_MAIL_TRIGGER_HEADER || "X-NOIT-Credential-Delivery";
  },
  get geauxManagerMailTriggerValue(): string {
    return process.env.GEAUX_MANAGER_MAIL_TRIGGER_VALUE || "geaux-manager-password";
  },
  get geauxManagerMailAppliedHeader(): string {
    return process.env.GEAUX_MANAGER_MAIL_APPLIED_HEADER || "X-NOIT-Encryption-Applied";
  },
  get geauxManagerMailAppliedValue(): string {
    return process.env.GEAUX_MANAGER_MAIL_APPLIED_VALUE || "true";
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
