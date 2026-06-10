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
  Avatar,
  Dropdown,
  Option,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from "@fluentui/react-components";
import {
  Search24Regular,
  ArrowSync24Regular,
  Mail24Regular,
  Phone24Regular,
  Building24Regular,
  Filter24Regular,
  Dismiss24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useGraphEmployees } from "../../shared/hooks/useGraphEmployees";
import type { EmployeeListItem } from "../../shared/types";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  toolbar: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  searchInput: { minWidth: "300px", flex: 1, maxWidth: "480px" },
  filterBar: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
    padding: "12px 16px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  filterDropdown: { minWidth: "160px" },
  activeFilters: { display: "flex", gap: "6px", flexWrap: "wrap" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
  },
  card: {
    padding: "16px",
    cursor: "pointer",
    transition: "box-shadow 0.15s, transform 0.15s",
    ":hover": {
      boxShadow: tokens.shadow8,
      transform: "translateY(-2px)",
    },
  },
  cardHeader: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardTitle: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground3,
  },
  cardDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cardDetailRow: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: tokens.colorNeutralForeground3 },
  cardDetailIcon: { fontSize: "14px", color: tokens.colorNeutralForeground3, flexShrink: 0 },
  cardDetailText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tenantBadge: { marginTop: "8px" },
  statsBar: {
    display: "flex",
    gap: "24px",
    padding: "12px 0",
  },
  statItem: { display: "flex", flexDirection: "column" },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "64px 24px",
    gap: "12px",
  },
});

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAvatarColor(name: string): "brand" | "dark-red" | "cranberry" | "pumpkin" | "peach" | "marigold" | "gold" | "brass" | "brown" | "forest" | "seafoam" | "dark-green" | "light-teal" | "teal" | "steel" | "blue" | "royal-blue" | "cornflower" | "navy" | "lavender" | "purple" | "grape" | "lilac" | "pink" | "magenta" | "plum" | "beige" | "mink" | "platinum" | "anchor" {
  const colors = [
    "brand", "dark-red", "cranberry", "pumpkin", "marigold", "forest",
    "seafoam", "teal", "steel", "blue", "royal-blue", "cornflower",
    "navy", "lavender", "purple", "grape", "lilac", "pink", "magenta", "plum",
  ] as const;
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export function DirectoryPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const [showFilters, setShowFilters] = useState(false);

  const {
    employees,
    totalCount,
    facets,
    searchQuery,
    setSearchQuery,
    departmentFilter,
    setDepartmentFilter,
    officeFilter,
    setOfficeFilter,
    sortBy,
    setSortBy,
    loading,
    error,
    refresh,
  } = useGraphEmployees(selectedTenant.tenantId);

  const activeFilterCount = [departmentFilter, officeFilter].filter(Boolean).length;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <Title2>KreweConnect Directory</Title2>
          <Text
            size={300}
            style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px" }}
          >
            Search and manage employees across all client tenants
          </Text>
        </div>
        <div className={styles.toolbar}>
          <Button
            icon={<ArrowSync24Regular />}
            appearance="subtle"
            onClick={() => refresh?.()}
            disabled={loading}
          >
            {loading ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          contentBefore={<Search24Regular />}
          placeholder="Search by name, email, department, title..."
          size="medium"
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
        />
        <Button
          icon={<Filter24Regular />}
          appearance={activeFilterCount > 0 ? "primary" : "subtle"}
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
        <Dropdown
          placeholder="Sort by"
          value={sortBy === "department" ? "Department" : "Name A-Z"}
          onOptionSelect={(_, data) =>
            setSortBy(data.optionValue === "department" ? "department" : "name")
          }
          style={{ minWidth: "140px" }}
        >
          <Option value="name">Name A-Z</Option>
          <Option value="department">Department</Option>
        </Dropdown>
        <Badge appearance="outline" color="informative">
          {totalCount} employee{totalCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className={styles.filterBar}>
          <Dropdown
            className={styles.filterDropdown}
            placeholder="Department"
            value={departmentFilter ?? ""}
            onOptionSelect={(_, data) =>
              setDepartmentFilter(data.optionValue === "" ? null : (data.optionValue ?? null))
            }
          >
            <Option value="">All Departments</Option>
            {facets.departments.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Dropdown>
          <Dropdown
            className={styles.filterDropdown}
            placeholder="Office"
            value={officeFilter ?? ""}
            onOptionSelect={(_, data) =>
              setOfficeFilter(data.optionValue === "" ? null : (data.optionValue ?? null))
            }
          >
            <Option value="">All Offices</Option>
            {facets.offices.map((o) => (
              <Option key={o} value={o}>
                {o}
              </Option>
            ))}
          </Dropdown>
          {activeFilterCount > 0 && (
            <Button
              appearance="subtle"
              icon={<Dismiss24Regular />}
              size="small"
              onClick={() => {
                setDepartmentFilter(null);
                setOfficeFilter(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Directory Error</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
          <Spinner size="large" label="Loading directory..." />
        </div>
      )}

      {/* Employee Grid */}
      {!loading && employees.length > 0 ? (
        <div className={styles.grid}>
          {employees.map((emp) => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              onClick={() => navigate(`/directory/${emp.id}`)}
            />
          ))}
        </div>
      ) : !loading ? (
        <div className={styles.emptyState}>
          <Search24Regular style={{ fontSize: "48px", color: tokens.colorNeutralForeground3 }} />
          <Title2>No employees found</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            {searchQuery
              ? `No results for "${searchQuery}". Try a different search term.`
              : "No employees match the current filters."}
          </Text>
        </div>
      ) : null}
    </div>
  );
}

function EmployeeCard({ employee, onClick }: { employee: EmployeeListItem; onClick: () => void }) {
  const styles = useStyles();
  return (
    <Card className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <Avatar
          name={employee.displayName}
          initials={getInitials(employee.displayName)}
          color={getAvatarColor(employee.displayName)}
          size={48}
        />
        <div className={styles.cardInfo}>
          <Text weight="semibold" size={400} className={styles.cardName}>
            {employee.displayName}
          </Text>
          <Text size={200} className={styles.cardTitle}>
            {employee.jobTitle || "No title"}
          </Text>
        </div>
      </div>

      <div className={styles.cardDetails}>
        {employee.department && (
          <div className={styles.cardDetailRow}>
            <Building24Regular className={styles.cardDetailIcon} />
            <Text size={200} className={styles.cardDetailText}>
              {employee.department}
              {employee.officeLocation ? ` · ${employee.officeLocation}` : ""}
            </Text>
          </div>
        )}
        {employee.email && (
          <div className={styles.cardDetailRow}>
            <Mail24Regular className={styles.cardDetailIcon} />
            <Text size={200} className={styles.cardDetailText}>
              {employee.email}
            </Text>
          </div>
        )}
        {(employee.mobilePhone || employee.businessPhone) && (
          <div className={styles.cardDetailRow}>
            <Phone24Regular className={styles.cardDetailIcon} />
            <Text size={200} className={styles.cardDetailText}>
              {employee.mobilePhone || employee.businessPhone}
            </Text>
          </div>
        )}
      </div>

      {employee.tenantDisplayName && (
        <div className={styles.tenantBadge}>
          <Badge appearance="outline" color="informative" size="small">
            {employee.tenantDisplayName}
          </Badge>
        </div>
      )}
    </Card>
  );
}
