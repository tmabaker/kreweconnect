import { useEffect, useState } from "react";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "./msalConfig";
import { isDemoMode } from "./demoMode";
import {
  Button,
  Spinner,
  Title1,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ShieldKeyhole24Regular } from "@fluentui/react-icons";
import type { ReactNode } from "react";

const useStyles = makeStyles({
  loginContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    gap: "24px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    color: tokens.colorBrandForeground1,
  },
});

function RequireAuthMsal({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { instance, accounts, inProgress } = useMsal();

  // Seamless SSO: when a user arrives with no cached account (e.g. clicking the
  // "Company Directory" tile on their SharePoint intranet) but already has a
  // live Microsoft 365 session, attempt a prompt-less sign-in via a hidden
  // iframe so they flow straight into the directory with zero clicks. If there
  // is no usable session — or the browser blocks the third-party cookie the
  // iframe needs — this rejects and we fall back to the interactive button
  // below (which still completes without a password when a session exists).
  const [silentDone, setSilentDone] = useState(false);

  useEffect(() => {
    if (
      accounts.length === 0 &&
      inProgress === InteractionStatus.None &&
      !silentDone
    ) {
      instance
        .ssoSilent(loginRequest)
        .then((result) => {
          instance.setActiveAccount(result.account);
        })
        .catch(() => {
          // No silent session available — show the interactive sign-in button.
        })
        .finally(() => setSilentDone(true));
    }
  }, [accounts.length, inProgress, silentDone, instance]);

  const handleLogin = () => {
    instance.loginRedirect(loginRequest);
  };

  // Show a quiet "signing you in" state while the silent attempt (or any other
  // MSAL interaction) is still in flight, so users don't see a flash of the
  // sign-in button before being signed in automatically.
  const attempting =
    inProgress === InteractionStatus.SsoSilent ||
    (accounts.length === 0 && !silentDone);

  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <div className={styles.loginContainer}>
          <div className={styles.logo}>
            <ShieldKeyhole24Regular style={{ fontSize: 48 }} />
            <Title1>KreweConnect</Title1>
          </div>
          {attempting ? (
            <Spinner size="large" label="Signing you in…" />
          ) : (
            <>
              <Text size={400}>Enter your Microsoft username and password to continue</Text>
              <Button appearance="primary" size="large" onClick={handleLogin}>
                Sign in with Microsoft
              </Button>
            </>
          )}
        </div>
      </UnauthenticatedTemplate>
    </>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  if (isDemoMode) {
    return <>{children}</>;
  }
  return <RequireAuthMsal>{children}</RequireAuthMsal>;
}
