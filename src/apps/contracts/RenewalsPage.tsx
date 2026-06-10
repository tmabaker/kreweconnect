import { useMemo } from "react";
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
} from "@fluentui/react-components";
import {
  Clock24Regular,
  ArrowLeft24Regular,
  CheckmarkCircle24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useMockContracts } from "../../shared/hooks/useMockContracts";
import { getUrgencyColor, formatCurrency, formatDaysRemaining } from "./contractUtils";
import type { ContractListItem } from "../../shared/types";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "24px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  monthGroup: { display: "flex", flexDirection: "column", gap: "12px" },
  monthLabel: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 0", borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
  },
  renewalCard: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px", cursor: "pointer",
    ":hover": { boxShadow: tokens.shadow8 },
  },
  renewalLeft: { display: "flex", flexDirection: "column", gap: "4px", flex: 1 },
  renewalMeta: { display: "flex", gap: "16px", alignItems: "center" },
  renewalRight: { display: "flex", alignItems: "center", gap: "12px" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "64px", gap: "12px" },
  legend: { display: "flex", gap: "16px", flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: "6px" },
  legendDot: { width: "12px", height: "12px", borderRadius: "50%" },
});

function groupByMonth(contracts: ContractListItem[]): Map<string, ContractListItem[]> {
  const groups = new Map<string, ContractListItem[]>();
  for (const c of contracts) {
    if (!c.endDate) continue;
    const date = new Date(c.endDate);
    const label = date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }
  return groups;
}

export function RenewalsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const { contracts } = useMockContracts(selectedTenant.tenantId);

  const renewalContracts = useMemo(() =>
    contracts
      .filter((c) => c.endDate && c.daysUntilExpiry !== null && c.daysUntilExpiry > -30 && c.daysUntilExpiry <= 90 && c.status !== "Terminated")
      .sort((a, b) => (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999)),
    [contracts]
  );

  const monthGroups = useMemo(() => groupByMonth(renewalContracts), [renewalContracts]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate("/contracts")} />
            <Title2>Upcoming Renewals</Title2>
          </div>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px", marginLeft: "44px" }}>
            Contracts expiring within the next 90 days
          </Text>
        </div>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ backgroundColor: "#D13438" }} />
          <Text size={200}>Under 30 days</Text>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ backgroundColor: "#FF8C00" }} />
          <Text size={200}>30–60 days</Text>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ backgroundColor: "#107C10" }} />
          <Text size={200}>60–90 days</Text>
        </div>
      </div>

      {renewalContracts.length > 0 ? (
        Array.from(monthGroups.entries()).map(([month, items]) => (
          <div key={month} className={styles.monthGroup}>
            <div className={styles.monthLabel}>
              <Clock24Regular />
              <Title3>{month}</Title3>
              <Badge appearance="outline" color="informative" size="small">{items.length}</Badge>
            </div>
            {items.map((c) => (
              <Card
                key={c.id}
                className={styles.renewalCard}
                onClick={() => navigate(`/contracts/${c.id}`)}
              >
                <div className={styles.renewalLeft}>
                  <Text weight="semibold" size={400}>{c.title}</Text>
                  <div className={styles.renewalMeta}>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {c.vendorName}
                    </Text>
                    <Badge appearance="outline" color="informative" size="small">
                      {c.tenantDisplayName}
                    </Badge>
                    {c.autoRenew && (
                      <Badge appearance="outline" color="brand" size="small">Auto-Renew</Badge>
                    )}
                  </div>
                </div>
                <div className={styles.renewalRight}>
                  {c.value && <Text weight="semibold">{formatCurrency(c.value)}</Text>}
                  <Badge
                    appearance="filled"
                    color={getUrgencyColor(c.daysUntilExpiry ?? 999)}
                    size="medium"
                  >
                    {formatDaysRemaining(c.daysUntilExpiry)}
                  </Badge>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <Button appearance="primary" size="small">Renew</Button>
                    <Button appearance="subtle" size="small">Snooze</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ))
      ) : (
        <div className={styles.emptyState}>
          <CheckmarkCircle24Regular style={{ fontSize: "48px", color: "#107C10" }} />
          <Title2>All Clear!</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            No contracts expiring within the next 90 days.
          </Text>
        </div>
      )}
    </div>
  );
}
