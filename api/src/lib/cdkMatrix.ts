import matrix from "../config/geaux-cdk.json";
import { randomBytes, randomUUID } from "node:crypto";
import { BadRequestError } from "./http";

export const GEAUX_TENANT_ID = "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa";

type Dict = Record<string, unknown>;
type Template = { access?: string; profile?: string; accounts?: string[]; roles?: string[]; review?: boolean; note?: string };
type Store = { prefix: string | null; dmsCompany: string | null; storeId: string; storeName: string };

export type CDKAssignment = {
  state: "ok" | "no-access" | "manual" | "unknown-title" | "unknown-store";
  cdkRequired: boolean;
  reviewRequired: boolean;
  version: string;
  store?: Store;
  profile?: string;
  accounts?: string[];
  roles?: string[];
  note?: string;
};

function record(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : {};
}

export function publicMatrix(): Dict {
  const cfg = matrix as unknown as Dict;
  return {
    version: cfg.version,
    status: cfg.status,
    updated: cfg.updated,
    stores: cfg.stores,
    titles: cfg.titles,
    departmentOverrides: cfg.departmentOverrides,
  };
}

export function resolveCDK(company: string, department: string, title: string): CDKAssignment {
  const cfg = matrix as unknown as Dict;
  const stores = record(cfg.stores);
  const titles = record(cfg.titles);
  const overrides = record(cfg.departmentOverrides);
  const store = stores[company] as Store | undefined;
  const base = { version: String(cfg.version || ""), cdkRequired: false, reviewRequired: false };
  if (!store) return { ...base, state: "unknown-store", note: "The selected company is not mapped to a CDK store." };
  const scoped = overrides[department + "|" + title] as Template | undefined;
  const template = scoped || titles[title] as Template | undefined;
  if (!template) return { ...base, state: "unknown-title", store, note: "This title is not mapped in the CDK matrix." };
  if (template.access === "none") return { ...base, state: "no-access", store, note: template.note };
  if (template.access === "manual") return { ...base, state: "manual", store, reviewRequired: true, note: template.note };
  const literal = new Set((cfg.literalAccounts as string[]) || []);
  const accounts = (template.accounts || []).map(code =>
    literal.has(code) ? code : store.prefix ? store.prefix + "-" + code : code
  );
  return {
    ...base,
    state: "ok",
    cdkRequired: true,
    reviewRequired: Boolean(template.review) || !store.dmsCompany,
    store,
    profile: template.profile,
    accounts,
    roles: template.roles || [],
    note: template.review ? "This matrix row requires technician review before CDK provisioning." : undefined,
  };
}

export function deriveDmsUserId(firstName: string, lastName: string): string {
  const clean = (firstName.slice(0, 1) + lastName).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!clean) throw new BadRequestError("A CDK DMS user ID could not be derived from the employee name.");
  return clean.slice(0, 8);
}

export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(18);
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
}

export function newJobId(): string {
  return randomUUID();
}
