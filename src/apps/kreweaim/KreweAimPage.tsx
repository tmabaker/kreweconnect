import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Title3,
  Text,
  Card,
  Avatar,
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
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useGraphEmployees } from "../../shared/hooks/useGraphEmployees";
import { AimMark, Fleur } from "../../shared/components/AimMark";
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "12px",
  },
  member: { display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" },
  memberText: { minWidth: 0 },
  ellipsis: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
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

/** KreweAIM (AI Mastery) is a personal program: each person sees only their
 * own enrollment. NOIT staff, who assign it, also get the member list for the
 * selected tenant. */
export function KreweAimPage() {
  const styles = useStyles();
  const { isMspAdmin, userObjectId } = detectUserTenantContext();
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

      {isMspAdmin && <StaffMemberList />}
    </div>
  );
}

/** NOIT staff only: who is enrolled in the selected tenant. Rendered as its
 * own component so client users never load the directory for this page. */
function StaffMemberList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const { employees, loading: peopleLoading, error: peopleError } = useGraphEmployees(selectedTenant.tenantId);
  const [assignment, setAssignment] = useState<AimAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setAssignment({ memberIds: [], groupFound: false, groupName: "KreweAIM Members", failedTenants: 0 });
      return;
    }
    let cancelled = false;
    setAssignment(null);
    setError(null);
    fetchAimAssignment(selectedTenant.tenantId)
      .then((a) => !cancelled && setAssignment(a))
      .catch((err) => !cancelled && setError(err?.message || "Could not load KreweAIM members."));
    return () => {
      cancelled = true;
    };
  }, [selectedTenant.tenantId]);

  const members = useMemo(() => {
    if (!assignment) return [];
    const ids = new Set(assignment.memberIds);
    return employees
      .filter((e) => ids.has(e.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [assignment, employees]);

  const shownError = error || (peopleError ? `Could not load the directory: ${peopleError}` : null);
  const loading = !shownError && (!assignment || peopleLoading);
  const partial = !!assignment && assignment.failedTenants > 0;
  const open = (m: (typeof members)[number]) => navigate(`/directory/${m.id}`, { state: { tenantId: m.tenantId } });

  return (
    <>
      <div>
        <Title3>Members</Title3>
        <Text size={200} className={styles.muted}>
          {selectedTenant.displayName}
          {assignment && !loading ? ` · ${members.length} enrolled` : ""} · visible to NOIT staff only
        </Text>
      </div>

      {shownError && (
        <MessageBar intent="error">
          <MessageBarBody>{shownError}</MessageBarBody>
        </MessageBar>
      )}
      {!loading && partial && (
        <MessageBar intent="warning">
          <MessageBarBody>
            {assignment.failedTenants} tenant{assignment.failedTenants === 1 ? "" : "s"} could not be checked, so
            this list may be incomplete.
          </MessageBarBody>
        </MessageBar>
      )}
      {loading && <Spinner label="Loading members..." />}
      {!loading && !shownError && assignment && !assignment.groupFound && !partial && (
        <MessageBar intent="info">
          <MessageBarBody>
            {selectedTenant.tenantId === "all"
              ? `KreweAIM is not set up in any tenant yet. Create a security group named ${assignment.groupName} in a tenant and add the people to enroll.`
              : `KreweAIM is not set up in this tenant yet. Create a security group named ${assignment.groupName} there and add the people to enroll.`}
          </MessageBarBody>
        </MessageBar>
      )}
      {!loading && !shownError && assignment?.groupFound && members.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>The {assignment.groupName} group exists but has no one in it yet.</MessageBarBody>
        </MessageBar>
      )}

      {!loading && members.length > 0 && (
        <div className={styles.grid}>
          {members.map((m) => (
            <Card
              key={m.id}
              role="link"
              tabIndex={0}
              aria-label={`${m.displayName}, open directory profile`}
              onClick={() => open(m)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open(m);
                }
              }}
            >
              <div className={styles.member}>
                <AimMark active size={40}>
                  <Avatar
                    name={m.displayName}
                    image={m.photo ? { src: m.photo } : undefined}
                    size={40}
                  />
                </AimMark>
                <div className={styles.memberText}>
                  <Text weight="semibold" className={styles.ellipsis}>
                    {m.displayName}
                  </Text>
                  <Text size={200} className={`${styles.muted} ${styles.ellipsis}`}>
                    {[m.jobTitle, m.department].filter(Boolean).join(" · ") || m.email || ""}
                  </Text>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
