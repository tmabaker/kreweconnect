import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  Input,
  Button,
  Badge,
  Dropdown,
  Option,
} from "@fluentui/react-components";
import {
  Search24Regular,
  Add24Regular,
  Filter24Regular,
  Dismiss24Regular,
  ArrowUp16Regular,
  ArrowDown16Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useMockContracts } from "../../shared/hooks/useMockContracts";
import { getStatusColor, getStatusLabel, formatCurrency, formatDaysRemaining, CONTRACT_TYPES, CONTRACT_STATUSES } from "./contractUtils";
import type { ContractStatus, ContractType } from "../../shared/types";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  toolbar: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  searchInput: { minWidth: "300px", flex: 1, maxWidth: "480px" },
  filterBar: {
    display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap",
    padding: "12px 16px", backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  filterDropdown: { minWidth: "160px" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const, padding: "12px 16px", borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3, fontSize: "12px", fontWeight: "600" as const,
    textTransform: "uppercase" as const, letterSpacing: "0.5px", cursor: "pointer",
    userSelect: "none" as const,
  },
  td: {
    padding: "12px 16px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "middle" as const,
  },
  row: { cursor: "pointer", ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover } },
  sortIcon: { marginLeft: "4px", verticalAlign: "middle" },
  vendorCell: { display: "flex", flexDirection: "column", gap: "2px" },
  tagsCell: { display: "flex", flexWrap: "wrap", gap: "4px" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "64px", gap: "12px" },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", padding: "16px 0" },
});

export function ContractListPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const [showFilters, setShowFilters] = useState(false);
  const {
    contracts, totalCount, vendors,
    searchQuery, setSearchQuery,
    statusFilter, setStatusFilter,
    typeFilter, setTypeFilter,
    vendorFilter, setVendorFilter,
    sortBy, setSortBy,
    sortDir, setSortDir,
  } = useMockContracts(selectedTenant.tenantId);

  const activeFilterCount = [statusFilter, typeFilter, vendorFilter].filter(Boolean).length;

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return null;
    return sortDir === "asc" ? <ArrowUp16Regular className={styles.sortIcon} /> : <ArrowDown16Regular className={styles.sortIcon} />;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Title2>All Contracts</Title2>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px" }}>
            Manage vendor contracts across all client organizations
          </Text>
        </div>
        <Button icon={<Add24Regular />} appearance="primary" onClick={() => navigate("/contracts/new")}>
          New Contract
        </Button>
      </div>

      {/* Search & Filters */}
      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          contentBefore={<Search24Regular />}
          placeholder="Search by vendor, title, tags..."
          value={searchQuery}
          onChange={(_, d) => setSearchQuery(d.value)}
        />
        <Button
          icon={<Filter24Regular />}
          appearance={activeFilterCount > 0 ? "primary" : "subtle"}
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
        <Badge appearance="outline" color="informative">
          {totalCount} contract{totalCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      {showFilters && (
        <div className={styles.filterBar}>
          <Dropdown
            className={styles.filterDropdown}
            placeholder="Status"
            value={statusFilter ?? ""}
            onOptionSelect={(_, d) => setStatusFilter((d.optionValue === "" ? null : d.optionValue) as ContractStatus | null)}
          >
            <Option value="">All Statuses</Option>
            {CONTRACT_STATUSES.map((s) => <Option key={s} value={s}>{getStatusLabel(s)}</Option>)}
          </Dropdown>
          <Dropdown
            className={styles.filterDropdown}
            placeholder="Type"
            value={typeFilter ?? ""}
            onOptionSelect={(_, d) => setTypeFilter((d.optionValue === "" ? null : d.optionValue) as ContractType | null)}
          >
            <Option value="">All Types</Option>
            {CONTRACT_TYPES.map((t) => <Option key={t} value={t}>{t}</Option>)}
          </Dropdown>
          <Dropdown
            className={styles.filterDropdown}
            placeholder="Vendor"
            value={vendorFilter ?? ""}
            onOptionSelect={(_, d) => setVendorFilter(d.optionValue === "" ? null : (d.optionValue ?? null))}
          >
            <Option value="">All Vendors</Option>
            {vendors.map((v) => <Option key={v} value={v}>{v}</Option>)}
          </Dropdown>
          {activeFilterCount > 0 && (
            <Button appearance="subtle" icon={<Dismiss24Regular />} size="small"
              onClick={() => { setStatusFilter(null); setTypeFilter(null); setVendorFilter(null); }}>
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      {contracts.length > 0 ? (
        <Card>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} onClick={() => handleSort("title")}>Contract <SortIcon field="title" /></th>
                <th className={styles.th} onClick={() => handleSort("vendor")}>Vendor <SortIcon field="vendor" /></th>
                <th className={styles.th}>Tenant</th>
                <th className={styles.th} onClick={() => handleSort("value")}>Value <SortIcon field="value" /></th>
                <th className={styles.th} onClick={() => handleSort("status")}>Status <SortIcon field="status" /></th>
                <th className={styles.th} onClick={() => handleSort("endDate")}>Expires <SortIcon field="endDate" /></th>
                <th className={styles.th}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className={styles.row} onClick={() => navigate(`/contracts/${c.id}`)}>
                  <td className={styles.td}>
                    <Text weight="semibold">{c.title}</Text>
                    <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                      {c.contractType}{c.autoRenew ? " · Auto-renew" : ""}
                    </Text>
                  </td>
                  <td className={styles.td}><Text>{c.vendorName}</Text></td>
                  <td className={styles.td}>
                    <Badge appearance="outline" color="informative" size="small">{c.tenantDisplayName}</Badge>
                  </td>
                  <td className={styles.td}>
                    <Text weight="semibold">{c.value ? formatCurrency(c.value) : "—"}</Text>
                  </td>
                  <td className={styles.td}>
                    <Badge appearance="filled" color={getStatusColor(c.status)} size="small">
                      {getStatusLabel(c.status)}
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    <Text size={200}>{c.endDate ?? "—"}</Text>
                    {c.daysUntilExpiry !== null && c.daysUntilExpiry <= 90 && c.daysUntilExpiry > 0 && (
                      <Text size={200} style={{ display: "block", color: c.daysUntilExpiry <= 30 ? "#D13438" : "#FF8C00" }}>
                        {formatDaysRemaining(c.daysUntilExpiry)}
                      </Text>
                    )}
                  </td>
                  <td className={styles.td}>
                    <div className={styles.tagsCell}>
                      {c.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} appearance="outline" size="small">{tag}</Badge>
                      ))}
                      {c.tags.length > 3 && <Badge appearance="outline" size="small">+{c.tags.length - 3}</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className={styles.emptyState}>
          <Search24Regular style={{ fontSize: "48px", color: tokens.colorNeutralForeground3 }} />
          <Title2>No contracts found</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            {searchQuery ? `No results for "${searchQuery}".` : "No contracts match the current filters."}
          </Text>
        </div>
      )}
    </div>
  );
}
