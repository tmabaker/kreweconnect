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
 * Static config for known tenants. Keyed by tenant ID (lowercase).
 * Add new tenants here as they're onboarded.
 */
export const TENANT_CONFIGS: Record<string, TenantConfig> = {
  // Bayou Automotive — Pilot tenant
  "aaaaaaaa-1111-2222-3333-444444444444": {
    tenantId: "aaaaaaaa-1111-2222-3333-444444444444",
    displayName: "Bayou Automotive",
    primaryColor: "#1a5276",
    secondaryColor: "#2e86c1",
    features: {
      ...DEFAULT_FEATURES,
      customFields: [
        { key: "employeeNumber", label: "Employee Number", type: "text" },
        { key: "hireDate", label: "Hire Date", type: "date" },
      ],
    },
  },

  // Fishman Haygood
  "bbbbbbbb-1111-2222-3333-444444444444": {
    tenantId: "bbbbbbbb-1111-2222-3333-444444444444",
    displayName: "Fishman Haygood",
    primaryColor: "#2c3e50",
    secondaryColor: "#7f8c8d",
    features: {
      ...DEFAULT_FEATURES,
      customFields: [
        { key: "barNumber", label: "Bar Number", type: "text" },
        { key: "practiceArea", label: "Practice Area", type: "text" },
      ],
    },
  },

  // Irby Investments
  "cccccccc-1111-2222-3333-444444444444": {
    tenantId: "cccccccc-1111-2222-3333-444444444444",
    displayName: "Irby Investments",
    primaryColor: "#1b4f72",
    secondaryColor: "#2980b9",
    features: {
      ...DEFAULT_FEATURES,
    },
  },

  // Pac-Gulf
  "dddddddd-1111-2222-3333-444444444444": {
    tenantId: "dddddddd-1111-2222-3333-444444444444",
    displayName: "Pac-Gulf",
    primaryColor: "#145a32",
    secondaryColor: "#27ae60",
    features: {
      ...DEFAULT_FEATURES,
    },
  },

  // Level BR
  "eeeeeeee-1111-2222-3333-444444444444": {
    tenantId: "eeeeeeee-1111-2222-3333-444444444444",
    displayName: "Level BR",
    primaryColor: "#4a235a",
    secondaryColor: "#8e44ad",
    features: {
      ...DEFAULT_FEATURES,
    },
  },

  // True Title
  "ffffffff-1111-2222-3333-444444444444": {
    tenantId: "ffffffff-1111-2222-3333-444444444444",
    displayName: "True Title",
    primaryColor: "#7b241c",
    secondaryColor: "#c0392b",
    features: {
      ...DEFAULT_FEATURES,
    },
  },

  // Corporate Realty
  "11111111-aaaa-bbbb-cccc-dddddddddddd": {
    tenantId: "11111111-aaaa-bbbb-cccc-dddddddddddd",
    displayName: "Corporate Realty",
    primaryColor: "#1a5276",
    secondaryColor: "#2e86c1",
    features: {
      ...DEFAULT_FEATURES,
    },
  },

  // Xtreme Automotive
  "22222222-aaaa-bbbb-cccc-dddddddddddd": {
    tenantId: "22222222-aaaa-bbbb-cccc-dddddddddddd",
    displayName: "Xtreme Automotive",
    primaryColor: "#922b21",
    secondaryColor: "#e74c3c",
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
