import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Button,
  Badge,
  Input,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { Add24Regular, Search24Regular, Folder20Regular } from "@fluentui/react-icons";
import { fetchPolicies, type GovPolicySummary } from "../../services/governanceService";
import { useGovQuery, getPolicyStatusColor, formatDate, errorMessage } from "./governanceUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  toolbar: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  searchInput: { minWidth: "300px", flex: 1, maxWidth: "480px" },
  categoryHeader: {
    display: "flex", alignItems: "center", gap: "8px", marginTop: "8px",
    color: tokens.colorNeutralForeground3,
  },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const, padding: "12px 16px",
    borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3, fontSize: "12px", fontWeight: "600" as const,
    textTransform: "uppercase" as const, letterSpacing: "0.5px",
  },
  td: {
    padding: "12px 16px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "middle" as const,
  },
  row: { cursor: "pointer", ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover } },
  emptyState: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "64px", gap: "12px",
  },
});

/** Policy library (staff): every template, grouped by category. */
export function GovernancePage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: policies, loading, error, reload } = useGovQuery(fetchPolicies);

  const grouped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = (policies ?? []).filter(
      (p) =>
        !query ||
        p.title.toLowerCase().includes(query) ||
        (p.summary ?? "").toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
    );
    const byCategory = new Map<string, GovPolicySummary[]>();
    for (const policy of filtered) {
      const list = byCategory.get(policy.category) ?? [];
      list.push(policy);
      byCategory.set(policy.category, list);
    }
    return byCategory;
  }, [policies, searchQuery]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Title2>Policy Library</Title2>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
            KREWE Governance — policy templates with {"{{variable}}"} placeholders, assembled per client
          </Text>
        </div>
        <Button appearance="primary" icon={<Add24Regular />} onClick={() => navigate("/governance/policies/new")}>
          New Policy
        </Button>
      </div>

      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          contentBefore={<Search24Regular />}
          placeholder="Search policies…"
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
        />
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            {errorMessage(error)}{" "}
            <Button size="small" appearance="transparent" onClick={reload}>Retry</Button>
          </MessageBarBody>
        </MessageBar>
      )}

      {loading && <Spinner label="Loading policy library…" />}

      {!loading && !error && grouped.size === 0 && (
        <div className={styles.emptyState}>
          <Text size={400} weight="semibold">No policies found</Text>
          <Text size={300}>
            {searchQuery ? "Try a different search." : "Create the first policy template to get started."}
          </Text>
        </div>
      )}

      {[...grouped.entries()].map(([category, list]) => (
        <div key={category}>
          <div className={styles.categoryHeader}>
            <Folder20Regular />
            <Text size={300} weight="semibold" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {category}
            </Text>
            <Badge appearance="tint" color="informative">{list.length}</Badge>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: "40%" }}>Policy</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Version</th>
                <th className={styles.th}>Next Review</th>
              </tr>
            </thead>
            <tbody>
              {list.map((policy) => (
                <tr
                  key={policy.id}
                  className={styles.row}
                  onClick={() => navigate(`/governance/policies/${policy.id}`)}
                >
                  <td className={styles.td}>
                    <Text weight="semibold" style={{ display: "block" }}>{policy.title}</Text>
                    {policy.summary && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {policy.summary}
                      </Text>
                    )}
                  </td>
                  <td className={styles.td}>
                    <Badge appearance="tint" color={getPolicyStatusColor(policy.status)}>
                      {policy.status}
                    </Badge>
                  </td>
                  <td className={styles.td}><Text size={300}>v{policy.currentVersion}</Text></td>
                  <td className={styles.td}><Text size={300}>{formatDate(policy.nextReviewDate)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
