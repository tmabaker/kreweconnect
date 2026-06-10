/**
 * TenantSwitcher Component
 *
 * Admin-only component that lists all GDAP-connected tenants and allows
 * switching between them. Only visible to NOIT MSP administrators.
 */

import { useState, useEffect } from "react";
import {
  Dropdown,
  Option,
  makeStyles,
  tokens,
  Spinner,
  Text,
  Badge,
} from "@fluentui/react-components";
import { Building24Regular, ShieldCheckmark24Regular } from "@fluentui/react-icons";
import { getAvailableTenants, type TenantInfo } from "../services/tenantService";
import type { TenantSelection } from "../shared/hooks/useTenantContext";

const useStyles = makeStyles({
  container: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingLeft: "12px",
    paddingRight: "12px",
  },
  icon: {
    color: tokens.colorBrandForeground1,
  },
  dropdown: {
    minWidth: "220px",
  },
  adminBadge: {
    marginLeft: "4px",
  },
});

interface TenantSwitcherProps {
  selectedTenant: TenantSelection;
  onTenantChange: (tenant: TenantSelection) => void;
  isMspAdmin: boolean;
}

export function TenantSwitcher({
  selectedTenant,
  onTenantChange,
  isMspAdmin,
}: TenantSwitcherProps) {
  const styles = useStyles();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadTenants() {
      try {
        const available = await getAvailableTenants();
        if (!cancelled) {
          setTenants(available);
        }
      } catch {
        // Keep empty list on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTenants();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <Spinner size="tiny" />
        <Text size={200}>Loading tenants...</Text>
      </div>
    );
  }

  if (!isMspAdmin) {
    // Client users only see their own tenant — no switcher needed
    return (
      <div className={styles.container}>
        <Building24Regular className={styles.icon} />
        <Text weight="semibold" size={300}>
          {selectedTenant.displayName}
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Building24Regular className={styles.icon} />
      <Dropdown
        className={styles.dropdown}
        value={selectedTenant.displayName}
        selectedOptions={[selectedTenant.tenantId]}
        onOptionSelect={(_e, data) => {
          if (data.optionValue === "all") {
            onTenantChange({ tenantId: "all", displayName: "All Tenants" });
          } else {
            const tenant = tenants.find((t) => t.tenantId === data.optionValue);
            if (tenant) {
              onTenantChange({
                tenantId: tenant.tenantId,
                displayName: tenant.displayName,
              });
            }
          }
        }}
        size="small"
      >
        <Option value="all">All Tenants</Option>
        {tenants.map((t) => (
          <Option key={t.tenantId} value={t.tenantId}>
            {t.displayName}
          </Option>
        ))}
      </Dropdown>
      {isMspAdmin && (
        <Badge
          appearance="outline"
          color="success"
          size="small"
          icon={<ShieldCheckmark24Regular />}
          className={styles.adminBadge}
        >
          Admin
        </Badge>
      )}
    </div>
  );
}
