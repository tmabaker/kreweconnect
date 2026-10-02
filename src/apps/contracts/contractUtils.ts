import type {
  AgreementCategory,
  BillingFrequency,
  ContactRole,
  ContractStatus,
  RenewalType,
} from "../../shared/types";

export function getStatusColor(status: ContractStatus): "success" | "brand" | "warning" | "danger" | "informative" | "important" | "subtle" | "severe" {
  switch (status) {
    case "Active": return "success";
    case "Draft": return "brand";
    case "UnderReview": return "warning";
    case "PendingRenewalDecision": return "severe";
    case "Unknown": return "informative";
    case "Expired": return "danger";
    case "Terminated": return "subtle";
    case "Renewed": return "important";
    default: return "informative";
  }
}

export function getStatusLabel(status: ContractStatus): string {
  switch (status) {
    case "UnderReview": return "Under Review";
    case "PendingRenewalDecision": return "Renewal Decision Due";
    default: return status;
  }
}

export function getUrgencyColor(daysRemaining: number): "danger" | "warning" | "success" | "informative" {
  if (daysRemaining <= 30) return "danger";
  if (daysRemaining <= 60) return "warning";
  if (daysRemaining <= 90) return "success";
  return "informative";
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return "No expiry";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Expires today";
  return `${days}d left`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CONTRACT_TYPES = ["Software", "Hardware", "Service", "Lease", "Subscription", "Consulting", "Other"] as const;
export const CONTRACT_STATUSES = ["Draft", "Active", "UnderReview", "PendingRenewalDecision", "Expired", "Terminated", "Renewed", "Unknown"] as const;

// ─── Schema v2 (KreweReview) ──────────────────────────────────────

export const AGREEMENT_CATEGORIES: readonly AgreementCategory[] = [
  "VendorService", "MasterServices", "StatementOfWork", "SoftwareLicense", "SaaSSubscription",
  "InsurancePolicy", "CertificateOfInsurance", "Lease", "Maintenance", "Warranty",
  "ProfessionalServices", "Membership", "Certification", "Telecom", "Utility",
  "Financing", "FranchiseOrDealer", "PayerContract", "Confidentiality", "Other",
] as const;

export const RENEWAL_TYPES: readonly RenewalType[] = [
  "MonthToMonth", "AutoRenew", "ExpireUnlessRenewed", "Evergreen", "FixedTermNoRenewal", "Unknown",
] as const;

export const BILLING_FREQUENCIES: readonly BillingFrequency[] = [
  "Monthly", "Quarterly", "SemiAnnual", "Annual", "OneTime", "Usage", "Unknown",
] as const;

/** The three fixed roles shown on the form come first, in the order Tammy named them. */
export const CONTACT_ROLES: readonly ContactRole[] = [
  "ExternalServicer", "Support", "Payable", "InternalOwner", "Broker", "Other",
] as const;

const CATEGORY_LABELS: Record<AgreementCategory, string> = {
  VendorService: "Vendor Service",
  MasterServices: "Master Services Agreement",
  StatementOfWork: "Statement of Work",
  SoftwareLicense: "Software License",
  SaaSSubscription: "SaaS Subscription",
  InsurancePolicy: "Insurance Policy",
  CertificateOfInsurance: "Certificate of Insurance",
  Lease: "Lease",
  Maintenance: "Maintenance",
  Warranty: "Warranty",
  ProfessionalServices: "Professional Services",
  Membership: "Membership",
  Certification: "Certification",
  Telecom: "Telecom",
  Utility: "Utility",
  Financing: "Financing",
  FranchiseOrDealer: "Franchise / Dealer",
  PayerContract: "Payer Contract",
  Confidentiality: "Confidentiality (NDA)",
  Other: "Other",
};

const RENEWAL_TYPE_LABELS: Record<RenewalType, string> = {
  MonthToMonth: "Month to Month",
  AutoRenew: "Auto-Renew",
  ExpireUnlessRenewed: "Expires Unless Renewed",
  Evergreen: "Evergreen",
  FixedTermNoRenewal: "Fixed Term (No Renewal)",
  Unknown: "Unknown",
};

const BILLING_FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  Monthly: "Monthly",
  Quarterly: "Quarterly",
  SemiAnnual: "Semi-Annual",
  Annual: "Annual",
  OneTime: "One Time",
  Usage: "Usage Based",
  Unknown: "Unknown",
};

const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  ExternalServicer: "External servicer",
  Support: "Support",
  Payable: "Payable",
  InternalOwner: "Internal owner",
  Broker: "Broker",
  Other: "Other",
};

export function getCategoryLabel(category: AgreementCategory | null | undefined): string {
  return category ? CATEGORY_LABELS[category] ?? category : "—";
}

export function getRenewalTypeLabel(type: RenewalType | null | undefined): string {
  return type ? RENEWAL_TYPE_LABELS[type] ?? type : "—";
}

export function getBillingFrequencyLabel(freq: BillingFrequency | null | undefined): string {
  return freq ? BILLING_FREQUENCY_LABELS[freq] ?? freq : "—";
}

export function getContactRoleLabel(role: ContactRole): string {
  return CONTACT_ROLE_LABELS[role] ?? role;
}

// ─── Date and value helpers ───────────────────────────────────────

/** Days between the earliest and latest decision date when the document does not state one. */
export const DEFAULT_DECISION_WINDOW_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD (or ISO) string as a UTC midnight timestamp. Returns null when invalid. */
function parseDateUtc(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function formatDateUtc(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

/**
 * Compute the renewal decision window per KreweReview schema v2.
 *
 *  - latest   = endDate - noticePeriodDays; for ExpireUnlessRenewed the contract simply
 *               lapses, so latest = endDate (notice period is ignored).
 *  - earliest = latest - 90 days (vendor will quote, early renewal allowed).
 *
 * Returns nulls when there is no usable end date (month to month, evergreen, unknown).
 * Dates are YYYY-MM-DD strings, computed in UTC so the result never shifts by timezone.
 */
export function computeDecisionDates(
  endDate: string | null | undefined,
  noticePeriodDays: number | null | undefined,
  renewalType: RenewalType | null | undefined,
): { earliest: string | null; latest: string | null } {
  const end = parseDateUtc(endDate);
  if (end === null) return { earliest: null, latest: null };

  const notice = renewalType === "ExpireUnlessRenewed"
    ? 0
    : Math.max(0, Math.trunc(noticePeriodDays ?? 0));
  const latest = end - notice * MS_PER_DAY;
  const earliest = latest - DEFAULT_DECISION_WINDOW_DAYS * MS_PER_DAY;
  return { earliest: formatDateUtc(earliest), latest: formatDateUtc(latest) };
}

const PERIODS_PER_YEAR: Partial<Record<BillingFrequency, number>> = {
  Monthly: 12,
  Quarterly: 4,
  SemiAnnual: 2,
  Annual: 1,
};

/**
 * Annualized value per schema v2: recurringAmount x billing periods per year, else
 * totalValue / term in years (needs both dates, term > 0). Returns null when neither works.
 * OneTime, Usage and Unknown frequencies cannot be annualized from a recurring amount.
 */
export function annualizeValue(
  recurringAmount: number | null | undefined,
  billingFrequency: BillingFrequency | null | undefined,
  totalValue: number | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number | null {
  const periods = billingFrequency ? PERIODS_PER_YEAR[billingFrequency] : undefined;
  if (recurringAmount != null && periods) {
    return Math.round(recurringAmount * periods * 100) / 100;
  }

  const start = parseDateUtc(startDate);
  const end = parseDateUtc(endDate);
  if (totalValue != null && start !== null && end !== null && end > start) {
    const years = (end - start) / (365.25 * MS_PER_DAY);
    return Math.round((totalValue / years) * 100) / 100;
  }
  return null;
}
