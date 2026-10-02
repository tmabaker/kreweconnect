// ─── Employee Directory (KreweConnect) ────────────────────────────
//
// NOTE: This file was reconstructed from usage after source recovery
// (the original was not embedded in the build's source maps). Shapes
// are derived from the mock data in useMockEmployees/useMockContracts
// and the Graph converters in useGraphEmployees.

export interface EmployeeRef {
  id: string;
  displayName: string;
  jobTitle: string | null;
  photo: string | null;
}

export interface EmployeeListItem {
  id: string;
  displayName: string;
  givenName: string | null;
  surname: string | null;
  email: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  mobilePhone: string | null;
  businessPhone: string | null;
  photo: string | null;
  isActive: boolean;
  /** Graph companyName — per-employee company/location (e.g. a dealership) */
  companyName?: string | null;
  /** Work anniversary (ISO); only month/day shown. Null/absent when unset in Entra */
  hireDate?: string | null;
  /** Birthday (ISO); only month/day shown. Null/absent when unset in Entra */
  birthday?: string | null;
  tenantDisplayName: string | null;
  /** Source tenant GUID — set in the aggregated "all clients" view */
  tenantId?: string | null;
}

export interface CustomFieldValue {
  id: string;
  fieldName: string;
  fieldValue: string | null;
}

export interface EmployeeDetail extends EmployeeListItem {
  employeeId: string | null;
  hireDate: string | null;
  lastSyncedAt: string | null;
  manager: EmployeeRef | null;
  directReports: EmployeeRef[];
  customFields: CustomFieldValue[];
}

export interface OrgChartNode {
  id: string;
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  photo: string | null;
  directReports: OrgChartNode[];
}

export interface EmployeeFacets {
  departments: string[];
  offices: string[];
  titles: string[];
  /** Distinct company/tenant names — populated in the MSP "all tenants" view */
  companies: string[];
}

export interface CustomFieldDefinition {
  id: string;
  tenantId: string | null;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  displayOrder: number;
  /** JSON-encoded string array when fieldType === "Select", e.g. '["S","M","L"]' */
  selectOptions: string | null;
}

// ─── Contract Lifecycle Management (KreweReview) ──────────────────

export type ContractType =
  | "Software"
  | "Hardware"
  | "Service"
  | "Lease"
  | "Subscription"
  | "Consulting"
  | "Other";

export type ContractStatus =
  | "Draft"
  | "Active"
  | "UnderReview"
  | "PendingRenewalDecision"
  | "Expired"
  | "Terminated"
  | "Renewed"
  | "Unknown";

/** Primary classifier. `contractType` is kept for compatibility and maps onto this. */
export type AgreementCategory =
  | "VendorService"
  | "MasterServices"
  | "StatementOfWork"
  | "SoftwareLicense"
  | "SaaSSubscription"
  | "InsurancePolicy"
  | "CertificateOfInsurance"
  | "Lease"
  | "Maintenance"
  | "Warranty"
  | "ProfessionalServices"
  | "Membership"
  | "Certification"
  | "Telecom"
  | "Utility"
  | "Financing"
  | "FranchiseOrDealer"
  | "PayerContract"
  | "Confidentiality"
  | "Other";

export type RenewalType =
  | "MonthToMonth"
  | "AutoRenew"
  | "ExpireUnlessRenewed"
  | "Evergreen"
  | "FixedTermNoRenewal"
  | "Unknown";

export type BillingFrequency =
  | "Monthly"
  | "Quarterly"
  | "SemiAnnual"
  | "Annual"
  | "OneTime"
  | "Usage"
  | "Unknown";

export type RiskClass = "Low" | "Medium" | "High" | "Critical";

/** A = verified from the executed document, B = partly inferred, C = evidence only. */
export type ConfidenceTier = "A" | "B" | "C";

export type SourceSystem =
  | "SharePoint"
  | "OneDrive"
  | "Mail"
  | "FileServer"
  | "Egnyte"
  | "AccountingExport"
  | "VendorPortal"
  | "Manual"
  | "M365Licensing"
  | "EntraApps";

export type ContactRole =
  | "ExternalServicer"
  | "Support"
  | "Payable"
  | "InternalOwner"
  | "Broker"
  | "Other";

export interface ContractContactItem {
  id: string;
  contractId: string;
  role: ContactRole;
  name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  portalUrl: string | null;
  notes: string | null;
  /** Where the contact was found (document, page, email thread). */
  sourceRef: string | null;
}

export type ObligationStatus = "Open" | "Done" | "Waived";

export interface ContractObligationItem {
  id: string;
  contractId: string;
  description: string;
  dueDate: string | null;
  recurrence: string | null;
  owner: string | null;
  status: ObligationStatus;
}

export interface TagItem {
  id: string;
  name: string;
  color: string;
}

export interface ContractListItem {
  id: string;
  tenantId: number;
  tenantDisplayName: string;
  vendorName: string;
  contractType: ContractType;
  title: string;
  startDate: string;
  endDate: string;
  renewalDate: string | null;
  autoRenew: boolean;
  value: number | null;
  currency: string;
  status: ContractStatus;
  daysUntilExpiry: number | null;
  tags: string[];
  agreementCategory: AgreementCategory | null;
  renewalType: RenewalType | null;
  latestRenewalDecisionDate: string | null;
  earliestRenewalDecisionDate: string | null;
  confidenceTier: ConfidenceTier | null;
  needsReview: boolean;
}

export interface ContractVersionItem {
  id: string;
  versionNumber: number;
  summary: string | null;
  changedById: string | null;
  changedAt: string;
  changeNotes: string | null;
}

export interface ContractDocumentItem {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedById: string | null;
  uploadedAt: string;
}

export type ApprovalStatus = "Pending" | "Approved" | "Rejected";

export interface ContractApprovalItem {
  id: string;
  contractId: string;
  requestedById: string | null;
  approvedById: string | null;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt: string | null;
  comments: string | null;
}

export type RenewalAlertType =
  | "ThirtyDay"
  | "SixtyDay"
  | "NinetyDay"
  | "DecisionDeadline"
  | "DecisionWindowOpens";

export interface RenewalAlertItem {
  id: string;
  contractId: string;
  contractTitle: string;
  vendorName: string;
  tenantDisplayName: string;
  alertDate: string;
  contractEndDate: string;
  alertType: RenewalAlertType;
  isSent: boolean;
  daysRemaining: number | null;
}

export interface ContractDetail extends ContractListItem {
  description: string | null;
  slaTerms: string | null;
  notes: string | null;
  createdById: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  versions: ContractVersionItem[];
  documents: ContractDocumentItem[];
  approvals: ContractApprovalItem[];
  renewalAlerts: RenewalAlertItem[];

  // Renewal terms
  noticePeriodDays: number | null;
  renewalTermMonths: number | null;
  terminationTerms: string | null;

  // Financial
  totalValue: number | null;
  recurringAmount: number | null;
  billingFrequency: BillingFrequency | null;
  /** Read only. recurringAmount x frequency, else totalValue / term years. */
  annualizedValue: number | null;

  // Parties and classification
  /** The other party as written on the paper (may differ from the vendor brand). */
  counterpartyName: string | null;
  clientInternalOwner: string | null;
  department: string | null;
  riskClass: RiskClass | null;
  policyOrAccountNumber: string | null;
  coverageOrScopeSummary: string | null;
  /** Questions for the client point of contact. */
  reviewQuestions: string[];

  // Provenance
  sourceSystem: SourceSystem | null;
  sourceTenantId: string | null;
  sourceContainer: string | null;
  sourcePath: string | null;
  sourceItemId: string | null;
  sourceWebUrl: string | null;
  sourceFileHash: string | null;
  extractedAt: string | null;
  extractionModel: string | null;

  contacts: ContractContactItem[];
  obligations: ContractObligationItem[];
}

export interface ContractDashboard {
  totalContracts: number;
  activeContracts: number;
  expiringSoon: number;
  totalValue: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  recentContracts: ContractListItem[];
  upcomingRenewals: RenewalAlertItem[];
}
