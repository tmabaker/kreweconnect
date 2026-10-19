import { useEffect, useState } from "react";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Button,
  Card,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { Open24Regular, PeopleTeam24Regular } from "@fluentui/react-icons";
import { fetchKreweWorksPortals, type KreweWorksPortal } from "../../services/kreweworksService";
import { detectUserTenantContext, getTenantDisplayName } from "../../services/tenantService";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
  },
  cardTitle: { display: "flex", alignItems: "center", gap: "8px" },
  muted: { display: "block", color: tokens.colorNeutralForeground3 },
});

/** KreweWorks: hire, change and terminate. Each client's portal is its own
 * site, so this page links out. Staff see every client; a client user sees
 * only its own portal. */
export function KreweWorksPage() {
  const styles = useStyles();
  const { isMspAdmin } = detectUserTenantContext();
  const [portals, setPortals] = useState<KreweWorksPortal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchKreweWorksPortals()
      .then(setPortals)
      .catch((err) => setError(err?.message || "Could not load the KreweWorks portals."));
  }, []);

  return (
    <div className={styles.page}>
      <div>
        <Title2>KreweWorks</Title2>
        <Text size={300} className={styles.muted}>
          Hire, change and terminate in one place. Every hand-off between the hiring
          manager, HR and IT is routed and tracked.
          {isMspAdmin ? " Each client runs its own portal with its own data." : ""}
        </Text>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!portals && !error && <Spinner label="Loading portals..." />}
      {portals && portals.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>
            {isMspAdmin
              ? "No client portals are listed yet."
              : "KreweWorks is not set up for your company yet. Contact NOIT Group to get started."}
          </MessageBarBody>
        </MessageBar>
      )}

      {portals && portals.length > 0 && (
        <div className={styles.grid}>
          {portals.map((p) => (
            <Card key={p.tenantId}>
              <div className={styles.cardTitle}>
                <PeopleTeam24Regular />
                <Text weight="semibold" size={400}>
                  {p.name || getTenantDisplayName(p.tenantId)}
                </Text>
              </div>
              <Text size={200} className={styles.muted}>
                Employee portal
              </Text>
              <div>
                <Button
                  appearance="primary"
                  icon={<Open24Regular />}
                  as="a"
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open portal
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
