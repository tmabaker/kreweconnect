import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  Button,
  Avatar,
  Badge,
  Input,
} from "@fluentui/react-components";
import {
  Search24Regular,
  ChevronDown24Regular,
  ChevronRight24Regular,
  Organization24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useGraphEmployees } from "../../shared/hooks/useGraphEmployees";
import type { OrgChartNode } from "../../shared/types";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  toolbar: { display: "flex", gap: "12px", alignItems: "center" },
  searchInput: { minWidth: "280px" },
  chartContainer: {
    overflowX: "auto",
    padding: "20px 0",
  },
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: "0px",
    paddingLeft: "0px",
  },
  nodeWrapper: {
    display: "flex",
    flexDirection: "column",
  },
  nodeRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  nodeRowHighlight: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  nodeCard: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: 1,
  },
  nodeInfo: { flex: 1, minWidth: 0 },
  nodeName: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  children: {
    paddingLeft: "32px",
    borderLeft: `2px solid ${tokens.colorNeutralStroke2}`,
    marginLeft: "22px",
  },
  expandBtn: {
    minWidth: "24px",
    width: "24px",
    height: "24px",
    padding: "0px",
    flexShrink: 0,
  },
  expandPlaceholder: {
    width: "24px",
    flexShrink: 0,
  },
  countBadge: { marginLeft: "4px" },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    padding: "64px 24px",
  },
});

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "brand", "dark-red", "cranberry", "pumpkin", "marigold", "forest",
    "seafoam", "teal", "steel", "blue", "royal-blue", "cornflower",
    "navy", "lavender", "purple", "grape", "lilac", "pink", "magenta", "plum",
  ] as const;
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export function OrgChartPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant, isAllTenants } = useTenantContext();
  const { getOrgChart, loading, error } = useGraphEmployees(selectedTenant.tenantId);
  const [searchQuery, setSearchQuery] = useState("");

  const orgChart = useMemo(() => getOrgChart(), [getOrgChart]);

  if (isAllTenants) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <Title2>Org Chart</Title2>
            <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px" }}>
              Visualize reporting structure
            </Text>
          </div>
        </div>
        <div className={styles.emptyState}>
          <Organization24Regular style={{ fontSize: "48px", color: tokens.colorNeutralForeground3 }} />
          <Title2>Select a tenant</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            Org chart requires a specific tenant. Use the tenant picker above to select one.
          </Text>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <Title2>Loading org chart...</Title2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <Organization24Regular style={{ fontSize: "48px", color: tokens.colorNeutralForeground3 }} />
          <Title2>Error loading org chart</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>{error}</Text>
        </div>
      </div>
    );
  }

  if (!orgChart) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <Organization24Regular style={{ fontSize: "48px", color: tokens.colorNeutralForeground3 }} />
          <Title2>No org data available</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            No employees or manager hierarchy found for this tenant.
          </Text>
        </div>
      </div>
    );
  }

  // Determine which nodes match search for highlighting
  const matchedIds = new Set<string>();
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const findMatches = (node: OrgChartNode) => {
      if (
        node.displayName.toLowerCase().includes(q) ||
        (node.jobTitle && node.jobTitle.toLowerCase().includes(q)) ||
        (node.department && node.department.toLowerCase().includes(q))
      ) {
        matchedIds.add(node.id);
      }
      node.directReports.forEach(findMatches);
    };
    findMatches(orgChart);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Title2>Org Chart — {selectedTenant.displayName}</Title2>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px" }}>
            Click any person to view their profile
          </Text>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          contentBefore={<Search24Regular />}
          placeholder="Search org chart..."
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
        />
      </div>

      <Card style={{ padding: "16px" }}>
        <div className={styles.chartContainer}>
          <OrgTreeNode
            node={orgChart}
            matchedIds={matchedIds}
            onNavigate={(id) => navigate(`/directory/${id}`)}
            depth={0}
          />
        </div>
      </Card>
    </div>
  );
}

function OrgTreeNode({
  node,
  matchedIds,
  onNavigate,
  depth,
}: {
  node: OrgChartNode;
  matchedIds: Set<string>;
  onNavigate: (id: string) => void;
  depth: number;
}) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.directReports.length > 0;
  const isHighlighted = matchedIds.size > 0 && matchedIds.has(node.id);

  return (
    <div className={styles.nodeWrapper}>
      <div
        className={`${styles.nodeRow} ${isHighlighted ? styles.nodeRowHighlight : ""}`}
      >
        {hasChildren ? (
          <Button
            className={styles.expandBtn}
            appearance="subtle"
            size="small"
            icon={expanded ? <ChevronDown24Regular /> : <ChevronRight24Regular />}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          />
        ) : (
          <div className={styles.expandPlaceholder} />
        )}
        <div
          className={styles.nodeCard}
          onClick={() => onNavigate(node.id)}
        >
          <Avatar
            name={node.displayName}
            initials={getInitials(node.displayName)}
            color={getAvatarColor(node.displayName)}
            image={node.photo ? { src: node.photo } : undefined}
            size={36}
          />
          <div className={styles.nodeInfo}>
            <Text weight="semibold" size={300} className={styles.nodeName}>
              {node.displayName}
            </Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {node.jobTitle || "—"}
              {node.department ? ` · ${node.department}` : ""}
            </Text>
          </div>
          {hasChildren && (
            <Badge appearance="outline" size="small" className={styles.countBadge}>
              {node.directReports.length}
            </Badge>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className={styles.children}>
          {node.directReports.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              matchedIds={matchedIds}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
