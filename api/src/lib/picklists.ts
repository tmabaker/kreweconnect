/**
 * Per-tenant location and department pick lists for KreweReview.
 *
 * A tenant's lists come from, in order: the MSP-edited configuration in
 * storage, else a default matched on the tenant's display name. Defaults are
 * keyed by name so no tenant id lands in this public repo. A list whose
 * source is "entra" is the set of distinct values in that tenant's directory
 * (companyName for locations, department for departments).
 */

import { config } from "./config";
import { fetchUsers } from "./graphClient";
import {
  readPicklistConfig,
  type PicklistSource,
  type TenantPicklistConfig,
} from "./contractStore";
import type { TenantPicklist } from "./contractSchema";

interface PicklistDefault {
  match: RegExp;
  locations: PicklistSource;
  departments: PicklistSource;
}

const ENTRA: PicklistSource = { source: "entra", values: [] };
const NONE: PicklistSource = { source: "list", values: [] };
const list = (...values: string[]): PicklistSource => ({ source: "list", values });

export const PICKLIST_DEFAULTS: PicklistDefault[] = [
  { match: /geaux/i, locations: ENTRA, departments: ENTRA },
  { match: /level/i, locations: ENTRA, departments: ENTRA },
  { match: /fishman/i, locations: list("FH Baton Rouge", "FH New Orleans"), departments: NONE },
  {
    match: /true\s*title/i,
    locations: list("True Title Gretna", "True Title Metairie", "True Title Hammond"),
    departments: NONE,
  },
  { match: /provident/i, locations: list("Provident Baton Rouge", "Provident Raleigh"), departments: NONE },
];

export function tenantName(tenantId: string): string {
  const t = config.clientTenants.find((x) => x.id.toLowerCase() === tenantId.toLowerCase());
  return t?.name ?? tenantId;
}

export function defaultPicklistConfig(name: string): Omit<TenantPicklistConfig, "updatedAt" | "updatedById"> {
  const d = PICKLIST_DEFAULTS.find((x) => x.match.test(name));
  return d ? { locations: d.locations, departments: d.departments } : { locations: NONE, departments: NONE };
}

export interface ResolvedPicklist extends TenantPicklist {
  tenantId: string;
  tenantDisplayName: string;
  locationSource: PicklistSource["source"];
  departmentSource: PicklistSource["source"];
  /** Set when an Entra-sourced list could not be read (e.g. consent missing). */
  warning: string | null;
}

// Entra values change rarely; cache per tenant so every form load isn't a
// full directory read.
const ENTRA_TTL_MS = 10 * 60 * 1000;
const entraCache = new Map<string, { at: number; locations: string[]; departments: string[] }>();

async function entraValues(tenantId: string): Promise<{ locations: string[]; departments: string[] }> {
  const key = tenantId.toLowerCase();
  const hit = entraCache.get(key);
  if (hit && Date.now() - hit.at < ENTRA_TTL_MS) return hit;
  const users = await fetchUsers(tenantId);
  const distinct = (values: Array<string | null | undefined>) =>
    [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const value = {
    at: Date.now(),
    locations: distinct(users.map((u) => u.companyName)),
    departments: distinct(users.map((u) => u.department)),
  };
  entraCache.set(key, value);
  return value;
}

/** Test hook. */
export function setEntraValuesForTests(tenantId: string, locations: string[], departments: string[]): void {
  entraCache.set(tenantId.toLowerCase(), { at: Date.now(), locations, departments });
}

export async function resolvePicklist(tenantId: string): Promise<ResolvedPicklist> {
  const name = tenantName(tenantId);
  const stored = (await readPicklistConfig())[tenantId.toLowerCase()];
  const cfg = stored ?? defaultPicklistConfig(name);

  let warning: string | null = null;
  let entra: { locations: string[]; departments: string[] } = { locations: [], departments: [] };
  if (cfg.locations.source === "entra" || cfg.departments.source === "entra") {
    try {
      entra = await entraValues(tenantId);
    } catch {
      warning = "Could not read Company Name and Department values from this tenant's directory.";
    }
  }

  return {
    tenantId,
    tenantDisplayName: name,
    locations: cfg.locations.source === "entra" ? entra.locations : [...cfg.locations.values],
    departments: cfg.departments.source === "entra" ? entra.departments : [...cfg.departments.values],
    locationSource: cfg.locations.source,
    departmentSource: cfg.departments.source,
    warning,
  };
}
