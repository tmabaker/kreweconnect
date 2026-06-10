import { useState, useMemo, useCallback } from "react";
import type {
  ContractListItem,
  ContractDetail,
  ContractDashboard,
  RenewalAlertItem,
  ContractType,
  ContractStatus,
  TagItem,
} from "../types";

const today = new Date();
const addDays = (d: Date, days: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r.toISOString().split("T")[0];
};
const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r.toISOString().split("T")[0];
};
const todayStr = today.toISOString().split("T")[0];

const MOCK_TAGS: TagItem[] = [
  { id: "t1", name: "Critical", color: "#D13438" },
  { id: "t2", name: "Security", color: "#0078D4" },
  { id: "t3", name: "Productivity", color: "#107C10" },
  { id: "t4", name: "Backup", color: "#8764B8" },
  { id: "t5", name: "Monitoring", color: "#FF8C00" },
  { id: "t6", name: "Infrastructure", color: "#004E8C" },
  { id: "t7", name: "Compliance", color: "#C239B3" },
  { id: "t8", name: "Cloud", color: "#00BCF2" },
];

const MOCK_CONTRACTS: ContractListItem[] = [
  // Bayou Automotive
  { id: "c-ba-001", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Microsoft", contractType: "Subscription", title: "Microsoft 365 Business Premium", startDate: addMonths(today, -10), endDate: addMonths(today, 14), renewalDate: addMonths(today, 13), autoRenew: true, value: 9600, currency: "USD", status: "Active", daysUntilExpiry: 425, tags: ["Critical", "Productivity", "Cloud"] },
  { id: "c-ba-002", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Datto", contractType: "Subscription", title: "Datto RMM - Endpoint Management", startDate: addMonths(today, -6), endDate: addMonths(today, 18), renewalDate: addMonths(today, 17), autoRenew: true, value: 4800, currency: "USD", status: "Active", daysUntilExpiry: 547, tags: ["Critical", "Monitoring"] },
  { id: "c-ba-003", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "SentinelOne", contractType: "Subscription", title: "SentinelOne Singularity - EDR", startDate: addMonths(today, -3), endDate: addMonths(today, 9), renewalDate: addMonths(today, 8), autoRenew: true, value: 7200, currency: "USD", status: "Active", daysUntilExpiry: 273, tags: ["Critical", "Security"] },
  { id: "c-ba-004", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Cisco Meraki", contractType: "Hardware", title: "Meraki MX Firewall + Licensing", startDate: addMonths(today, -12), endDate: addDays(today, 25), renewalDate: todayStr, autoRenew: false, value: 3600, currency: "USD", status: "Active", daysUntilExpiry: 25, tags: ["Infrastructure", "Security"] },
  { id: "c-ba-005", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "IT Glue", contractType: "Subscription", title: "IT Glue Documentation Platform", startDate: addMonths(today, -8), endDate: addMonths(today, 16), renewalDate: addMonths(today, 15), autoRenew: true, value: 2400, currency: "USD", status: "Active", daysUntilExpiry: 486, tags: ["Productivity"] },
  { id: "c-ba-006", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Adobe", contractType: "Software", title: "Adobe Creative Cloud - Team License", startDate: addMonths(today, -4), endDate: addMonths(today, 8), renewalDate: addMonths(today, 7), autoRenew: true, value: 1800, currency: "USD", status: "Active", daysUntilExpiry: 243, tags: ["Productivity"] },

  // Fishman Haygood
  { id: "c-fh-001", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Microsoft", contractType: "Subscription", title: "Microsoft 365 E3 Enterprise", startDate: addMonths(today, -5), endDate: addMonths(today, 7), renewalDate: addMonths(today, 6), autoRenew: true, value: 18000, currency: "USD", status: "Active", daysUntilExpiry: 213, tags: ["Critical", "Productivity", "Compliance", "Cloud"] },
  { id: "c-fh-002", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "ConnectWise", contractType: "Subscription", title: "ConnectWise Automate - RMM", startDate: addMonths(today, -9), endDate: addMonths(today, 3), renewalDate: addMonths(today, 2), autoRenew: true, value: 6000, currency: "USD", status: "Active", daysUntilExpiry: 91, tags: ["Critical", "Monitoring"] },
  { id: "c-fh-003", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Spanning", contractType: "Subscription", title: "Spanning Backup for Microsoft 365", startDate: addMonths(today, -7), endDate: addMonths(today, 5), renewalDate: addMonths(today, 4), autoRenew: true, value: 3600, currency: "USD", status: "Active", daysUntilExpiry: 152, tags: ["Backup", "Cloud"] },
  { id: "c-fh-004", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "ThreatLocker", contractType: "Subscription", title: "ThreatLocker Zero Trust - Ringfencing", startDate: addMonths(today, -2), endDate: addMonths(today, 10), renewalDate: addMonths(today, 9), autoRenew: true, value: 5400, currency: "USD", status: "Active", daysUntilExpiry: 304, tags: ["Critical", "Security"] },
  { id: "c-fh-005", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "RocketCyber", contractType: "Service", title: "RocketCyber MDR Platform", startDate: addMonths(today, -11), endDate: addDays(today, 15), renewalDate: todayStr, autoRenew: true, value: 8400, currency: "USD", status: "Active", daysUntilExpiry: 15, tags: ["Security", "Monitoring"] },
  { id: "c-fh-006", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Vonahi Security", contractType: "Service", title: "vPenTest - Automated Penetration Testing", startDate: addMonths(today, -1), endDate: addMonths(today, 11), renewalDate: addMonths(today, 10), autoRenew: false, value: 4200, currency: "USD", status: "UnderReview", daysUntilExpiry: 334, tags: ["Security", "Compliance"] },
  { id: "c-fh-007", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Kaseya", contractType: "Subscription", title: "DarkWeb ID - Dark Web Monitoring", startDate: addMonths(today, -6), endDate: addMonths(today, 6), renewalDate: addMonths(today, 5), autoRenew: true, value: 2100, currency: "USD", status: "Active", daysUntilExpiry: 182, tags: ["Security"] },

  // Irby Investments
  { id: "c-ii-001", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Microsoft", contractType: "Subscription", title: "Microsoft 365 Business Standard", startDate: addMonths(today, -4), endDate: addMonths(today, 8), renewalDate: addMonths(today, 7), autoRenew: true, value: 6600, currency: "USD", status: "Active", daysUntilExpiry: 243, tags: ["Critical", "Productivity", "Cloud"] },
  { id: "c-ii-002", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Datto", contractType: "Service", title: "Datto BCDR - Business Continuity", startDate: addMonths(today, -10), endDate: addMonths(today, 2), renewalDate: addMonths(today, 1), autoRenew: true, value: 5400, currency: "USD", status: "Active", daysUntilExpiry: 61, tags: ["Critical", "Backup"] },
  { id: "c-ii-003", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Phinsec", contractType: "Service", title: "Phinsec Security Awareness Training", startDate: addMonths(today, -3), endDate: addMonths(today, 9), renewalDate: addMonths(today, 8), autoRenew: true, value: 1800, currency: "USD", status: "Active", daysUntilExpiry: 273, tags: ["Security", "Compliance"] },
  { id: "c-ii-004", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "SaaS Alerts", contractType: "Subscription", title: "SaaS Alerts - Cloud App Monitoring", startDate: todayStr, endDate: addMonths(today, 12), renewalDate: addMonths(today, 11), autoRenew: false, value: 1500, currency: "USD", status: "Draft", daysUntilExpiry: 365, tags: ["Monitoring", "Cloud"] },
  { id: "c-ii-005", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Cisco Meraki", contractType: "Hardware", title: "Meraki MR Access Points - Office WiFi", startDate: addMonths(today, -18), endDate: addDays(today, -10), renewalDate: addDays(today, -40), autoRenew: false, value: 2400, currency: "USD", status: "Expired", daysUntilExpiry: -10, tags: ["Infrastructure"] },
  { id: "c-ii-006", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Scalepad", contractType: "Subscription", title: "Scalepad Lifecycle Manager", startDate: addMonths(today, -5), endDate: addMonths(today, 7), renewalDate: addMonths(today, 6), autoRenew: true, value: 1200, currency: "USD", status: "Active", daysUntilExpiry: 213, tags: ["Monitoring"] },
];

const TENANT_MAP: Record<string, number> = {
  "aaaaaaaa-1111-2222-3333-444444444444": 1,
  "bbbbbbbb-1111-2222-3333-444444444444": 2,
  "cccccccc-1111-2222-3333-444444444444": 3,
};

export function useMockContracts(tenantId: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<ContractType | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredContracts = useMemo(() => {
    let list = [...MOCK_CONTRACTS];

    // Tenant filter
    if (tenantId !== "all") {
      const tid = TENANT_MAP[tenantId];
      if (tid) list = list.filter((c) => c.tenantId === tid);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.vendorName.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Filters
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (typeFilter) list = list.filter((c) => c.contractType === typeFilter);
    if (vendorFilter) list = list.filter((c) => c.vendorName === vendorFilter);

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "vendor": cmp = a.vendorName.localeCompare(b.vendorName); break;
        case "value": cmp = (a.value ?? 0) - (b.value ?? 0); break;
        case "endDate": cmp = (a.endDate ?? "").localeCompare(b.endDate ?? ""); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        default: cmp = a.title.localeCompare(b.title);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [tenantId, searchQuery, statusFilter, typeFilter, vendorFilter, sortBy, sortDir]);

  const vendors = useMemo(() => {
    const set = new Set(MOCK_CONTRACTS.map((c) => c.vendorName));
    return [...set].sort();
  }, []);

  const getDetail = useCallback((id: string): ContractDetail | null => {
    const c = MOCK_CONTRACTS.find((x) => x.id === id);
    if (!c) return null;
    return {
      ...c,
      description: `${c.vendorName} contract for ${c.title}. Managed by NOIT Group.`,
      slaTerms: c.tags.includes("Critical") ? "99.9% uptime, 4hr response" : null,
      notes: null,
      createdById: null,
      isArchived: false,
      createdAt: c.startDate,
      updatedAt: new Date().toISOString(),
      versions: [
        { id: `v-${id}-1`, versionNumber: 1, summary: "Contract created", changedById: null, changedAt: c.startDate, changeNotes: "Initial creation" },
      ],
      documents: (c.value ?? 0) > 5000 ? [
        { id: `d-${id}-1`, fileName: `${c.vendorName.toLowerCase().replace(/ /g, "-")}-contract-signed.pdf`, fileSize: 245760, contentType: "application/pdf", uploadedById: null, uploadedAt: c.startDate },
      ] : [],
      approvals: c.status === "UnderReview" ? [
        { id: `a-${id}-1`, contractId: id, requestedById: null, approvedById: null, status: "Pending" as const, requestedAt: new Date().toISOString(), resolvedAt: null, comments: "New vendor contract for review" },
      ] : c.status === "Active" ? [
        { id: `a-${id}-1`, contractId: id, requestedById: null, approvedById: null, status: "Approved" as const, requestedAt: c.startDate, resolvedAt: c.startDate, comments: "Approved - competitive pricing confirmed" },
      ] : [],
      renewalAlerts: [],
      tags: c.tags,
    };
  }, []);

  const dashboard = useMemo((): ContractDashboard => {
    let list = MOCK_CONTRACTS;
    if (tenantId !== "all") {
      const tid = TENANT_MAP[tenantId];
      if (tid) list = list.filter((c) => c.tenantId === tid);
    }

    const active = list.filter((c) => c.status === "Active");
    const expiringSoon = list.filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry > 0 && c.daysUntilExpiry <= 30);

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const c of list) {
      byType[c.contractType] = (byType[c.contractType] || 0) + 1;
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }

    const upcomingRenewals: RenewalAlertItem[] = list
      .filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry > 0 && c.daysUntilExpiry <= 90)
      .sort((a, b) => (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999))
      .map((c) => ({
        id: `ra-${c.id}`,
        contractId: c.id,
        contractTitle: c.title,
        vendorName: c.vendorName,
        tenantDisplayName: c.tenantDisplayName,
        alertDate: todayStr,
        contractEndDate: c.endDate,
        alertType: (c.daysUntilExpiry ?? 999) <= 30 ? "ThirtyDay" as const : (c.daysUntilExpiry ?? 999) <= 60 ? "SixtyDay" as const : "NinetyDay" as const,
        isSent: false,
        daysRemaining: c.daysUntilExpiry,
      }));

    return {
      totalContracts: list.length,
      activeContracts: active.length,
      expiringSoon: expiringSoon.length,
      totalValue: list.reduce((sum, c) => sum + (c.value ?? 0), 0),
      byType,
      byStatus,
      recentContracts: list.slice(0, 5),
      upcomingRenewals,
    };
  }, [tenantId]);

  return {
    contracts: filteredContracts,
    totalCount: filteredContracts.length,
    allContracts: MOCK_CONTRACTS,
    tags: MOCK_TAGS,
    vendors,
    dashboard,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    vendorFilter,
    setVendorFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    getDetail,
  };
}
