/**
 * KreweReview contract record: the fixed value lists and the validation every
 * write goes through. Free text is allowed only for genuinely free fields
 * (title, vendor, notes); every classifier must come from a list here or from
 * the tenant's location/department pick list.
 */

import { BadRequestError } from "./http";

export const AGREEMENT_CATEGORIES = [
  "VendorService",
  "MasterServices",
  "StatementOfWork",
  "SoftwareLicense",
  "SaaSSubscription",
  "InsurancePolicy",
  "CertificateOfInsurance",
  "Lease",
  "Maintenance",
  "Warranty",
  "ProfessionalServices",
  "Membership",
  "Certification",
  "Telecom",
  "Utility",
  "Financing",
  "FranchiseOrDealer",
  "PayerContract",
  "Confidentiality",
  "Rebate",
  "License",
  "Other",
] as const;

export const CONTRACT_STATUSES = [
  "Draft",
  "Active",
  "UnderReview",
  "PendingRenewalDecision",
  "Expired",
  "Terminated",
  "Renewed",
  "Unknown",
] as const;

export const RENEWAL_TYPES = [
  "MonthToMonth",
  "AutoRenew",
  "ExpireUnlessRenewed",
  "Evergreen",
  "FixedTermNoRenewal",
  "Unknown",
] as const;

export const BILLING_FREQUENCIES = ["Monthly", "Quarterly", "SemiAnnual", "Annual", "OneTime", "Usage", "Unknown"] as const;
export const RISK_CLASSES = ["Low", "Medium", "High", "Critical"] as const;
export const CONFIDENCE_TIERS = ["A", "B", "C"] as const;
export const CONTACT_ROLES = ["ExternalServicer", "Support", "Payable", "InternalOwner", "Broker", "Other"] as const;
export const OBLIGATION_STATUSES = ["Open", "Done", "Waived"] as const;

export const CONTRACT_TAGS = [
  "Critical",
  "Security",
  "Productivity",
  "Backup",
  "Monitoring",
  "Infrastructure",
  "Compliance",
  "Cloud",
] as const;

export type AgreementCategory = (typeof AGREEMENT_CATEGORIES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface ContractContact {
  id: string;
  role: (typeof CONTACT_ROLES)[number];
  name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  portalUrl: string | null;
  notes: string | null;
  sourceRef: string | null;
}

export interface ContractObligation {
  id: string;
  description: string;
  dueDate: string | null;
  recurrence: string | null;
  owner: string | null;
  status: (typeof OBLIGATION_STATUSES)[number];
}

export interface ContractDocument {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  /** "original" for the first upload, "renewal" for a later executed renewal. */
  kind: "original" | "renewal" | "supporting";
  uploadedById: string | null;
  uploadedAt: string;
}

export interface ContractVersion {
  id: string;
  versionNumber: number;
  summary: string | null;
  changedById: string | null;
  changedAt: string;
  changeNotes: string | null;
}

/** The editable fields. Everything else on a record is set by the server. */
export interface ContractFields {
  title: string;
  vendorName: string;
  counterpartyName: string | null;
  agreementCategory: AgreementCategory;
  location: string | null;
  department: string | null;
  status: ContractStatus;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  renewalType: (typeof RENEWAL_TYPES)[number] | null;
  noticePeriodDays: number | null;
  renewalTermMonths: number | null;
  earliestRenewalDecisionDate: string | null;
  latestRenewalDecisionDate: string | null;
  totalValue: number | null;
  recurringAmount: number | null;
  billingFrequency: (typeof BILLING_FREQUENCIES)[number] | null;
  currency: string;
  description: string | null;
  slaTerms: string | null;
  notes: string | null;
  terminationTerms: string | null;
  clientInternalOwner: string | null;
  riskClass: (typeof RISK_CLASSES)[number] | null;
  policyOrAccountNumber: string | null;
  coverageOrScopeSummary: string | null;
  reviewQuestions: string[];
  tags: string[];
  confidenceTier: (typeof CONFIDENCE_TIERS)[number] | null;
  needsReview: boolean;
  contacts: ContractContact[];
  obligations: ContractObligation[];
}

export interface ContractRecord extends ContractFields {
  id: string;
  tenantId: string;
  tenantDisplayName: string;
  documents: ContractDocument[];
  versions: ContractVersion[];
  extractedAt: string | null;
  extractionModel: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedById: string | null;
  updatedAt: string;
}

/** What the caller's tenant allows for the two per-tenant lists. */
export interface TenantPicklist {
  locations: string[];
  departments: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(body: Record<string, unknown>, key: string, max = 2000): string | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new BadRequestError(`${key} must be text.`);
  const t = v.trim();
  if (t.length > max) throw new BadRequestError(`${key} is too long (max ${max} characters).`);
  return t || null;
}

function oneOf<T extends string>(body: Record<string, unknown>, key: string, list: readonly T[]): T | null {
  const v = str(body, key, 100);
  if (v === null) return null;
  if (!(list as readonly string[]).includes(v)) {
    throw new BadRequestError(`${key} must be one of: ${list.join(", ")}.`);
  }
  return v as T;
}

function date(body: Record<string, unknown>, key: string): string | null {
  const v = str(body, key, 10);
  if (v === null) return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) {
    throw new BadRequestError(`${key} must be a date in YYYY-MM-DD form.`);
  }
  return v;
}

function num(body: Record<string, unknown>, key: string, { integer = false } = {}): number | null {
  const v = body[key];
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new BadRequestError(`${key} must be a non-negative number.`);
  if (integer && !Number.isInteger(n)) throw new BadRequestError(`${key} must be a whole number.`);
  return n;
}

function stringList(body: Record<string, unknown>, key: string, maxItems = 50): string[] {
  const v = body[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new BadRequestError(`${key} must be a list of text values.`);
  }
  const out = (v as string[]).map((s) => s.trim()).filter(Boolean);
  if (out.length > maxItems) throw new BadRequestError(`${key} has too many entries.`);
  return [...new Set(out)];
}

function objects(body: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = body[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => !x || typeof x !== "object" || Array.isArray(x))) {
    throw new BadRequestError(`${key} must be a list of objects.`);
  }
  if (v.length > 50) throw new BadRequestError(`${key} has too many entries.`);
  return v as Record<string, unknown>[];
}

function pickFromTenantList(value: string | null, list: string[], label: string): string | null {
  if (list.length === 0) {
    if (value !== null) throw new BadRequestError(`No ${label} list is set up for this tenant yet.`);
    return null;
  }
  if (value === null) throw new BadRequestError(`${label} is required.`);
  const match = list.find((x) => x.toLowerCase() === value.toLowerCase());
  if (!match) throw new BadRequestError(`${label} must be one of: ${list.join(", ")}.`);
  return match;
}

/**
 * Validate and normalize a create/update body. Throws BadRequestError (400)
 * with a readable message on the first problem. `newId` mints ids for new
 * contacts/obligations.
 */
export function parseContractFields(
  body: Record<string, unknown>,
  picklist: TenantPicklist,
  newId: () => string
): ContractFields {
  const title = str(body, "title", 300);
  if (!title) throw new BadRequestError("title is required.");
  const vendorName = str(body, "vendorName", 200);
  if (!vendorName) throw new BadRequestError("vendorName is required.");
  const agreementCategory = oneOf(body, "agreementCategory", AGREEMENT_CATEGORIES);
  if (!agreementCategory) throw new BadRequestError("agreementCategory is required.");

  const tags = stringList(body, "tags", CONTRACT_TAGS.length);
  for (const t of tags) {
    if (!(CONTRACT_TAGS as readonly string[]).includes(t)) {
      throw new BadRequestError(`tags must come from: ${CONTRACT_TAGS.join(", ")}.`);
    }
  }

  const startDate = date(body, "startDate");
  const endDate = date(body, "endDate");
  if (startDate && endDate && endDate < startDate) {
    throw new BadRequestError("endDate cannot be before startDate.");
  }

  const contacts: ContractContact[] = objects(body, "contacts").map((c) => {
    const role = oneOf(c, "role", CONTACT_ROLES);
    if (!role) throw new BadRequestError("Each contact needs a role.");
    return {
      id: str(c, "id", 64) ?? newId(),
      role,
      name: str(c, "name", 200),
      company: str(c, "company", 200),
      title: str(c, "title", 200),
      email: str(c, "email", 320),
      phone: str(c, "phone", 50),
      portalUrl: str(c, "portalUrl", 500),
      notes: str(c, "notes", 1000),
      sourceRef: str(c, "sourceRef", 500),
    };
  });

  const obligations: ContractObligation[] = objects(body, "obligations").map((o) => {
    const description = str(o, "description", 1000);
    if (!description) throw new BadRequestError("Each obligation needs a description.");
    return {
      id: str(o, "id", 64) ?? newId(),
      description,
      dueDate: date(o, "dueDate"),
      recurrence: str(o, "recurrence", 200),
      owner: str(o, "owner", 200),
      status: oneOf(o, "status", OBLIGATION_STATUSES) ?? "Open",
    };
  });

  return {
    title,
    vendorName,
    counterpartyName: str(body, "counterpartyName", 300),
    agreementCategory,
    location: pickFromTenantList(str(body, "location", 200), picklist.locations, "location"),
    department: pickFromTenantList(str(body, "department", 200), picklist.departments, "department"),
    status: oneOf(body, "status", CONTRACT_STATUSES) ?? "Draft",
    startDate,
    endDate,
    renewalDate: date(body, "renewalDate"),
    renewalType: oneOf(body, "renewalType", RENEWAL_TYPES),
    noticePeriodDays: num(body, "noticePeriodDays", { integer: true }),
    renewalTermMonths: num(body, "renewalTermMonths", { integer: true }),
    earliestRenewalDecisionDate: date(body, "earliestRenewalDecisionDate"),
    latestRenewalDecisionDate: date(body, "latestRenewalDecisionDate"),
    totalValue: num(body, "totalValue"),
    recurringAmount: num(body, "recurringAmount"),
    billingFrequency: oneOf(body, "billingFrequency", BILLING_FREQUENCIES),
    currency: "USD",
    description: str(body, "description", 4000),
    slaTerms: str(body, "slaTerms", 2000),
    notes: str(body, "notes", 4000),
    terminationTerms: str(body, "terminationTerms", 2000),
    clientInternalOwner: str(body, "clientInternalOwner", 200),
    riskClass: oneOf(body, "riskClass", RISK_CLASSES),
    policyOrAccountNumber: str(body, "policyOrAccountNumber", 200),
    coverageOrScopeSummary: str(body, "coverageOrScopeSummary", 2000),
    reviewQuestions: stringList(body, "reviewQuestions", 20),
    tags,
    confidenceTier: oneOf(body, "confidenceTier", CONFIDENCE_TIERS),
    needsReview: body.needsReview === true,
    contacts,
    obligations,
  };
}
