import {
  createContext,
  useContext,
  useState,
  useCallback,
  createElement,
  type ReactNode,
} from "react";
import {
  detectUserTenantContext,
  getTenantDisplayName,
} from "../../services/tenantService";

const STORAGE_KEY = "noit-selected-tenant";
const DISPLAY_KEY = "noit-selected-tenant-name";

/**
 * Default selection when none is stored:
 *  - MSP (NOIT) admins start on "All Tenants"
 *  - Client users are pinned to their own tenant (they have no switcher)
 * Wrapped in try/catch so a detection hiccup can never blank the app.
 */
function defaultSelection(): TenantSelection {
  try {
    const ctx = detectUserTenantContext();
    if (!ctx.isMspAdmin && ctx.homeTenantId) {
      return {
        tenantId: ctx.homeTenantId,
        displayName: getTenantDisplayName(ctx.homeTenantId),
      };
    }
  } catch {
    // fall through to the admin default
  }
  return { tenantId: "all", displayName: "All Tenants" };
}

export interface TenantSelection {
  tenantId: string; // GUID or "all"
  displayName: string;
}

interface TenantContextValue {
  selectedTenant: TenantSelection;
  setSelectedTenant: (tenant: TenantSelection) => void;
  isAllTenants: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * App-wide tenant selection. Must be a real React Context (not a bare hook)
 * so the header switcher and every page share ONE selection — otherwise each
 * caller gets an independent useState copy and pages never refresh when the
 * tenant changes.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const [selectedTenant, setSelectedTenantState] = useState<TenantSelection>(() => {
    const ctx = detectUserTenantContext();
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedName = localStorage.getItem(DISPLAY_KEY);

    // Client users are always pinned to their own tenant — never honor a
    // stale "all" or another tenant left in storage (defense in depth; the
    // backend enforces this too).
    if (!ctx.isMspAdmin) {
      return defaultSelection();
    }
    if (stored) {
      return { tenantId: stored, displayName: storedName || stored };
    }
    return defaultSelection();
  });

  const setSelectedTenant = useCallback((tenant: TenantSelection) => {
    localStorage.setItem(STORAGE_KEY, tenant.tenantId);
    localStorage.setItem(DISPLAY_KEY, tenant.displayName);
    setSelectedTenantState(tenant);
  }, []);

  const value: TenantContextValue = {
    selectedTenant,
    setSelectedTenant,
    isAllTenants: selectedTenant.tenantId === "all",
  };

  return createElement(TenantContext.Provider, { value }, children);
}

export function useTenantContext(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenantContext must be used within a TenantProvider");
  }
  return ctx;
}
