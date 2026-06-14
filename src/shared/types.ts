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
  | "Expired"
  | "Terminated"
  | "Renewed";

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

export type RenewalAlertType = "ThirtyDay" | "SixtyDay" | "NinetyDay";

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
