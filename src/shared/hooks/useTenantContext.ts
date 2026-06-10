import { useState, useCallback } from "react";

const STORAGE_KEY = "noit-selected-tenant";
const DISPLAY_KEY = "noit-selected-tenant-name";

export interface TenantSelection {
  tenantId: string; // GUID or "all"
  displayName: string;
}

export function useTenantContext() {
  const [selectedTenant, setSelectedTenantState] = useState<TenantSelection>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedName = localStorage.getItem(DISPLAY_KEY);
    return {
      tenantId: stored || "all",
      displayName: storedName || "All Tenants",
    };
  });

  const setSelectedTenant = useCallback((tenant: TenantSelection) => {
    localStorage.setItem(STORAGE_KEY, tenant.tenantId);
    localStorage.setItem(DISPLAY_KEY, tenant.displayName);
    setSelectedTenantState(tenant);
  }, []);

  const isAllTenants = selectedTenant.tenantId === "all";

  return { selectedTenant, setSelectedTenant, isAllTenants };
}
