import { useEffect, useState } from "react";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  PersonAdd24Regular,
  Sparkle24Regular,
  ArrowRepeatAll24Regular,
} from "@fluentui/react-icons";
import { isDemoMode } from "../../shared/auth/demoMode";
import { Fleur } from "../../shared/components/AimMark";
import { fetchAimAssignment, type AimAssignment } from "../../services/graphService";
import { detectUserTenantContext } from "../../services/tenantService";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  muted: { display: "block", color: tokens.colorNeutralForeground3 },
  status: { display: "flex", alignItems: "flex-start", gap: "16px" },
  statusMark: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "44px",
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  statusMarkOff: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  pillars: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "16px",
  },
  pillarTitle: { display: "flex", alignItems: "center", gap: "8px" },
});

const PILLARS = [
  {
    icon: <PersonAdd24Regular />,
    title: "Your tools only",
    body: "Everything you learn is about the AI tools your company gives you, and your company's AI policy comes first.",
  },
  {
    icon: <Sparkle24Regular />,
    title: "Shaped to your work",
    body: "Lessons follow your role, how comfortable you already are with AI and anything that has tripped you up before.",
  },
  {
    icon: <ArrowRepeatAll24Regular />,
    title: "Always current",
    body: "There is no finish line. When your tools get new features, you hear about them without having to go looking.",
  },
];

/** KreweAIM (AI Mastery) is a personal program: everyone, NOIT staff included,
 * sees only their own enrollment and training. Who is enrolled is managed in
 * Entra (the KreweAIM Members group), not on this page. */
export function KreweAimPage() {
  const styles = useStyles();
  const { userObjectId } = detectUserTenantContext();
  const [mine, setMine] = useState<AimAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setMine({ memberIds: [], groupFound: false, groupName: "KreweAIM Members", failedTenants: 0 });
      return;
    }
    let cancelled = false;
    fetchAimAssignment("home")
      .then((a) => !cancelled && setMine(a))
      .catch((err) => !cancelled && setError(err?.message || "Could not load your KreweAIM status."));
    return () => {
      cancelled = true;
    };
  }, []);

  const enrolled = !!mine && !!userObjectId && mine.memberIds.includes(userObjectId);

  return (
    <div className={styles.page}>
      <div>
        <Title2>KreweAIM</Title2>
        <Text size={300} className={styles.muted}>
          AI Mastery. Your personal program for getting the most out of the AI tools your company
          provides.
        </Text>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!mine && !error && <Spinner label="Checking your enrollment..." />}
      {mine && (
        <Card>
          <div className={styles.status}>
            <span className={`${styles.statusMark} ${enrolled ? "" : styles.statusMarkOff}`}>
              <Fleur size={26} />
            </span>
            <div>
              <Text weight="semibold" size={500} style={{ display: "block" }}>
                {enrolled ? "You're enrolled" : "You're not enrolled yet"}
              </Text>
              <Text size={300} className={styles.muted}>
                {enrolled
                  ? "Your program is built around the AI tools your company provides you. The fleur de lis beside your name in the directory shows you're a KreweAIM member."
                  : "KreweAIM is assigned by your IT admin or NOIT Group. Ask them if you would like to join."}
              </Text>
            </div>
          </div>
        </Card>
      )}

      <div className={styles.pillars}>
        {PILLARS.map((p) => (
          <Card key={p.title}>
            <div className={styles.pillarTitle}>
              {p.icon}
              <Text weight="semibold" size={400}>
                {p.title}
              </Text>
            </div>
            <Text size={300}>{p.body}</Text>
          </Card>
        ))}
      </div>

    </div>
  );
}
