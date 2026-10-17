/**
 * KreweReview API client. Records come back as stored; this module adds the
 * derived fields the pages show (days until expiry, decision dates when the
 * document didn't state them, annualized value).
 */

import { apiSend } from "./graphService";
import { annualizeValue, computeDecisionDates } from "../apps/contracts/contractUtils";
import type {
  AgreementCategory,
  BillingFrequency,
  ConfidenceTier,
  ContractContactItem,
  ContractDetail,
  ContractDocumentItem,
  ContractObligationItem,
  ContractStatus,
  ContractVersionItem,
  RenewalType,
  RiskClass,
} from "../shared/types";

/** A contract as the API stores it. */
export interface ContractRecord {
  id: string;
  tenantId: string;
  tenantDisplayName: string;
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
  renewalType: RenewalType | null;
  noticePeriodDays: number | null;
  renewalTermMonths: number | null;
  earliestRenewalDecisionDate: string | null;
  latestRenewalDecisionDate: string | null;
  totalValue: number | null;
  recurringAmount: number | null;
  billingFrequency: BillingFrequency | null;
  currency: string;
  description: string | null;
  slaTerms: string | null;
  notes: string | null;
  terminationTerms: string | null;
  clientInternalOwner: string | null;
  riskClass: RiskClass | null;
  policyOrAccountNumber: string | null;
  coverageOrScopeSummary: string | null;
  reviewQuestions: string[];
  tags: string[];
  confidenceTier: ConfidenceTier | null;
  needsReview: boolean;
  contacts: Omit<ContractContactItem, "contractId">[];
  obligations: Omit<ContractObligationItem, "contractId">[];
  documents: ContractDocumentItem[];
  versions: ContractVersionItem[];
  extractedAt: string | null;
  extractionModel: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedById: string | null;
  updatedAt: string;
}

/** The editable part of a record, as the form sends it. */
export type ContractInput = Pick<
  ContractRecord,
  | "title" | "vendorName" | "counterpartyName" | "agreementCategory" | "location" | "department" | "status"
  | "startDate" | "endDate" | "renewalDate" | "renewalType" | "noticePeriodDays" | "renewalTermMonths"
  | "earliestRenewalDecisionDate" | "latestRenewalDecisionDate" | "totalValue" | "recurringAmount"
  | "billingFrequency" | "description" | "slaTerms" | "notes" | "terminationTerms" | "clientInternalOwner"
  | "riskClass" | "policyOrAccountNumber" | "coverageOrScopeSummary" | "reviewQuestions" | "tags"
  | "confidenceTier" | "needsReview" | "contacts" | "obligations"
>;

export interface Picklist {
  tenantId: string;
  tenantDisplayName: string;
  locations: string[];
  departments: string[];
  locationSource: "entra" | "list";
  departmentSource: "entra" | "list";
  warning: string | null;
}

export interface UploadedFile {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface Extraction {
  fields: Partial<ContractInput> & { isExecutedAgreement?: boolean };
  model: string;
  extractedAt: string;
}

const enc = encodeURIComponent;
const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const end = Date.parse(date + "T00:00:00");
  if (Number.isNaN(end)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today.getTime()) / 86_400_000);
}

export function toDetail(r: ContractRecord): ContractDetail {
  const computed = computeDecisionDates(r.endDate ?? "", r.noticePeriodDays, r.renewalType ?? "Unknown");
  return {
    ...r,
    startDate: r.startDate ?? "",
    endDate: r.endDate ?? "",
    autoRenew: r.renewalType === "AutoRenew",
    value: r.totalValue,
    daysUntilExpiry: daysUntil(r.endDate),
    earliestRenewalDecisionDate: r.earliestRenewalDecisionDate ?? computed.earliest,
    latestRenewalDecisionDate: r.latestRenewalDecisionDate ?? computed.latest,
    annualizedValue: annualizeValue(r.recurringAmount, r.billingFrequency, r.totalValue, r.startDate ?? "", r.endDate ?? ""),
    contacts: r.contacts.map((c) => ({ ...c, contractId: r.id })),
    obligations: r.obligations.map((o) => ({ ...o, contractId: r.id })),
    approvals: [],
    renewalAlerts: [],
    sourceSystem: null,
    sourceTenantId: null,
    sourceContainer: null,
    sourcePath: null,
    sourceItemId: null,
    sourceWebUrl: null,
    sourceFileHash: null,
  };
}

export async function listContracts(tenantId: string, includeArchived = false): Promise<ContractDetail[]> {
  const res = await apiSend(`/tenants/${enc(tenantId)}/contracts${includeArchived ? "?includeArchived=true" : ""}`);
  const body = (await res.json()) as { contracts: ContractRecord[] };
  return body.contracts.map(toDetail);
}

export async function getContract(tenantId: string, id: string): Promise<{ contract: ContractDetail; etag: string }> {
  const res = await apiSend(`/tenants/${enc(tenantId)}/contracts/${enc(id)}`);
  const body = (await res.json()) as { contract: ContractRecord; etag: string };
  return { contract: toDetail(body.contract), etag: body.etag };
}

type SaveExtras = { fileId?: string; extractedAt?: string; extractionModel?: string };

async function saved(res: Response): Promise<{ contract: ContractDetail; etag: string }> {
  const body = (await res.json()) as { contract: ContractRecord; etag: string };
  return { contract: toDetail(body.contract), etag: body.etag };
}

export async function createContract(tenantId: string, input: ContractInput, extras: SaveExtras = {}) {
  return saved(await apiSend(`/tenants/${enc(tenantId)}/contracts`, { method: "POST", ...json({ ...input, ...extras }) }));
}

export async function updateContract(tenantId: string, id: string, input: ContractInput, etag: string) {
  return saved(
    await apiSend(`/tenants/${enc(tenantId)}/contracts/${enc(id)}`, { method: "PATCH", ...json({ ...input, etag }) })
  );
}

export async function renewContract(tenantId: string, id: string, input: ContractInput, etag: string, extras: SaveExtras) {
  return saved(
    await apiSend(`/tenants/${enc(tenantId)}/contracts/${enc(id)}/renew`, {
      method: "POST",
      ...json({ ...input, ...extras, etag }),
    })
  );
}

export async function setArchived(tenantId: string, id: string, archived: boolean) {
  return saved(
    await apiSend(`/tenants/${enc(tenantId)}/contracts/${enc(id)}/archive`, { method: "POST", ...json({ archived }) })
  );
}

export async function deleteContractPermanently(tenantId: string, id: string): Promise<void> {
  await apiSend(`/tenants/${enc(tenantId)}/contracts/${enc(id)}?confirm=${enc(id)}`, { method: "DELETE" });
}

export async function uploadContractFile(tenantId: string, file: File): Promise<UploadedFile> {
  const res = await apiSend(`/tenants/${enc(tenantId)}/contract-files`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": enc(file.name) },
  });
  return ((await res.json()) as { file: UploadedFile }).file;
}

export async function extractContractFile(tenantId: string, fileId: string, renewalOf?: string): Promise<Extraction> {
  const res = await apiSend(`/tenants/${enc(tenantId)}/contract-files/${enc(fileId)}/extract`, {
    method: "POST",
    ...json(renewalOf ? { renewalOf } : {}),
  });
  return (await res.json()) as Extraction;
}

export async function downloadContractDocument(tenantId: string, contractId: string, doc: ContractDocumentItem): Promise<void> {
  const res = await apiSend(`/tenants/${enc(tenantId)}/contracts/${enc(contractId)}/documents/${enc(doc.id)}`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function getPicklist(tenantId: string): Promise<Picklist> {
  const res = await apiSend(`/tenants/${enc(tenantId)}/contract-picklist`);
  return (await res.json()) as Picklist;
}

export async function savePicklist(
  tenantId: string,
  locations: { source: "entra" | "list"; values: string[] },
  departments: { source: "entra" | "list"; values: string[] }
): Promise<Picklist> {
  const res = await apiSend(`/tenants/${enc(tenantId)}/contract-picklist`, {
    method: "PUT",
    ...json({ locations, departments }),
  });
  return (await res.json()) as Picklist;
}
