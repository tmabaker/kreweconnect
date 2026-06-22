import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  Body1,
} from "@fluentui/react-components";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    padding: "20px",
  },
  cardContent: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  iconContainer: {
    width: "48px",
    height: "48px",
    borderRadius: tokens.borderRadiusMedium,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: tokens.fontWeightBold,
    lineHeight: "1",
  },
  metricLabel: {
    color: tokens.colorNeutralForeground3,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
});

// Dashboard data will be populated from live API calls once tenants are connected.

export function DashboardPage() {
  const styles = useStyles();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Title2>Dashboard</Title2>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px" }}>
            KreweConnect — How the Good Teams Roll
          </Text>
          <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground4, marginTop: "2px" }}>
            NO & SE IT Group deploys KreweConnect, a modern employee directory built for the way your team works.
          </Text>
        </div>
      </div>

      <Card className={styles.card}>
        <Body1>
          Metrics will appear here once your Microsoft 365 tenants are connected. This dashboard will
          show client tenant count, total employees, active contracts, upcoming renewals, and contract
          value at a glance.
        </Body1>
      </Card>

      <div className={styles.section}>
        <Title2>Recent Activity</Title2>
        <Card className={styles.card}>
          <Body1>
            Activity feed will appear here once the backend is connected. This dashboard will show
            recent tenant syncs, contract changes, new employees discovered, and GDAP relationship
            health.
          </Body1>
        </Card>
      </div>
    </div>
  );
}
