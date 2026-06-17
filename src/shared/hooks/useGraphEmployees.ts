/**
 * useGraphEmployees Hook
 *
 * Replaces useMockEmployees with live Microsoft Graph API data.
 * Falls back to mock data in demo mode.
 * Provides the same interface so directory pages work without changes.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { isDemoMode } from "../auth/demoMode";
import { useMockEmployees } from "./useMockEmployees";
import {
  fetchUsers,
  fetchUserById,
  fetchDirectReports,
  fetchUserPhotos,
  isGraphError,
  clearGraphCache,
  type GraphUser,
} from "../../services/graphService";
import { getTenantDisplayName } from "../../services/tenantService";
import type {
  EmployeeListItem,
  EmployeeDetail,
  EmployeeRef,
  OrgChartNode,
  EmployeeFacets,
} from "../types";

// ─── Graph → App Type Converters ─────────────────────────────────

function graphUserToListItem(
  user: GraphUser,
  tenantDisplayName: string | null,
  photoUrl?: string | null
): EmployeeListItem {
  return {
    id: user.id,
    displayName: user.displayName || user.userPrincipalName,
    givenName: user.givenName,
    surname: user.surname,
    email: user.mail,
    jobTitle: user.jobTitle,
    department: user.department,
    officeLocation: user.officeLocation,
    mobilePhone: user.mobilePhone,
    businessPhone: user.businessPhones?.[0] || null,
    photo: photoUrl || null,
    isActive: user.accountEnabled !== false,
    companyName: user.companyName ?? null,
    hireDate: user.employeeHireDate ?? null,
    birthday: user.birthday ?? null,
    // In the aggregate view each user carries its own tenant; otherwise use
    // the single selected tenant's display name.
    tenantDisplayName: user.tenantDisplayName ?? tenantDisplayName,
    tenantId: user.tenantId ?? null,
  };
}

function graphUserToDetail(
  user: GraphUser,
  tenantDisplayName: string | null,
  directReports: EmployeeRef[],
  photoUrl?: string | null
): EmployeeDetail {
  return {
    ...graphUserToListItem(user, tenantDisplayName, photoUrl),
    employeeId: null,
    hireDate: user.employeeHireDate ?? null,
    lastSyncedAt: new Date().toISOString(),
    manager: user.manager
      ? { id: user.manager.id, displayName: user.manager.displayName, jobTitle: null, photo: null }
      : null,
    directReports,
    customFields: [],
  };
}

// ─── Hook ────────────────────────────────────────────────────────

export function useGraphEmployees(tenantId: string) {
  // In demo mode, fall back to mock data
  const mockHook = useMockEmployees(tenantId);

  const [graphUsers, setGraphUsers] = useState<GraphUser[]>([]);
  const [photoMap, setPhotoMap] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [officeFilter, setOfficeFilter] = useState<string | null>(null);
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "department" | "recent">("name");

  const currentTenantRef = useRef(tenantId);

  // Fetch users from Graph when tenant changes
  useEffect(() => {
    if (isDemoMode) return;

    currentTenantRef.current = tenantId;
    let cancelled = false;

    async function loadUsers() {
      setLoading(true);
      setError(null);

      const isAll = tenantId === "all";
      const targetTenant = isAll ? undefined : tenantId;

      try {
        // "all" hits the MSP aggregate endpoint; a GUID hits that one tenant.
        const users = await fetchUsers(isAll ? "all" : tenantId);

        if (cancelled) return;

        setGraphUsers(users);

        // Photos are a per-tenant Graph call, so skip the batch fetch in the
        // aggregate view (cards fall back to initials).
        if (!isAll) {
          // Fetch photos for ALL users (not just the first 50) so cards show
          // real photos instead of initials. They stream in progressively via
          // the onPhoto callback, so a large tenant fills in as it loads
          // rather than waiting for the whole batch.
          const userIds = users.map((u) => u.id);
          fetchUserPhotos(userIds, targetTenant, (id, url) => {
            if (!cancelled && url) {
              setPhotoMap((prev) => {
                const next = new Map(prev);
                next.set(id, url);
                return next;
              });
            }
          });
        }
      } catch (err) {
        if (cancelled) return;

        if (isGraphError(err)) {
          if (err.code === "consent_required" && err.consentUrl) {
            setError(
              `This tenant hasn't authorized KreweConnect yet. An administrator must grant one-time consent: ${err.consentUrl}`
            );
          } else if (err.statusCode === 403 || err.statusCode === 401) {
            setError(
              `Access denied for this tenant. GDAP permissions may not be configured. (${err.code})`
            );
          } else {
            setError(`Failed to load directory: ${err.message}`);
          }
        } else {
          setError("Failed to load directory. Please try again.");
        }
        setGraphUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // Get tenant display name
  const tenantDisplayName = useMemo(() => {
    if (tenantId === "all") return null;
    return getTenantDisplayName(tenantId);
  }, [tenantId]);

  // Convert Graph users to app types, apply filters
  const employees = useMemo(() => {
    if (isDemoMode) return mockHook.employees;

    let list = graphUsers.map((u) =>
      graphUserToListItem(u, tenantDisplayName, photoMap.get(u.id))
    );

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.department && e.department.toLowerCase().includes(q)) ||
          (e.jobTitle && e.jobTitle.toLowerCase().includes(q))
      );
    }

    // Filters
    if (departmentFilter) list = list.filter((e) => e.department === departmentFilter);
    if (officeFilter) list = list.filter((e) => e.officeLocation === officeFilter);
    if (titleFilter) list = list.filter((e) => e.jobTitle === titleFilter);
    if (companyFilter) list = list.filter((e) => e.companyName === companyFilter);

    // Sort
    if (sortBy === "department") {
      list.sort(
        (a, b) =>
          (a.department ?? "").localeCompare(b.department ?? "") ||
          a.displayName.localeCompare(b.displayName)
      );
    } else {
      list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    return list;
  }, [isDemoMode, mockHook.employees, graphUsers, photoMap, tenantDisplayName, searchQuery, departmentFilter, officeFilter, titleFilter, companyFilter, sortBy]);

  // Compute facets
  const facets = useMemo<EmployeeFacets>(() => {
    if (isDemoMode) return mockHook.facets;

    const list = graphUsers.map((u) => graphUserToListItem(u, null));
    return {
      departments: [...new Set(list.map((e) => e.department).filter(Boolean) as string[])].sort(),
      offices: [
        ...new Set(list.map((e) => e.officeLocation).filter(Boolean) as string[]),
      ].sort(),
      titles: [...new Set(list.map((e) => e.jobTitle).filter(Boolean) as string[])].sort(),
      companies: [...new Set(list.map((e) => e.companyName).filter(Boolean) as string[])].sort(),
    };
  }, [isDemoMode, mockHook.facets, graphUsers]);

  // Get employee detail
  const getDetail = useCallback(
    async (id: string): Promise<EmployeeDetail | null> => {
      if (isDemoMode) return mockHook.getDetail(id);

      const selectedTenant = tenantId === "all" ? undefined : tenantId;

      try {
        // Check if we already have the user in our cached list
        let user = graphUsers.find((u) => u.id === id);

        // In the aggregate view, each user carries its own source tenant — use
        // that so detail/reports come from the right tenant, not "all".
        const userTenant = user?.tenantId ?? selectedTenant;

        if (!user) {
          // Fetch from Graph directly
          user = await fetchUserById(id, userTenant);
        }

        if (!user) return null;

        // Fetch direct reports
        let directReports: EmployeeRef[] = [];
        try {
          const reports = await fetchDirectReports(id, userTenant);
          directReports = reports.map((r) => ({
            id: r.id,
            displayName: r.displayName,
            jobTitle: r.jobTitle,
            photo: photoMap.get(r.id) || null,
          }));
        } catch {
          // Direct reports may not be available
        }

        return graphUserToDetail(
          user,
          tenantDisplayName,
          directReports,
          photoMap.get(user.id)
        );
      } catch {
        return null;
      }
    },
    [graphUsers, tenantDisplayName, photoMap, mockHook.getDetail, tenantId]
  );

  // Build org chart from Graph data
  const getOrgChart = useCallback(
    (rootId?: string): OrgChartNode | null => {
      if (isDemoMode) return mockHook.getOrgChart(rootId);

      if (graphUsers.length === 0) return null;

      // Build a map of user ID → GraphUser
      const userMap = new Map(graphUsers.map((u) => [u.id, u]));

      // Build manager → children map
      const childrenMap = new Map<string, GraphUser[]>();
      const roots: GraphUser[] = [];

      for (const user of graphUsers) {
        const managerId = user.manager?.id;
        if (managerId && userMap.has(managerId)) {
          const children = childrenMap.get(managerId) || [];
          children.push(user);
          childrenMap.set(managerId, children);
        } else {
          roots.push(user);
        }
      }

      const buildNode = (user: GraphUser, visited: Set<string>): OrgChartNode => {
        visited.add(user.id);
        return {
          id: user.id,
          displayName: user.displayName,
          jobTitle: user.jobTitle,
          department: user.department,
          photo: photoMap.get(user.id) || null,
          directReports: (childrenMap.get(user.id) || [])
            // Guard against manager cycles / self-manager in the source data,
            // which would otherwise recurse infinitely and crash the page.
            .filter((child) => !visited.has(child.id))
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map((child) => buildNode(child, visited)),
        };
      };

      if (rootId) {
        const rootUser = userMap.get(rootId);
        return rootUser ? buildNode(rootUser, new Set()) : null;
      }

      // Find the best root: either no manager, or the person with most reports
      if (roots.length === 1) return buildNode(roots[0], new Set());
      if (roots.length > 1) {
        // Pick root with most descendant reports
        const rootWithMostReports = roots.reduce((best, r) => {
          const bestCount = childrenMap.get(best.id)?.length || 0;
          const rCount = childrenMap.get(r.id)?.length || 0;
          return rCount > bestCount ? r : best;
        });
        return buildNode(rootWithMostReports, new Set());
      }

      return null;
    },
    [graphUsers, photoMap, mockHook.getOrgChart]
  );

  // Refresh / resync
  const refresh = useCallback(() => {
    clearGraphCache();
    // Trigger re-fetch by updating a dependency
    setGraphUsers([]);
    setLoading(true);
    fetchUsers(tenantId === "all" ? undefined : tenantId)
      .then((users) => {
        setGraphUsers(users);
        setError(null);
      })
      .catch((err) => {
        setError(isGraphError(err) ? err.message : "Failed to refresh directory.");
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (isDemoMode) {
    return {
      ...mockHook,
      companyFilter,
      setCompanyFilter,
      loading: false,
      error: null,
      refresh: () => {},
    };
  }

  return {
    employees,
    totalCount: employees.length,
    facets,
    searchQuery,
    setSearchQuery,
    departmentFilter,
    setDepartmentFilter,
    officeFilter,
    setOfficeFilter,
    titleFilter,
    setTitleFilter,
    companyFilter,
    setCompanyFilter,
    sortBy,
    setSortBy,
    getDetail,
    getOrgChart,
    loading,
    error,
    refresh,
  };
}
