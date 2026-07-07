import type { Configuration } from "@azure/msal-browser";
import { LogLevel } from "@azure/msal-browser";

// App registration values
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || "eaeafccb-5190-48b6-863d-9e13f449acbb";
const homeTenantId = import.meta.env.VITE_AZURE_TENANT_ID || "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e";
const redirectUri = import.meta.env.VITE_REDIRECT_URI || window.location.origin;

export const msalConfig: Configuration = {
  auth: {
    clientId,
    // MULTI-TENANT: each user must authenticate against THEIR OWN home tenant
    // so the token's `tid` claim is their real tenant. Pinning the authority to
    // a single tenant (e.g. NOIT) makes every signed-in user — including client
    // users who are guests in that tenant — receive a token with that tenant's
    // `tid`, which makes the whole app treat them as an MSP admin (sees the
    // cross-client dashboard/switcher) AND defeats the API's tid-based tenant
    // isolation. "organizations" = any work/school tenant, no single-tenant pin.
    authority: "https://login.microsoftonline.com/organizations",
    knownAuthorities: [
      "https://login.microsoftonline.com/organizations",
      `https://login.microsoftonline.com/${homeTenantId}`,
    ],
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: "localStorage",
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
        if (level === LogLevel.Warning) console.warn(message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

/**
 * Scopes for the initial login request.
 * Includes both custom API scope and basic Graph read.
 */
export const loginRequest = {
  scopes: [
    "User.Read",
    `api://${clientId}/access_as_user`,
  ],
};

/**
 * Scopes for the custom backend API.
 */
export const apiScopes = {
  scopes: [`api://${clientId}/access_as_user`],
};

/**
 * Scopes for Microsoft Graph API calls (directory data via GDAP).
 * These are delegated permissions — the user's GDAP role determines actual access.
 */
export const graphScopes = {
  scopes: [
    "User.Read.All",
    "Directory.Read.All",
    "User.Read",
  ],
};
