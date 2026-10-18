/**
 * useContracts: KreweReview agreements for the selected tenant, with the
 * list filters, sorting, and dashboard roll-ups the pages share.
 *
 * Production reads the live API. Demo mode (VITE_DEMO_MODE=true) reads the
 * bundled sample agreements so the UI can be shown without a backend.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { isDemoMode } from "../auth/demoMode";
import { MOCK_CONTRACT_LIST } from "../mockContracts";
import { listContracts } from "../../services/contractService";
import { isGraphError } from "../../services/graphService";
import { CONTRACT_TAGS } from "../../apps/contracts/contractUtils";
import type {
  AgreementCategory,
  ContractDashboard,
  ContractListItem,
  ContractStatus,
  RenewalAlertItem,
  TagItem,
} from "../types";

const todayStr = () => new Date().toISOString().split("T")[0];

export function useContracts(tenantId: string, { includeArchived = false } = {}) {
  const [all, setAll] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<AgreementCategory | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (isDemoMode) {
      setAll(tenantId === "all" ? MOCK_CONTRACT_LIST : MOCK_CONTRACT_LIST.filter((c) => c.tenantId === tenantId));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listContracts(tenantId, includeArchived)
      .then((list) => {
        if (!cancelled) setAll(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setAll([]);
        setError(isGraphError(err) ? err.message : "Could not load agreements. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, includeArchived, version]);

  const contracts = useMemo(() => {
    let list = [...all];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.vendorName.toLowerCase().includes(q) ||
          (c.location ?? "").toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (categoryFilter) list = list.filter((c) => c.agreementCategory === categoryFilter);
    if (vendorFilter) list = list.filter((c) => c.vendorName === vendorFilter);
    if (locationFilter) list = list.filter((c) => c.location === locationFilter);
    if (needsReviewOnly) list = list.filter((c) => c.needsReview);

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "vendor": cmp = a.vendorName.localeCompare(b.vendorName); break;
        case "value": cmp = (a.value ?? 0) - (b.value ?? 0); break;
        case "endDate": cmp = (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31"); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "category": cmp = (a.agreementCategory ?? "").localeCompare(b.agreementCategory ?? ""); break;
        case "location": cmp = (a.location ?? "~").localeCompare(b.location ?? "~"); break;
        case "renewalType": cmp = (a.renewalType ?? "").localeCompare(b.renewalType ?? ""); break;
        case "decisionDate":
          cmp = (a.latestRenewalDecisionDate ?? "9999-12-31").localeCompare(b.latestRenewalDecisionDate ?? "9999-12-31");
          break;
        case "tier": cmp = (a.confidenceTier ?? "Z").localeCompare(b.confidenceTier ?? "Z"); break;
        default: cmp = a.title.localeCompare(b.title);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [all, searchQuery, statusFilter, categoryFilter, vendorFilter, locationFilter, needsReviewOnly, sortBy, sortDir]);

  const vendors = useMemo(() => [...new Set(all.map((c) => c.vendorName))].sort(), [all]);
  const locations = useMemo(
    () => [...new Set(all.map((c) => c.location).filter((l): l is string => !!l))].sort(),
    [all]
  );
  const tags: TagItem[] = useMemo(() => CONTRACT_TAGS.map((t) => ({ id: t.name, name: t.name, color: t.color })), []);

  const dashboard = useMemo((): ContractDashboard => {
    const active = all.filter((c) => !c.isArchived);
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const c of active) {
      const key = c.agreementCategory ?? "Other";
      byCategory[key] = (byCategory[key] || 0) + 1;
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }
    const upcomingRenewals: RenewalAlertItem[] = active
      .filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry > 0 && c.daysUntilExpiry <= 90)
      .sort((a, b) => (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999))
      .map((c) => ({
        id: `ra-${c.id}`,
        contractId: c.id,
        tenantId: c.tenantId,
        contractTitle: c.title,
        vendorName: c.vendorName,
        tenantDisplayName: c.tenantDisplayName,
        alertDate: todayStr(),
        contractEndDate: c.endDate,
        alertType: (c.daysUntilExpiry ?? 999) <= 30 ? "ThirtyDay" : (c.daysUntilExpiry ?? 999) <= 60 ? "SixtyDay" : "NinetyDay",
        isSent: false,
        daysRemaining: c.daysUntilExpiry,
      }));
    const recent = [...active].sort((a, b) =>
      ((b as { updatedAt?: string }).updatedAt ?? "").localeCompare((a as { updatedAt?: string }).updatedAt ?? "")
    );
    return {
      totalContracts: active.length,
      activeContracts: active.filter((c) => c.status === "Active").length,
      expiringSoon: active.filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry > 0 && c.daysUntilExpiry <= 30).length,
      totalValue: active.reduce((sum, c) => sum + (c.value ?? 0), 0),
      byCategory,
      byStatus,
      recentContracts: recent.slice(0, 5),
      upcomingRenewals,
    };
  }, [all]);

  return {
    contracts,
    totalCount: contracts.length,
    allContracts: all,
    loading,
    error,
    reload,
    tags,
    vendors,
    locations,
    dashboard,
    searchQuery, setSearchQuery,
    statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    vendorFilter, setVendorFilter,
    locationFilter, setLocationFilter,
    needsReviewOnly, setNeedsReviewOnly,
    sortBy, setSortBy,
    sortDir, setSortDir,
  };
}
