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
  Switch,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
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
import { useContracts } from "../../shared/hooks/useContracts";
import { useIsMobile } from "../../shared/hooks/useIsMobile";
import {
  getStatusColor, getStatusLabel, formatCurrency, formatDaysRemaining, CONTRACT_STATUSES, AGREEMENT_CATEGORIES,
  getCategoryLabel, getRenewalTypeLabel, contractPath,
} from "./contractUtils";
import type { AgreementCategory, ContractStatus } from "../../shared/types";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" },
  toolbar: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  searchInput: {
    minWidth: "300px", flex: 1, maxWidth: "480px",
    "@media (max-width: 768px)": { minWidth: "100%", maxWidth: "100%" },
  },
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
  // Phone layout: one card per agreement so the title gets the full width.
  cardList: { display: "flex", flexDirection: "column", gap: "8px" },
  mobileCard: { padding: "12px 14px", cursor: "pointer", gap: "6px" },
  mobileTitle: { display: "block", overflowWrap: "anywhere" as const },
  mobileMeta: { display: "block", color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" as const },
  mobileBadges: { display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" },
  mobileSort: { display: "flex", gap: "8px", alignItems: "center" },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", padding: "16px 0" },
});

// Same fields the desktop table headers sort by.
const MOBILE_SORTS = [
  { field: "title", label: "Contract" },
  { field: "vendor", label: "Vendor" },
  { field: "endDate", label: "Expires" },
  { field: "decisionDate", label: "Latest decision date" },
  { field: "value", label: "Value" },
  { field: "status", label: "Status" },
  { field: "category", label: "Category" },
  { field: "renewalType", label: "Renewal type" },
  { field: "location", label: "Location" },
  { field: "tier", label: "Tier" },
];

export function ContractListPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const isMobile = useIsMobile();
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const {
    contracts, totalCount, vendors, locations, allContracts, loading, error, reload,
    searchQuery, setSearchQuery,
    statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    vendorFilter, setVendorFilter,
    locationFilter, setLocationFilter,
    needsReviewOnly, setNeedsReviewOnly,
    sortBy, setSortBy,
    sortDir, setSortDir,
  } = useContracts(selectedTenant.tenantId, { includeArchived: showArchived });

  const activeFilterCount = [statusFilter, categoryFilter, vendorFilter, locationFilter, needsReviewOnly, showArchived].filter(Boolean).length;

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
          <Title2>All Agreements</Title2>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px" }}>
            {selectedTenant.tenantId === "all" ? "Agreements across every client" : `Agreements for ${selectedTenant.displayName}`}
          </Text>
        </div>
        <Button icon={<Add24Regular />} appearance="primary" onClick={() => navigate("/contracts/new")}>
          Upload Agreement
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
            placeholder="Category"
            value={categoryFilter ? getCategoryLabel(categoryFilter) : ""}
            onOptionSelect={(_, d) => setCategoryFilter((d.optionValue === "" ? null : d.optionValue) as AgreementCategory | null)}
          >
            <Option value="">All Categories</Option>
            {AGREEMENT_CATEGORIES.map((c) => <Option key={c} value={c}>{getCategoryLabel(c)}</Option>)}
          </Dropdown>
          {locations.length > 0 && (
            <Dropdown
              className={styles.filterDropdown}
              placeholder="Location"
              value={locationFilter ?? ""}
              onOptionSelect={(_, d) => setLocationFilter(d.optionValue === "" ? null : (d.optionValue ?? null))}
            >
              <Option value="">All Locations</Option>
              {locations.map((l) => <Option key={l} value={l}>{l}</Option>)}
            </Dropdown>
          )}
          <Dropdown
            className={styles.filterDropdown}
            placeholder="Vendor"
            value={vendorFilter ?? ""}
            onOptionSelect={(_, d) => setVendorFilter(d.optionValue === "" ? null : (d.optionValue ?? null))}
          >
            <Option value="">All Vendors</Option>
            {vendors.map((v) => <Option key={v} value={v}>{v}</Option>)}
          </Dropdown>
          <Switch
            checked={needsReviewOnly}
            onChange={(_, d) => setNeedsReviewOnly(d.checked)}
            label="Needs review"
          />
          <Switch
            checked={showArchived}
            onChange={(_, d) => setShowArchived(d.checked)}
            label="Show archived"
          />
          {activeFilterCount > 0 && (
            <Button appearance="subtle" icon={<Dismiss24Regular />} size="small"
              onClick={() => { setStatusFilter(null); setCategoryFilter(null); setVendorFilter(null); setLocationFilter(null); setNeedsReviewOnly(false); setShowArchived(false); }}>
              Clear
            </Button>
          )}
        </div>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
          <MessageBarActions>
            <Button size="small" onClick={reload}>Try again</Button>
          </MessageBarActions>
        </MessageBar>
      )}

      {/* Table */}
      {loading ? (
        <Spinner label="Loading agreements…" />
      ) : contracts.length > 0 && isMobile ? (
        <div className={styles.cardList}>
          {/* The table headers are the sort controls on desktop; phones get them here. */}
          <div className={styles.mobileSort}>
            <Dropdown
              aria-label="Sort by"
              style={{ flex: 1, minWidth: 0 }}
              value={`Sort: ${MOBILE_SORTS.find((o) => o.field === sortBy)?.label ?? "Contract"}`}
              selectedOptions={[sortBy]}
              onOptionSelect={(_, d) => d.optionValue && setSortBy(d.optionValue)}
            >
              {MOBILE_SORTS.map((o) => <Option key={o.field} value={o.field}>{o.label}</Option>)}
            </Dropdown>
            <Button
              appearance="subtle"
              icon={sortDir === "asc" ? <ArrowUp16Regular /> : <ArrowDown16Regular />}
              aria-label={sortDir === "asc" ? "Sorted ascending" : "Sorted descending"}
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
            />
          </div>
          {contracts.map((c) => (
            <Card key={c.id} className={styles.mobileCard} onClick={() => navigate(contractPath(c.tenantId, c.id))}>
              <Text weight="semibold" className={styles.mobileTitle}>{c.title}</Text>
              <Text size={200} className={styles.mobileMeta}>
                {[c.vendorName, getCategoryLabel(c.agreementCategory), c.location].filter(Boolean).join(" · ")}
              </Text>
              <div className={styles.mobileBadges}>
                <Badge appearance="filled" color={getStatusColor(c.status)} size="small">
                  {getStatusLabel(c.status)}
                </Badge>
                {selectedTenant.tenantId === "all" && (
                  <Badge appearance="outline" color="informative" size="small">{c.tenantDisplayName}</Badge>
                )}
                {c.needsReview && <Badge appearance="outline" color="severe" size="small">Review</Badge>}
                {c.isArchived && <Badge appearance="tint" color="subtle" size="small">Archived</Badge>}
                {c.value ? <Text size={200} weight="semibold">{formatCurrency(c.value)}</Text> : null}
              </div>
              {c.endDate && (
                <Text size={200} className={styles.mobileMeta}>
                  Expires {c.endDate}
                  {c.daysUntilExpiry !== null && c.daysUntilExpiry <= 90 && c.daysUntilExpiry > 0 && (
                    <span style={{ color: c.daysUntilExpiry <= 30 ? "#D13438" : "#FF8C00" }}>
                      {" · "}{formatDaysRemaining(c.daysUntilExpiry)}
                    </span>
                  )}
                </Text>
              )}
            </Card>
          ))}
        </div>
      ) : contracts.length > 0 ? (
        <Card style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} onClick={() => handleSort("title")}>Contract <SortIcon field="title" /></th>
                <th className={styles.th} onClick={() => handleSort("vendor")}>Vendor <SortIcon field="vendor" /></th>
                <th className={styles.th} onClick={() => handleSort("category")}>Category <SortIcon field="category" /></th>
                <th className={styles.th} onClick={() => handleSort("renewalType")}>Renewal type <SortIcon field="renewalType" /></th>
                <th className={styles.th}>Tenant</th>
                <th className={styles.th} onClick={() => handleSort("location")}>Location <SortIcon field="location" /></th>
                <th className={styles.th} onClick={() => handleSort("value")}>Value <SortIcon field="value" /></th>
                <th className={styles.th} onClick={() => handleSort("status")}>Status <SortIcon field="status" /></th>
                <th className={styles.th} onClick={() => handleSort("endDate")}>Expires <SortIcon field="endDate" /></th>
                <th className={styles.th} onClick={() => handleSort("decisionDate")}>Latest decision date <SortIcon field="decisionDate" /></th>
                <th className={styles.th} onClick={() => handleSort("tier")}>Tier <SortIcon field="tier" /></th>
                <th className={styles.th}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className={styles.row} onClick={() => navigate(contractPath(c.tenantId, c.id))}>
                  <td className={styles.td}>
                    <Text weight="semibold">{c.title}</Text>
                    <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                      {[c.department, c.autoRenew ? "Auto-renew" : null, c.isArchived ? "Archived" : null].filter(Boolean).join(" · ")}
                    </Text>
                  </td>
                  <td className={styles.td}><Text>{c.vendorName}</Text></td>
                  <td className={styles.td}><Text size={200}>{getCategoryLabel(c.agreementCategory)}</Text></td>
                  <td className={styles.td}><Text size={200}>{getRenewalTypeLabel(c.renewalType)}</Text></td>
                  <td className={styles.td}>
                    <Badge appearance="outline" color="informative" size="small">{c.tenantDisplayName}</Badge>
                  </td>
                  <td className={styles.td}><Text size={200}>{c.location ?? "—"}</Text></td>
                  <td className={styles.td}>
                    <Text weight="semibold">{c.value ? formatCurrency(c.value) : "—"}</Text>
                  </td>
                  <td className={styles.td}>
                    <Badge appearance="filled" color={getStatusColor(c.status)} size="small">
                      {getStatusLabel(c.status)}
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    <Text size={200}>{c.endDate || "—"}</Text>
                    {c.daysUntilExpiry !== null && c.daysUntilExpiry <= 90 && c.daysUntilExpiry > 0 && (
                      <Text size={200} style={{ display: "block", color: c.daysUntilExpiry <= 30 ? "#D13438" : "#FF8C00" }}>
                        {formatDaysRemaining(c.daysUntilExpiry)}
                      </Text>
                    )}
                  </td>
                  <td className={styles.td}>
                    <Text size={200}>{c.latestRenewalDecisionDate ?? "—"}</Text>
                  </td>
                  <td className={styles.td}>
                    {c.confidenceTier ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Badge
                          appearance="tint"
                          size="small"
                          color={c.confidenceTier === "A" ? "success" : c.confidenceTier === "B" ? "warning" : "danger"}
                        >
                          {c.confidenceTier}
                        </Badge>
                        {c.needsReview && <Badge appearance="outline" color="severe" size="small">Review</Badge>}
                      </div>
                    ) : "—"}
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
          <Title2>{allContracts.length === 0 && !error ? "No agreements yet" : "No agreements found"}</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            {allContracts.length === 0 && !error
              ? "Upload a signed agreement to add the first one."
              : searchQuery ? `No results for "${searchQuery}".` : "No agreements match the current filters."}
          </Text>
        </div>
      )}
    </div>
  );
}
