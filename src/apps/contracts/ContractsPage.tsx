import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Title3,
  Text,
  Card,
  Badge,
  Button,
  Divider,
} from "@fluentui/react-components";
import {
  DocumentText24Regular,
  Add24Regular,
  ArrowRight16Regular,
  Warning24Regular,
  Money24Regular,
  CheckmarkCircle24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useMockContracts } from "../../shared/hooks/useMockContracts";
import { getStatusColor, getUrgencyColor, formatCurrency, formatDaysRemaining } from "./contractUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "24px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  branding: { display: "flex", flexDirection: "column", gap: "4px" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" },
  statCard: { padding: "20px", textAlign: "center" as const },
  statValue: { display: "block", fontSize: "32px", fontWeight: "bold" as const, lineHeight: "1.2" },
  statLabel: { display: "block", marginTop: "4px", color: tokens.colorNeutralForeground3 },
  section: { display: "flex", flexDirection: "column", gap: "12px" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  alertGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" },
  alertCard: { padding: "16px", cursor: "pointer", ":hover": { boxShadow: tokens.shadow8 } },
  alertHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" },
  alertVendor: { fontWeight: "bold" as const },
  recentList: { display: "flex", flexDirection: "column", gap: "8px" },
  recentItem: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: "pointer", ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  recentLeft: { display: "flex", flexDirection: "column", gap: "2px", flex: 1 },
  recentRight: { display: "flex", alignItems: "center", gap: "12px" },
  tagChip: { marginRight: "4px" },
});

export function ContractsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const { dashboard } = useMockContracts(selectedTenant.tenantId);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.branding}>
          <Title2>⚖️ KreweReview</Title2>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3, maxWidth: "600px" }}>
            Transform murky contracts into clear, actionable insights — so you'll always know what
            you've agreed to, with whom, and what comes next.
          </Text>
        </div>
        <Button icon={<Add24Regular />} appearance="primary" onClick={() => navigate("/contracts/new")}>
          New Contract
        </Button>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <Card className={styles.statCard}>
          <DocumentText24Regular style={{ color: tokens.colorBrandForeground1, fontSize: "28px" }} />
          <Text className={styles.statValue} style={{ color: tokens.colorBrandForeground1 }}>
            {dashboard.totalContracts}
          </Text>
          <Text className={styles.statLabel} size={200}>Total Contracts</Text>
        </Card>
        <Card className={styles.statCard}>
          <CheckmarkCircle24Regular style={{ color: "#107C10", fontSize: "28px" }} />
          <Text className={styles.statValue} style={{ color: "#107C10" }}>
            {dashboard.activeContracts}
          </Text>
          <Text className={styles.statLabel} size={200}>Active</Text>
        </Card>
        <Card className={styles.statCard}>
          <Warning24Regular style={{ color: "#D13438", fontSize: "28px" }} />
          <Text className={styles.statValue} style={{ color: "#D13438" }}>
            {dashboard.expiringSoon}
          </Text>
          <Text className={styles.statLabel} size={200}>Expiring Soon</Text>
        </Card>
        <Card className={styles.statCard}>
          <Money24Regular style={{ color: "#8764B8", fontSize: "28px" }} />
          <Text className={styles.statValue} style={{ color: "#8764B8" }}>
            {formatCurrency(dashboard.totalValue)}
          </Text>
          <Text className={styles.statLabel} size={200}>Total Value</Text>
        </Card>
      </div>

      {/* Expiring Soon Alerts */}
      {dashboard.upcomingRenewals.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <Title3>⚠️ Contracts Expiring Soon</Title3>
            <Button
              appearance="subtle"
              icon={<ArrowRight16Regular />}
              iconPosition="after"
              onClick={() => navigate("/contracts/renewals")}
            >
              View All Renewals
            </Button>
          </div>
          <div className={styles.alertGrid}>
            {dashboard.upcomingRenewals.map((alert) => (
              <Card
                key={alert.id}
                className={styles.alertCard}
                onClick={() => navigate(`/contracts/${alert.contractId}`)}
              >
                <div className={styles.alertHeader}>
                  <div>
                    <Text className={styles.alertVendor}>{alert.vendorName}</Text>
                    <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                      {alert.contractTitle}
                    </Text>
                  </div>
                  <Badge
                    appearance="filled"
                    color={getUrgencyColor(alert.daysRemaining ?? 999)}
                    size="small"
                  >
                    {formatDaysRemaining(alert.daysRemaining)}
                  </Badge>
                </div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {alert.tenantDisplayName} · Expires {alert.contractEndDate}
                </Text>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Divider />

      {/* Recent Contracts */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Title3>Recent Contracts</Title3>
          <Button
            appearance="subtle"
            icon={<ArrowRight16Regular />}
            iconPosition="after"
            onClick={() => navigate("/contracts/all")}
          >
            View All
          </Button>
        </div>
        <div className={styles.recentList}>
          {dashboard.recentContracts.map((contract) => (
            <div
              key={contract.id}
              className={styles.recentItem}
              onClick={() => navigate(`/contracts/${contract.id}`)}
            >
              <div className={styles.recentLeft}>
                <Text weight="semibold">{contract.title}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {contract.vendorName} · {contract.tenantDisplayName}
                </Text>
              </div>
              <div className={styles.recentRight}>
                {contract.value && (
                  <Text size={200} weight="semibold">{formatCurrency(contract.value)}</Text>
                )}
                <Badge appearance="filled" color={getStatusColor(contract.status)} size="small">
                  {contract.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
