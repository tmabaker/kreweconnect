import { useState, useMemo, useCallback } from "react";
import type {
  AgreementCategory,
  BillingFrequency,
  ConfidenceTier,
  ContactRole,
  ContractContactItem,
  ContractDashboard,
  ContractDetail,
  ContractListItem,
  ContractObligationItem,
  ContractStatus,
  ContractType,
  RenewalAlertItem,
  RenewalType,
  RiskClass,
  SourceSystem,
  TagItem,
} from "../types";
import { annualizeValue, computeDecisionDates } from "../../apps/contracts/contractUtils";

const today = new Date();
const addDays = (d: Date, days: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r.toISOString().split("T")[0];
};
const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r.toISOString().split("T")[0];
};
const todayStr = today.toISOString().split("T")[0];

const MOCK_TAGS: TagItem[] = [
  { id: "t1", name: "Critical", color: "#D13438" },
  { id: "t2", name: "Security", color: "#0078D4" },
  { id: "t3", name: "Productivity", color: "#107C10" },
  { id: "t4", name: "Backup", color: "#8764B8" },
  { id: "t5", name: "Monitoring", color: "#FF8C00" },
  { id: "t6", name: "Infrastructure", color: "#004E8C" },
  { id: "t7", name: "Compliance", color: "#C239B3" },
  { id: "t8", name: "Cloud", color: "#00BCF2" },
];

/** Fields that existed before schema v2. The v2 list fields are merged in from V2_META below. */
type BaseContract = Omit<
  ContractListItem,
  "agreementCategory" | "renewalType" | "latestRenewalDecisionDate" | "earliestRenewalDecisionDate" | "confidenceTier" | "needsReview"
>;

const BASE_CONTRACTS: BaseContract[] = [
  // Bayou Automotive
  { id: "c-ba-001", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Microsoft", contractType: "Subscription", title: "Microsoft 365 Business Premium", startDate: addMonths(today, -10), endDate: addMonths(today, 14), renewalDate: addMonths(today, 13), autoRenew: true, value: 9600, currency: "USD", status: "Active", daysUntilExpiry: 425, tags: ["Critical", "Productivity", "Cloud"] },
  { id: "c-ba-002", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Datto", contractType: "Subscription", title: "Datto RMM - Endpoint Management", startDate: addMonths(today, -6), endDate: addMonths(today, 18), renewalDate: addMonths(today, 17), autoRenew: true, value: 4800, currency: "USD", status: "Active", daysUntilExpiry: 547, tags: ["Critical", "Monitoring"] },
  { id: "c-ba-003", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "SentinelOne", contractType: "Subscription", title: "SentinelOne Singularity - EDR", startDate: addMonths(today, -3), endDate: addMonths(today, 9), renewalDate: addMonths(today, 8), autoRenew: true, value: 7200, currency: "USD", status: "Active", daysUntilExpiry: 273, tags: ["Critical", "Security"] },
  { id: "c-ba-004", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Cisco Meraki", contractType: "Hardware", title: "Meraki MX Firewall + Licensing", startDate: addMonths(today, -12), endDate: addDays(today, 25), renewalDate: todayStr, autoRenew: false, value: 3600, currency: "USD", status: "PendingRenewalDecision", daysUntilExpiry: 25, tags: ["Infrastructure", "Security"] },
  { id: "c-ba-005", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "IT Glue", contractType: "Subscription", title: "IT Glue Documentation Platform", startDate: addMonths(today, -8), endDate: addMonths(today, 16), renewalDate: addMonths(today, 15), autoRenew: true, value: 2400, currency: "USD", status: "Active", daysUntilExpiry: 486, tags: ["Productivity"] },
  { id: "c-ba-006", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Adobe", contractType: "Software", title: "Adobe Creative Cloud - Team License", startDate: addMonths(today, -4), endDate: addMonths(today, 8), renewalDate: addMonths(today, 7), autoRenew: true, value: 1800, currency: "USD", status: "Unknown", daysUntilExpiry: 243, tags: ["Productivity"] },

  // Fishman Haygood
  { id: "c-fh-001", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Microsoft", contractType: "Subscription", title: "Microsoft 365 E3 Enterprise", startDate: addMonths(today, -5), endDate: addMonths(today, 7), renewalDate: addMonths(today, 6), autoRenew: true, value: 18000, currency: "USD", status: "Active", daysUntilExpiry: 213, tags: ["Critical", "Productivity", "Compliance", "Cloud"] },
  { id: "c-fh-002", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "ConnectWise", contractType: "Subscription", title: "ConnectWise Automate - RMM", startDate: addMonths(today, -9), endDate: addMonths(today, 3), renewalDate: addMonths(today, 2), autoRenew: true, value: 6000, currency: "USD", status: "Active", daysUntilExpiry: 91, tags: ["Critical", "Monitoring"] },
  { id: "c-fh-003", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Spanning", contractType: "Subscription", title: "Spanning Backup for Microsoft 365", startDate: addMonths(today, -7), endDate: addMonths(today, 5), renewalDate: addMonths(today, 4), autoRenew: true, value: 3600, currency: "USD", status: "Active", daysUntilExpiry: 152, tags: ["Backup", "Cloud"] },
  { id: "c-fh-004", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "ThreatLocker", contractType: "Subscription", title: "ThreatLocker Zero Trust - Ringfencing", startDate: addMonths(today, -2), endDate: addMonths(today, 10), renewalDate: addMonths(today, 9), autoRenew: true, value: 5400, currency: "USD", status: "Active", daysUntilExpiry: 304, tags: ["Critical", "Security"] },
  { id: "c-fh-005", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "RocketCyber", contractType: "Service", title: "RocketCyber MDR Platform", startDate: addMonths(today, -11), endDate: addDays(today, 15), renewalDate: todayStr, autoRenew: true, value: 8400, currency: "USD", status: "PendingRenewalDecision", daysUntilExpiry: 15, tags: ["Security", "Monitoring"] },
  { id: "c-fh-006", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Vonahi Security", contractType: "Service", title: "vPenTest - Automated Penetration Testing", startDate: addMonths(today, -1), endDate: addMonths(today, 11), renewalDate: addMonths(today, 10), autoRenew: false, value: 4200, currency: "USD", status: "UnderReview", daysUntilExpiry: 334, tags: ["Security", "Compliance"] },
  { id: "c-fh-007", tenantId: 2, tenantDisplayName: "Fishman Haygood", vendorName: "Kaseya", contractType: "Subscription", title: "DarkWeb ID - Dark Web Monitoring", startDate: addMonths(today, -6), endDate: addMonths(today, 6), renewalDate: addMonths(today, 5), autoRenew: true, value: 2100, currency: "USD", status: "Active", daysUntilExpiry: 182, tags: ["Security"] },

  // Irby Investments
  { id: "c-ii-001", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Microsoft", contractType: "Subscription", title: "Microsoft 365 Business Standard", startDate: addMonths(today, -4), endDate: addMonths(today, 8), renewalDate: addMonths(today, 7), autoRenew: true, value: 6600, currency: "USD", status: "Active", daysUntilExpiry: 243, tags: ["Critical", "Productivity", "Cloud"] },
  { id: "c-ii-002", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Datto", contractType: "Service", title: "Datto BCDR - Business Continuity", startDate: addMonths(today, -10), endDate: addMonths(today, 2), renewalDate: addMonths(today, 1), autoRenew: true, value: 5400, currency: "USD", status: "Active", daysUntilExpiry: 61, tags: ["Critical", "Backup"] },
  { id: "c-ii-003", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Phinsec", contractType: "Service", title: "Phinsec Security Awareness Training", startDate: addMonths(today, -3), endDate: addMonths(today, 9), renewalDate: addMonths(today, 8), autoRenew: true, value: 1800, currency: "USD", status: "Active", daysUntilExpiry: 273, tags: ["Security", "Compliance"] },
  { id: "c-ii-004", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "SaaS Alerts", contractType: "Subscription", title: "SaaS Alerts - Cloud App Monitoring", startDate: todayStr, endDate: addMonths(today, 12), renewalDate: addMonths(today, 11), autoRenew: false, value: 1500, currency: "USD", status: "Draft", daysUntilExpiry: 365, tags: ["Monitoring", "Cloud"] },
  { id: "c-ii-005", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Cisco Meraki", contractType: "Hardware", title: "Meraki MR Access Points - Office WiFi", startDate: addMonths(today, -18), endDate: addDays(today, -10), renewalDate: addDays(today, -40), autoRenew: false, value: 2400, currency: "USD", status: "Expired", daysUntilExpiry: -10, tags: ["Infrastructure"] },
  { id: "c-ii-006", tenantId: 3, tenantDisplayName: "Irby Investments", vendorName: "Scalepad", contractType: "Subscription", title: "Scalepad Lifecycle Manager", startDate: addMonths(today, -5), endDate: addDays(today, 20), renewalDate: addDays(today, 20), autoRenew: false, value: 1200, currency: "USD", status: "Active", daysUntilExpiry: 20, tags: ["Monitoring"] },

  // Imported from document discovery (fictional records, schema v2 examples)
  { id: "c-ba-007", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Pelican State Mutual", contractType: "Other", title: "Commercial General Liability Policy", startDate: addMonths(today, -7), endDate: addMonths(today, 5), renewalDate: addMonths(today, 4), autoRenew: false, value: 14400, currency: "USD", status: "Active", daysUntilExpiry: 152, tags: ["Compliance"] },
  { id: "c-ba-008", tenantId: 1, tenantDisplayName: "Bayou Automotive", vendorName: "Magnolia Property Group", contractType: "Lease", title: "Showroom Lease - Main Street", startDate: addMonths(today, -30), endDate: addMonths(today, 6), renewalDate: addMonths(today, 4), autoRenew: false, value: 216000, currency: "USD", status: "Unknown", daysUntilExpiry: 182, tags: ["Infrastructure"] },
];

// ─── Schema v2 metadata (fictional sample data) ───────────────────

interface ContactSeed {
  role: ContactRole;
  name: string;
  company: string;
  email: string;
  phone: string;
}

interface V2Meta {
  category: AgreementCategory;
  renewalType: RenewalType;
  noticePeriodDays?: number;
  renewalTermMonths?: number;
  /** Stated in the document; overrides the computed decision dates. */
  statedDecisionDates?: { earliest: string | null; latest: string | null };
  tier: ConfidenceTier;
  needsReview?: boolean;
  billing?: BillingFrequency;
  recurring?: number;
  counterparty?: string;
  owner?: string;
  department?: string;
  risk?: RiskClass;
  policyOrAccountNumber?: string;
  scope?: string;
  termination?: string;
  reviewQuestions?: string[];
  source?: {
    system: SourceSystem;
    container: string;
    path: string;
    itemId: string;
    webUrl: string;
    hash: string;
    extractedAt: string;
    model: string;
  };
  contacts?: ContactSeed[];
  obligations?: { description: string; dueDate: string | null; recurrence: string | null; owner: string | null }[];
}

const SAMPLE_TENANT_GUID = "aaaaaaaa-1111-2222-3333-444444444444";

const V2_META: Record<string, V2Meta> = {
  "c-ba-001": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 30, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 800, counterparty: "Microsoft Corporation", owner: "Dana Whitfield", department: "IT", risk: "High",
    scope: "40 seats, Business Premium", termination: "Cancel within 7 days of renewal for a full refund; otherwise term runs to end date.",
    contacts: [
      { role: "ExternalServicer", name: "Riley Boudreaux", company: "Sample Cloud Partner", email: "riley@partner.example.com", phone: "555-0101" },
      { role: "Support", name: "Partner Service Desk", company: "Sample Cloud Partner", email: "support@partner.example.com", phone: "555-0102" },
      { role: "Payable", name: "Accounts Receivable", company: "Sample Cloud Partner", email: "billing@partner.example.com", phone: "555-0103" },
    ],
  },
  "c-ba-002": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 60, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 400, counterparty: "Datto, Inc.", department: "IT", risk: "High", scope: "Endpoint management, 55 devices",
  },
  "c-ba-003": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 90, renewalTermMonths: 12, tier: "B",
    billing: "Annual", recurring: 7200, counterparty: "SentinelOne, Inc.", department: "IT", risk: "Critical", scope: "Singularity Complete, 55 endpoints",
  },
  "c-ba-004": {
    category: "Maintenance", renewalType: "ExpireUnlessRenewed", tier: "B", needsReview: true,
    billing: "Annual", recurring: 3600, counterparty: "Cisco Meraki", department: "IT", scope: "MX firewall license and support, 1 appliance",
    termination: "License lapses at term end; device stops passing traffic after a short grace period.",
    reviewQuestions: ["Is the co-termination date on the license the same as the invoice date?", "Is the appliance still the model in the current office?"],
  },
  "c-ba-005": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 30, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 200, counterparty: "IT Glue", department: "IT", scope: "Documentation platform, 5 users",
  },
  "c-ba-006": {
    category: "SoftwareLicense", renewalType: "Unknown", tier: "C", needsReview: true,
    billing: "Unknown", counterparty: "Adobe Inc.", department: "Marketing",
    reviewQuestions: ["Who in marketing owns the Adobe account?", "Is this a named user team plan or a device license?", "Where is the signed order form?"],
    source: {
      system: "Mail", container: "accounts@bayou.example.com", path: "Inbox/Vendors/Adobe",
      itemId: "msg-sample-0006", webUrl: "https://outlook.example.com/mail/id/msg-sample-0006",
      hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      extractedAt: "2026-09-28T14:05:00Z", model: "rules-v1",
    },
  },
  "c-fh-001": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 30, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 1500, counterparty: "Microsoft Corporation", department: "IT", risk: "High", scope: "E3, 100 seats",
  },
  "c-fh-002": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 60, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 500, counterparty: "ConnectWise, LLC", department: "IT", scope: "Automate RMM, 120 devices",
  },
  "c-fh-003": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 30, renewalTermMonths: 12, tier: "B", needsReview: true,
    billing: "Monthly", recurring: 300, counterparty: "Spanning Cloud Apps", department: "IT", scope: "Microsoft 365 backup, per user",
    reviewQuestions: ["Seat count on the invoice differs from the quote. Which is current?"],
  },
  "c-fh-004": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 60, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 450, counterparty: "ThreatLocker, Inc.", department: "IT", risk: "Critical", scope: "Application control, 120 endpoints",
  },
  "c-fh-005": {
    category: "VendorService", renewalType: "AutoRenew", noticePeriodDays: 30, renewalTermMonths: 12, tier: "A",
    billing: "Annual", recurring: 8400, counterparty: "RocketCyber, Inc.", department: "IT", risk: "High", scope: "Managed detection and response",
    termination: "Written notice 30 days before the term end; otherwise renews for 12 months.",
    contacts: [
      { role: "ExternalServicer", name: "Morgan Thibodaux", company: "RocketCyber, Inc.", email: "morgan@rocket.example.com", phone: "555-0111" },
      { role: "Support", name: "SOC Desk", company: "RocketCyber, Inc.", email: "soc@rocket.example.com", phone: "555-0112" },
      { role: "Payable", name: "Billing", company: "RocketCyber, Inc.", email: "billing@rocket.example.com", phone: "555-0113" },
    ],
    obligations: [
      { description: "Send cancellation notice if not renewing", dueDate: addDays(today, -15), recurrence: "Annual", owner: "Dana Whitfield" },
    ],
  },
  "c-fh-006": {
    category: "ProfessionalServices", renewalType: "FixedTermNoRenewal", tier: "B", needsReview: true,
    billing: "Annual", recurring: 4200, counterparty: "Vonahi Security", department: "Security", risk: "Medium", scope: "Automated external and internal penetration tests",
    reviewQuestions: ["Does the agreement allow a second internal test during the term?"],
  },
  "c-fh-007": {
    category: "SaaSSubscription", renewalType: "Evergreen", noticePeriodDays: 30, renewalTermMonths: 1, tier: "B",
    billing: "Monthly", recurring: 175, counterparty: "Kaseya US LLC", department: "IT", scope: "Dark web monitoring, per domain",
  },
  "c-ii-001": {
    category: "SaaSSubscription", renewalType: "AutoRenew", noticePeriodDays: 30, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 550, counterparty: "Microsoft Corporation", owner: "Casey Landry", department: "IT", risk: "High", scope: "Business Standard, 35 seats",
    contacts: [
      { role: "ExternalServicer", name: "Jordan Fontenot", company: "Sample Cloud Partner", email: "jordan@partner.example.com", phone: "555-0121" },
      { role: "Support", name: "Partner Service Desk", company: "Sample Cloud Partner", email: "support@partner.example.com", phone: "555-0102" },
      { role: "Payable", name: "Accounts Receivable", company: "Sample Cloud Partner", email: "billing@partner.example.com", phone: "555-0103" },
    ],
    source: {
      system: "SharePoint", container: "Operations", path: "Shared Documents/Vendors/Microsoft",
      itemId: "item-sample-0101", webUrl: "https://sharepoint.example.com/sites/operations/Shared%20Documents/Vendors/Microsoft/m365-order.pdf",
      hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      extractedAt: "2026-09-29T16:30:00Z", model: "contract-extractor-v2",
    },
  },
  "c-ii-002": {
    category: "VendorService", renewalType: "AutoRenew", noticePeriodDays: 90, renewalTermMonths: 12, tier: "A",
    billing: "Monthly", recurring: 450, counterparty: "Datto, Inc.", owner: "Casey Landry", department: "IT", risk: "Critical", scope: "BCDR appliance and cloud retention",
    contacts: [
      { role: "ExternalServicer", name: "Avery Guidry", company: "Datto, Inc.", email: "avery@datto.example.com", phone: "555-0131" },
      { role: "Support", name: "Datto Support", company: "Datto, Inc.", email: "support@datto.example.com", phone: "555-0132" },
      { role: "Payable", name: "Accounts Receivable", company: "Datto, Inc.", email: "ar@datto.example.com", phone: "555-0133" },
    ],
    source: {
      system: "OneDrive", container: "casey@client.example.com", path: "Documents/Contracts/Backup",
      itemId: "item-sample-0102", webUrl: "https://onedrive.example.com/personal/casey/Documents/Contracts/Backup/bcdr-agreement.pdf",
      hash: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
      extractedAt: "2026-09-29T16:42:00Z", model: "contract-extractor-v2",
    },
  },
  "c-ii-003": {
    category: "VendorService", renewalType: "ExpireUnlessRenewed", tier: "A",
    billing: "Annual", recurring: 1800, counterparty: "Phinsec", department: "Compliance", scope: "Security awareness training, annual",
  },
  "c-ii-004": {
    category: "SaaSSubscription", renewalType: "ExpireUnlessRenewed", tier: "C", needsReview: true,
    billing: "Annual", recurring: 1500, counterparty: "SaaS Alerts", department: "IT",
    reviewQuestions: ["Has this subscription been signed yet?", "Which users are in scope?"],
  },
  "c-ii-005": {
    category: "Warranty", renewalType: "FixedTermNoRenewal", tier: "B",
    billing: "OneTime", counterparty: "Cisco Meraki", department: "IT", scope: "Access point licensing, 8 units",
  },
  "c-ii-006": {
    category: "SaaSSubscription", renewalType: "MonthToMonth", noticePeriodDays: 15, renewalTermMonths: 1, tier: "B",
    billing: "Monthly", recurring: 100, counterparty: "ScalePad", department: "IT", scope: "Lifecycle management",
  },
  "c-ba-007": {
    category: "InsurancePolicy", renewalType: "ExpireUnlessRenewed", tier: "B", needsReview: true,
    billing: "Annual", recurring: 14400, counterparty: "Pelican State Mutual Insurance Company", owner: "Dana Whitfield", department: "Finance", risk: "High",
    policyOrAccountNumber: "GL-0000-SAMPLE", scope: "General liability, $1M per occurrence, $2M aggregate",
    termination: "Insurer may non-renew with 60 days written notice. Insured may cancel at any time.",
    statedDecisionDates: { earliest: addMonths(today, 2), latest: addMonths(today, 4) },
    reviewQuestions: ["Does the declarations page show the same aggregate as the binder?", "Is the broker still the agent of record?"],
    contacts: [
      { role: "ExternalServicer", name: "Taylor Hebert", company: "Sample Insurance Brokers", email: "taylor@broker.example.com", phone: "555-0141" },
      { role: "Support", name: "Claims Line", company: "Pelican State Mutual", email: "claims@pelican.example.com", phone: "555-0142" },
      { role: "Payable", name: "Premium Billing", company: "Pelican State Mutual", email: "premiums@pelican.example.com", phone: "555-0143" },
    ],
    obligations: [
      { description: "Request updated certificate of insurance for landlord", dueDate: addMonths(today, 3), recurrence: "Annual", owner: "Dana Whitfield" },
    ],
    source: {
      system: "SharePoint", container: "Finance", path: "Shared Documents/Insurance/2026",
      itemId: "item-sample-0107", webUrl: "https://sharepoint.example.com/sites/finance/Shared%20Documents/Insurance/2026/gl-policy.pdf",
      hash: "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9",
      extractedAt: "2026-09-30T13:10:00Z", model: "contract-extractor-v2",
    },
  },
  "c-ba-008": {
    category: "Lease", renewalType: "ExpireUnlessRenewed", tier: "C", needsReview: true,
    billing: "Monthly", recurring: 6000, counterparty: "Magnolia Property Group, LLC", owner: "Dana Whitfield", department: "Operations", risk: "Medium",
    scope: "Showroom and service bay, 12,000 sq ft",
    termination: "Tenant must give written notice of intent to renew at least 180 days before term end.",
    noticePeriodDays: 180,
    reviewQuestions: ["The lease text mentions a renewal option. Is it exercisable by notice or by new agreement?", "Where is the signed amendment from last year?"],
  },
};

const buildListItem = (c: BaseContract): ContractListItem => {
  const m = V2_META[c.id];
  if (!m) {
    return { ...c, agreementCategory: null, renewalType: null, latestRenewalDecisionDate: null, earliestRenewalDecisionDate: null, confidenceTier: null, needsReview: true };
  }
  const dates = m.statedDecisionDates ?? computeDecisionDates(c.endDate, m.noticePeriodDays, m.renewalType);
  return {
    ...c,
    // autoRenew is derived from renewalType in schema v2
    autoRenew: m.renewalType === "AutoRenew",
    agreementCategory: m.category,
    renewalType: m.renewalType,
    latestRenewalDecisionDate: dates.latest,
    earliestRenewalDecisionDate: dates.earliest,
    confidenceTier: m.tier,
    needsReview: m.needsReview ?? false,
  };
};

const MOCK_CONTRACTS: ContractListItem[] = BASE_CONTRACTS.map(buildListItem);

const buildContacts = (id: string, seeds: ContactSeed[] | undefined): ContractContactItem[] =>
  (seeds ?? []).map((s) => ({
    id: `ct-${id}-${s.role}`,
    contractId: id,
    role: s.role,
    name: s.name,
    company: s.company,
    title: null,
    email: s.email,
    phone: s.phone,
    portalUrl: null,
    notes: null,
    sourceRef: null,
  }));

const buildObligations = (id: string, items: V2Meta["obligations"]): ContractObligationItem[] =>
  (items ?? []).map((o, i) => ({
    id: `ob-${id}-${i + 1}`,
    contractId: id,
    description: o.description,
    dueDate: o.dueDate,
    recurrence: o.recurrence,
    owner: o.owner,
    status: "Open" as const,
  }));

const TENANT_MAP: Record<string, number> = {
  "aaaaaaaa-1111-2222-3333-444444444444": 1,
  "bbbbbbbb-1111-2222-3333-444444444444": 2,
  "cccccccc-1111-2222-3333-444444444444": 3,
};

export function useMockContracts(tenantId: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<ContractType | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredContracts = useMemo(() => {
    let list = [...MOCK_CONTRACTS];

    // Tenant filter
    if (tenantId !== "all") {
      const tid = TENANT_MAP[tenantId];
      if (tid) list = list.filter((c) => c.tenantId === tid);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.vendorName.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Filters
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (typeFilter) list = list.filter((c) => c.contractType === typeFilter);
    if (vendorFilter) list = list.filter((c) => c.vendorName === vendorFilter);
    if (needsReviewOnly) list = list.filter((c) => c.needsReview);

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "vendor": cmp = a.vendorName.localeCompare(b.vendorName); break;
        case "value": cmp = (a.value ?? 0) - (b.value ?? 0); break;
        case "endDate": cmp = (a.endDate ?? "").localeCompare(b.endDate ?? ""); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "category": cmp = (a.agreementCategory ?? "").localeCompare(b.agreementCategory ?? ""); break;
        case "renewalType": cmp = (a.renewalType ?? "").localeCompare(b.renewalType ?? ""); break;
        case "decisionDate":
          // Contracts with no decision date sort last when ascending.
          cmp = (a.latestRenewalDecisionDate ?? "9999-12-31").localeCompare(b.latestRenewalDecisionDate ?? "9999-12-31");
          break;
        case "tier": cmp = (a.confidenceTier ?? "Z").localeCompare(b.confidenceTier ?? "Z"); break;
        default: cmp = a.title.localeCompare(b.title);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [tenantId, searchQuery, statusFilter, typeFilter, vendorFilter, needsReviewOnly, sortBy, sortDir]);

  const vendors = useMemo(() => {
    const set = new Set(MOCK_CONTRACTS.map((c) => c.vendorName));
    return [...set].sort();
  }, []);

  const getDetail = useCallback((id: string): ContractDetail | null => {
    const c = MOCK_CONTRACTS.find((x) => x.id === id);
    if (!c) return null;
    const m = V2_META[id];
    return {
      ...c,
      description: `${c.vendorName} contract for ${c.title}. Managed by NOIT Group.`,
      slaTerms: c.tags.includes("Critical") ? "99.9% uptime, 4hr response" : null,
      notes: null,
      createdById: null,
      isArchived: false,
      createdAt: c.startDate,
      updatedAt: new Date().toISOString(),
      versions: [
        { id: `v-${id}-1`, versionNumber: 1, summary: "Contract created", changedById: null, changedAt: c.startDate, changeNotes: "Initial creation" },
      ],
      documents: (c.value ?? 0) > 5000 ? [
        { id: `d-${id}-1`, fileName: `${c.vendorName.toLowerCase().replace(/ /g, "-")}-contract-signed.pdf`, fileSize: 245760, contentType: "application/pdf", uploadedById: null, uploadedAt: c.startDate },
      ] : [],
      approvals: c.status === "UnderReview" ? [
        { id: `a-${id}-1`, contractId: id, requestedById: null, approvedById: null, status: "Pending" as const, requestedAt: new Date().toISOString(), resolvedAt: null, comments: "New vendor contract for review" },
      ] : c.status === "Active" ? [
        { id: `a-${id}-1`, contractId: id, requestedById: null, approvedById: null, status: "Approved" as const, requestedAt: c.startDate, resolvedAt: c.startDate, comments: "Approved - competitive pricing confirmed" },
      ] : [],
      renewalAlerts: [],
      tags: c.tags,

      noticePeriodDays: m?.noticePeriodDays ?? null,
      renewalTermMonths: m?.renewalTermMonths ?? null,
      terminationTerms: m?.termination ?? null,
      totalValue: c.value,
      recurringAmount: m?.recurring ?? null,
      billingFrequency: m?.billing ?? null,
      annualizedValue: annualizeValue(m?.recurring, m?.billing, c.value, c.startDate, c.endDate),
      counterpartyName: m?.counterparty ?? c.vendorName,
      clientInternalOwner: m?.owner ?? null,
      department: m?.department ?? null,
      riskClass: m?.risk ?? null,
      policyOrAccountNumber: m?.policyOrAccountNumber ?? null,
      coverageOrScopeSummary: m?.scope ?? null,
      reviewQuestions: m?.reviewQuestions ?? [],
      sourceSystem: m?.source?.system ?? null,
      sourceTenantId: m?.source ? SAMPLE_TENANT_GUID : null,
      sourceContainer: m?.source?.container ?? null,
      sourcePath: m?.source?.path ?? null,
      sourceItemId: m?.source?.itemId ?? null,
      sourceWebUrl: m?.source?.webUrl ?? null,
      sourceFileHash: m?.source?.hash ?? null,
      extractedAt: m?.source?.extractedAt ?? null,
      extractionModel: m?.source?.model ?? null,
      contacts: buildContacts(id, m?.contacts),
      obligations: buildObligations(id, m?.obligations),
    };
  }, []);

  const dashboard = useMemo((): ContractDashboard => {
    let list = MOCK_CONTRACTS;
    if (tenantId !== "all") {
      const tid = TENANT_MAP[tenantId];
      if (tid) list = list.filter((c) => c.tenantId === tid);
    }

    const active = list.filter((c) => c.status === "Active");
    const expiringSoon = list.filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry > 0 && c.daysUntilExpiry <= 30);

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const c of list) {
      byType[c.contractType] = (byType[c.contractType] || 0) + 1;
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }

    const upcomingRenewals: RenewalAlertItem[] = list
      .filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry > 0 && c.daysUntilExpiry <= 90)
      .sort((a, b) => (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999))
      .map((c) => ({
        id: `ra-${c.id}`,
        contractId: c.id,
        contractTitle: c.title,
        vendorName: c.vendorName,
        tenantDisplayName: c.tenantDisplayName,
        alertDate: todayStr,
        contractEndDate: c.endDate,
        alertType: (c.daysUntilExpiry ?? 999) <= 30 ? "ThirtyDay" as const : (c.daysUntilExpiry ?? 999) <= 60 ? "SixtyDay" as const : "NinetyDay" as const,
        isSent: false,
        daysRemaining: c.daysUntilExpiry,
      }));

    return {
      totalContracts: list.length,
      activeContracts: active.length,
      expiringSoon: expiringSoon.length,
      totalValue: list.reduce((sum, c) => sum + (c.value ?? 0), 0),
      byType,
      byStatus,
      recentContracts: list.slice(0, 5),
      upcomingRenewals,
    };
  }, [tenantId]);

  return {
    contracts: filteredContracts,
    totalCount: filteredContracts.length,
    allContracts: MOCK_CONTRACTS,
    tags: MOCK_TAGS,
    vendors,
    dashboard,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    vendorFilter,
    setVendorFilter,
    needsReviewOnly,
    setNeedsReviewOnly,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    getDetail,
  };
}
