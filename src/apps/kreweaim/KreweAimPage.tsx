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
import { AimMark } from "../../shared/components/AimMark";
import { fetchAimAssignment, type AimAssignment } from "../../services/graphService";
import { detectUserTenantContext } from "../../services/tenantService";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  muted: { display: "block", color: tokens.colorNeutralForeground3 },
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
    title: "Assigned by IT",
    body: "Your IT admin or NOIT adds people to the KreweAIM Members group. Everyone in it gets the infinity mark in the directory.",
  },
  {
    icon: <Sparkle24Regular />,
    title: "Coached to the work",
    body: "Each person learns on the AI tools your company actually licenses, shaped by their role, their skill and what has tripped them up before.",
  },
  {
    icon: <ArrowRepeatAll24Regular />,
    title: "Always current",
    body: "There is no finish line. New features and new releases roll into the program, and the coaching comes to people before they go looking.",
  },
];

/** KreweAIM (AI Mastery): what the program is and who in the selected tenant
 * is assigned. Staff see any tenant; a client sees only its own (the API
 * scopes the member list to the caller). */
export function KreweAimPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { isMspAdmin } = detectUserTenantContext();
  const { selectedTenant } = useTenantContext();
  const { employees, loading: peopleLoading } = useGraphEmployees(selectedTenant.tenantId);
  const [assignment, setAssignment] = useState<AimAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setAssignment({ memberIds: [], groupFound: false });
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

  const loading = !error && (!assignment || peopleLoading);

  return (
    <div className={styles.page}>
      <div>
        <Title2>KreweAIM</Title2>
        <Text size={300} className={styles.muted}>
          AI Mastery. A personal, evergreen AI program for every member, built to get the most
          out of the AI licenses the company already pays for.
        </Text>
      </div>

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

      <div>
        <Title3>Members</Title3>
        <Text size={200} className={styles.muted}>
          {selectedTenant.displayName}
          {assignment && !loading ? ` · ${members.length} assigned` : ""}
        </Text>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {loading && <Spinner label="Loading members..." />}
      {!loading && assignment && !assignment.groupFound && (
        <MessageBar intent="info">
          <MessageBarBody>
            {isMspAdmin
              ? selectedTenant.tenantId === "all"
                ? "KreweAIM is not set up in any tenant yet. Create a security group named KreweAIM Members in a client tenant and add the people to enroll."
                : "KreweAIM is not set up in this tenant yet. Create a security group named KreweAIM Members there and add the people to enroll."
              : "KreweAIM is not set up for your company yet. Contact NOIT Group to get started."}
          </MessageBarBody>
        </MessageBar>
      )}
      {!loading && assignment?.groupFound && members.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>The KreweAIM Members group exists but has no one in it yet.</MessageBarBody>
        </MessageBar>
      )}

      {!loading && members.length > 0 && (
        <div className={styles.grid}>
          {members.map((m) => (
            <Card key={m.id} onClick={() => navigate(`/directory/${m.id}`)}>
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
    </div>
  );
}
