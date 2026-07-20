import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";
import { isDemoMode } from "./demoMode";
import type { ReactNode } from "react";

let msalInstance: PublicClientApplication;

if (!isDemoMode) {
  msalInstance = new PublicClientApplication(msalConfig);

  // MSAL Browser v3/v4 require `await initialize()` before any other API call
  // (getAllAccounts, setActiveAccount, loginRedirect, acquireToken*). Doing
  // cache/account work here at module-load — before initialize() — throws
  // `uninitialized_public_client_application` in current 4.x and white-screens
  // the whole app, most visibly on a cold cache (incognito / first visit).
  // So the only thing we do at construction time is register the event
  // callback (safe pre-init); initialize() + active-account wiring happens in
  // initializeMsal(), which main.tsx awaits before rendering.
  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as { account?: { homeAccountId: string } };
      if (payload.account) {
        const account = msalInstance.getAccountByHomeId(payload.account.homeAccountId);
        if (account) {
          msalInstance.setActiveAccount(account);
        }
      }
    }
  });
} else {
  // In demo mode, create a dummy instance that won't be used
  msalInstance = null as unknown as PublicClientApplication;
}

/**
 * Initialize MSAL and restore the active account from cache. Must be awaited
 * once, before the React tree renders. Safe in demo mode (no-op). initialize()
 * is idempotent, so MsalProvider calling it again internally is harmless.
 */
export async function initializeMsal(): Promise<void> {
  if (isDemoMode || !msalInstance) return;
  await msalInstance.initialize();

  // CRITICAL for redirect login: on the way back from Entra the auth code is in
  // the URL hash and is NOT yet processed — getAllAccounts() is still empty.
  // We must consume the redirect response here, before React renders, so the
  // account exists when RequireAuth checks. Skipping this leaves the hash
  // unconsumed → the app shows the sign-in screen again AND MSAL stays in
  // `interaction_in_progress`, so the next loginRedirect() silently no-ops
  // (the "click Sign in and nothing happens" loop).
  try {
    const result = await msalInstance.handleRedirectPromise();
    if (result?.account) {
      msalInstance.setActiveAccount(result.account);
    }
  } catch (err) {
    // A failed/duplicate redirect shouldn't wedge startup; clear and continue.
    console.error("MSAL redirect handling failed:", err);
  }

  if (!msalInstance.getActiveAccount()) {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0]);
    }
  }
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  if (isDemoMode) {
    return <>{children}</>;
  }
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}

export { msalInstance };
