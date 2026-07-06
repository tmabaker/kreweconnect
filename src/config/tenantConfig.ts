/**
 * Per-Tenant Configuration
 *
 * Static configuration for known NOIT client tenants.
 * This will be dynamic in a future iteration (stored in the backend).
 */

// ─── Types ───────────────────────────────────────────────────────

export interface CustomField {
  key: string;
  label: string;
  type: "text" | "date" | "select" | "boolean";
  options?: string[]; // For select type
}

export interface TenantFeatures {
  showPhotos: boolean;
  showOrgChart: boolean;
  showPhoneNumbers: boolean;
  showDepartmentFilter: boolean;
  customFields: CustomField[];
}

export interface TenantConfig {
  tenantId: string;
  displayName: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  features: TenantFeatures;
}

// ─── Constants ───────────────────────────────────────────────────

/** NOIT Group's own tenant ID — users from this tenant are MSP admins */
export const NOIT_TENANT_ID = "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e";

// ─── Default Features ────────────────────────────────────────────

const DEFAULT_FEATURES: TenantFeatures = {
  showPhotos: true,
  showOrgChart: true,
  showPhoneNumbers: true,
  showDepartmentFilter: true,
  customFields: [],
};

// ─── Tenant Configs ──────────────────────────────────────────────

/**
 * Static branding/feature config, keyed by REAL tenant ID (lowercase).
 *
 * This drives per-tenant colors/features/custom-fields ONLY — it is NOT the
 * source of which tenants exist. The switcher's tenant list comes from the
 * backend `/api/tenants` (the CLIENT_TENANTS app setting, real ids), so this
 * file never needs to carry the client roster (kept out of the public repo).
 * Unknown tenants render with DEFAULT_FEATURES and their name from the backend.
 *
 * Previously this held 8 placeholder/fake-GUID client entries; those leaked the
 * client roster into a public repo AND — because the GUIDs were fake — fed the
 * switcher tenant ids that no tenant owns, so selecting one produced a consent
 * URL for a non-existent tenant and consent could never succeed. Removed.
 * Add a real-ID entry here only to customize a tenant's branding.
 */
export const TENANT_CONFIGS: Record<string, TenantConfig> = {
  // Geaux Automotive — PILOT TENANT (real tenant ID; already public elsewhere)
  "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa": {
    tenantId: "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa",
    displayName: "Geaux Automotive",
    primaryColor: "#461d7c",
    secondaryColor: "#fdd023",
    features: {
      ...DEFAULT_FEATURES,
    },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Get the config for a specific tenant. Returns null for unknown tenants.
 */
export function getTenantConfig(tenantId: string): TenantConfig | null {
  return TENANT_CONFIGS[tenantId.toLowerCase()] || null;
}

/**
 * Get features for a tenant, with defaults for unknown tenants.
 */
export function getTenantFeatures(tenantId: string): TenantFeatures {
  const config = getTenantConfig(tenantId);
  return config?.features || DEFAULT_FEATURES;
}

/**
 * Get all configured tenant IDs (excluding NOIT itself).
 */
export function getConfiguredTenantIds(): string[] {
  return Object.keys(TENANT_CONFIGS).filter(
    (id) => id.toLowerCase() !== NOIT_TENANT_ID.toLowerCase()
  );
}

/**
 * Get all configured tenants as a list.
 */
export function getConfiguredTenants(): TenantConfig[] {
  return Object.values(TENANT_CONFIGS);
}
