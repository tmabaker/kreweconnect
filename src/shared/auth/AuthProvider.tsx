import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";
import { isDemoMode } from "./demoMode";
import type { ReactNode } from "react";

let msalInstance: PublicClientApplication;

if (!isDemoMode) {
  msalInstance = new PublicClientApplication(msalConfig);

  // Set default active account if there's one
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as { account?: { homeAccountId: string } };
      if (payload.account) {
        const account = (msalInstance as any).getAccountByHomeId(payload.account.homeAccountId);
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
