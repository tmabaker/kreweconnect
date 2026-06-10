import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  Body1,
} from "@fluentui/react-components";
import {
  People24Regular,
  DocumentText24Regular,
  Building24Regular,
  ShieldKeyhole24Regular,
  ArrowTrending24Regular,
  Warning24Regular,
} from "@fluentui/react-icons";

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

// Mock dashboard data — will be replaced with real API calls
const dashboardData = {
  tenants: 8,
  employees: 342,
  activeContracts: 72,
  expiringContracts: 5,
  totalContractValue: 485000,
  monthlyRecurring: 12500,
};

export function DashboardPage() {
  const styles = useStyles();

  const cards = [
    { icon: <Building24Regular />, value: dashboardData.tenants, label: "Client Tenants", color: "#0078d4" },
    { icon: <People24Regular />, value: dashboardData.employees, label: "Employees", color: "#107c10" },
    { icon: <DocumentText24Regular />, value: dashboardData.activeContracts, label: "Active Contracts", color: "#5c2d91" },
    { icon: <Warning24Regular />, value: dashboardData.expiringContracts, label: "Expiring (30 days)", color: "#d83b01" },
    { icon: <ArrowTrending24Regular />, value: `$${(dashboardData.totalContractValue / 1000).toFixed(0)}K`, label: "Total Contract Value", color: "#008272" },
    { icon: <ShieldKeyhole24Regular />, value: `$${(dashboardData.monthlyRecurring).toLocaleString()}`, label: "Monthly Recurring", color: "#0078d4" },
  ];

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

      <div className={styles.grid}>
        {cards.map((card, i) => (
          <Card key={i} className={styles.card}>
            <div className={styles.cardContent}>
              <div className={styles.iconContainer}>{card.icon}</div>
              <div>
                <div className={styles.metricValue}>{card.value}</div>
                <Text size={200} className={styles.metricLabel}>
                  {card.label}
                </Text>
              </div>
            </div>
          </Card>
        ))}
      </div>

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
