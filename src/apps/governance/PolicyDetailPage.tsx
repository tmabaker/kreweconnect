import { useNavigate, useParams } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Button,
  Badge,
  Card,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  Edit24Regular,
  FormNew24Regular,
  PlayCircle24Regular,
  ArrowLeft24Regular,
  History24Regular,
} from "@fluentui/react-icons";
import {
  fetchPolicy,
  fetchPolicyVersions,
} from "../../services/governanceService";
import { useGovQuery, getPolicyStatusColor, formatDate, formatDateTime, errorMessage } from "./governanceUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1100px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" },
  titleBlock: { display: "flex", flexDirection: "column", gap: "6px" },
  meta: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  actions: { display: "flex", gap: "8px", flexWrap: "wrap" },
  content: {
    whiteSpace: "pre-wrap" as const,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: "13px",
    lineHeight: "1.6",
    padding: "16px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    overflowX: "auto" as const,
    maxHeight: "480px",
    overflowY: "auto" as const,
  },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const, padding: "8px 12px",
    borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3, fontSize: "12px", fontWeight: "600" as const,
    textTransform: "uppercase" as const, letterSpacing: "0.5px",
  },
  td: {
    padding: "8px 12px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "top" as const,
  },
  sectionTitle: { marginTop: "8px" },
});

/** Staff view of one policy template: content, wizard variables, versions. */
export function PolicyDetailPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: policy, loading, error } = useGovQuery(() => fetchPolicy(id!), [id]);
  const { data: versions } = useGovQuery(() => fetchPolicyVersions(id!), [id]);

  if (loading) return <Spinner label="Loading policy…" />;
  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{errorMessage(error)}</MessageBarBody>
      </MessageBar>
    );
  }
  if (!policy) return null;

  return (
    <div className={styles.page}>
      <div>
        <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate("/governance")}>
          Policy Library
        </Button>
      </div>

      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <Title2>{policy.title}</Title2>
          <div className={styles.meta}>
            <Badge appearance="tint" color={getPolicyStatusColor(policy.status)}>{policy.status}</Badge>
            <Badge appearance="tint" color="informative">v{policy.currentVersion}</Badge>
            <Text size={300}>{policy.category}</Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              Next review: {formatDate(policy.nextReviewDate)}
            </Text>
          </div>
          {policy.summary && <Text size={300}>{policy.summary}</Text>}
        </div>
        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={<PlayCircle24Regular />}
            onClick={() => navigate(`/governance/policies/${policy.id}/wizard`)}
          >
            Run Wizard
          </Button>
          <Button icon={<Edit24Regular />} onClick={() => navigate(`/governance/policies/${policy.id}/edit`)}>
            Edit
          </Button>
          <Button
            icon={<FormNew24Regular />}
            onClick={() => navigate(`/governance/policies/${policy.id}/variables`)}
          >
            Edit Variables
          </Button>
        </div>
      </div>

      <Card>
        <Text weight="semibold">Template content</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {"{{tokens}}"} below are filled from each client's wizard answers at assembly time.
        </Text>
        <div className={styles.content}>{policy.content || "(no content yet)"}</div>
      </Card>

      <Card>
        <Text weight="semibold" className={styles.sectionTitle}>
          Wizard variables ({policy.variables.length})
        </Text>
        {policy.variables.length === 0 ? (
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            No variables defined — the wizard will have nothing to ask.
          </Text>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Key</th>
                <th className={styles.th}>Question</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Scope</th>
                <th className={styles.th}>Required</th>
              </tr>
            </thead>
            <tbody>
              {policy.variables.map((variable) => (
                <tr key={variable.key}>
                  <td className={styles.td}>
                    <code>{`{{${variable.key}}}`}</code>
                  </td>
                  <td className={styles.td}>
                    <Text size={300} style={{ display: "block" }}>{variable.label}</Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {variable.question}
                    </Text>
                  </td>
                  <td className={styles.td}><Text size={300}>{variable.inputType}</Text></td>
                  <td className={styles.td}>
                    <Badge appearance="tint" color={variable.isUniversal ? "brand" : "subtle"}>
                      {variable.isUniversal ? "universal" : "policy-specific"}
                    </Badge>
                  </td>
                  <td className={styles.td}><Text size={300}>{variable.required ? "yes" : "no"}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <History24Regular />
          <Text weight="semibold">Version history</Text>
        </div>
        {!versions || versions.length === 0 ? (
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>No versions recorded.</Text>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Version</th>
                <th className={styles.th}>Change notes</th>
                <th className={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td className={styles.td}><Text size={300}>v{version.versionNumber}</Text></td>
                  <td className={styles.td}><Text size={300}>{version.changeNotes || "—"}</Text></td>
                  <td className={styles.td}><Text size={300}>{formatDateTime(version.createdAt)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
