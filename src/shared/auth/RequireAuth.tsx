import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { loginRequest } from "./msalConfig";
import { isDemoMode } from "./demoMode";
import {
  Button,
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
  const { instance } = useMsal();

  const handleLogin = () => {
    // loginRedirect returns a promise that rejects if MSAL can't even start the
    // redirect (e.g. misconfigured redirect URI / interaction already in
    // progress). Surface it instead of letting the failure vanish silently.
    instance.loginRedirect(loginRequest).catch((error) => {
      console.error("KreweConnect login failed to start:", error);
    });
  };

  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <div className={styles.loginContainer}>
          <div className={styles.logo}>
            <ShieldKeyhole24Regular style={{ fontSize: 48 }} />
            <Title1>KreweConnect</Title1>
          </div>
          <Text size={400}>Sign in with your NOIT Group account to continue</Text>
          <Button appearance="primary" size="large" onClick={handleLogin}>
            Sign in with Microsoft
          </Button>
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
