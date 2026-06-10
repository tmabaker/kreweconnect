/**
 * Tenant Service
 *
 * Detects the current user's tenant and determines if they're an MSP admin
 * or a client user. Manages tenant switching for admin users.
 */

import { msalInstance } from "../shared/auth/AuthProvider";
import { isDemoMode } from "../shared/auth/demoMode";
import { fetchCustomerTenants } from "./graphService";
import {
  NOIT_TENANT_ID,
  getTenantConfig,
  getConfiguredTenants,
} from "../config/tenantConfig";

// ─── Types ───────────────────────────────────────────────────────

export interface TenantInfo {
  tenantId: string;
  displayName: string;
  defaultDomainName?: string;
}

export interface UserTenantContext {
  /** The home tenant of the logged-in user */
  homeTenantId: string;
  /** Whether the user is an NOIT MSP administrator */
  isMspAdmin: boolean;
  /** Display name from the logged-in account */
  userDisplayName: string;
  /** User principal name */
  userPrincipalName: string;
  /** Object ID of the user in Entra ID */
  userObjectId: string;
}

// ─── Tenant Detection ────────────────────────────────────────────

/**
 * Read the tenant ID and user info from the active MSAL account.
 */
export function detectUserTenantContext(): UserTenantContext {
  if (isDemoMode) {
    return {
      homeTenantId: NOIT_TENANT_ID,
      isMspAdmin: true,
      userDisplayName: "Tammy Baker",
      userPrincipalName: "tammy@noitgroup.com",
      userObjectId: "demo-user-id",
    };
  }

  const account = msalInstance.getActiveAccount();
  if (!account) {
    return {
      homeTenantId: "",
      isMspAdmin: false,
      userDisplayName: "Unknown",
      userPrincipalName: "",
      userObjectId: "",
    };
  }

  // The tenant ID comes from the account's tenantId claim
  const homeTenantId = account.tenantId || "";
  const isMspAdmin = homeTenantId.toLowerCase() === NOIT_TENANT_ID.toLowerCase();

  return {
    homeTenantId,
    isMspAdmin,
    userDisplayName: account.name || account.username || "User",
    userPrincipalName: account.username || "",
    userObjectId: account.localAccountId || "",
  };
}

/**
 * Get the list of customer tenants available to the MSP admin.
 * Combines Graph API discovery with static config for known tenants.
 */
export async function getAvailableTenants(): Promise<TenantInfo[]> {
  if (isDemoMode) {
    // Return demo tenants from static config
    return getStaticTenantList();
  }

  try {
    // Try to discover tenants via Graph contracts API
    const graphTenants = await fetchCustomerTenants();

    if (graphTenants.length > 0) {
      return graphTenants.map((t) => ({
        tenantId: t.customerId,
        displayName: t.displayName,
        defaultDomainName: t.defaultDomainName,
      }));
    }

    // Fallback: return tenants from static config
    return getStaticTenantList();
  } catch {
    // On error, fall back to static config
    return getStaticTenantList();
  }
}

/**
 * Returns the display name for a tenant, using config first then falling back.
 */
export function getTenantDisplayName(tenantId: string): string {
  const config = getTenantConfig(tenantId);
  if (config) return config.displayName;
  return tenantId;
}

/**
 * Static tenant list — known tenants from NOIT's GDAP relationships.
 * Used as a fallback when Graph /contracts endpoint is unavailable.
 */
function getStaticTenantList(): TenantInfo[] {
  return getConfiguredTenants()
    .filter((c) => c.tenantId.toLowerCase() !== NOIT_TENANT_ID.toLowerCase())
    .map((c) => ({
      tenantId: c.tenantId,
      displayName: c.displayName,
    }));
}

export { NOIT_TENANT_ID };
