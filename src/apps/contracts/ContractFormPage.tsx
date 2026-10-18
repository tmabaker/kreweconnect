import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  Input,
  Button,
  Dropdown,
  Option,
  Switch,
  Textarea,
  Label,
  Divider,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  ArrowUpload24Regular,
  Save24Regular,
  Sparkle24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { isDemoMode } from "../../shared/auth/demoMode";
import { getMockDetail } from "../../shared/mockContracts";
import { getAvailableTenants, type TenantInfo } from "../../services/tenantService";
import { isGraphError } from "../../services/graphService";
import {
  createContract,
  extractContractFile,
  getContract,
  getPicklist,
  renewContract,
  updateContract,
  uploadContractFile,
  type ContractInput,
  type Extraction,
  type Picklist,
  type UploadedFile,
} from "../../services/contractService";
import {
  AGREEMENT_CATEGORIES,
  RENEWAL_TYPES,
  BILLING_FREQUENCIES,
  CONTRACT_STATUSES,
  CONTRACT_TAGS,
  getCategoryLabel,
  getRenewalTypeLabel,
  getBillingFrequencyLabel,
  getContactRoleLabel,
  getStatusLabel,
  computeDecisionDates,
  annualizeValue,
  formatCurrency,
  contractPath,
} from "./contractUtils";
import type {
  AgreementCategory,
  BillingFrequency,
  ConfidenceTier,
  ContactRole,
  ContractDetail,
  ContractStatus,
  RenewalType,
} from "../../shared/types";

/** The three contact roles shown on the form. Other roles (broker, internal owner) are kept as they are. */
const FORM_CONTACT_ROLES: ContactRole[] = ["ExternalServicer", "Support", "Payable"];

const ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.txt";

const TIER_LABELS: Record<ConfidenceTier, string> = {
  A: "A · Verified from the signed agreement",
  B: "B · Partly inferred",
  C: "C · Evidence only (invoice, notice, email)",
};

interface ContactFormRow {
  name: string;
  company: string;
  email: string;
  phone: string;
}

interface FormState {
  title: string;
  vendorName: string;
  counterpartyName: string;
  agreementCategory: AgreementCategory | "";
  location: string;
  department: string;
  status: ContractStatus;
  description: string;
  startDate: string;
  endDate: string;
  renewalDate: string;
  renewalType: RenewalType;
  renewalTermMonths: string;
  noticePeriodDays: string;
  earliestDecision: string;
  latestDecision: string;
  totalValue: string;
  billingFrequency: BillingFrequency;
  recurringAmount: string;
  slaTerms: string;
  terminationTerms: string;
  policyOrAccountNumber: string;
  coverageOrScopeSummary: string;
  notes: string;
  tags: string[];
  confidenceTier: ConfidenceTier | "";
  needsReview: boolean;
  reviewQuestions: string;
  contacts: Record<string, ContactFormRow>;
}

const emptyContact = (): ContactFormRow => ({ name: "", company: "", email: "", phone: "" });
const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function stateFrom(c: ContractDetail | null): FormState {
  const contacts: Record<string, ContactFormRow> = {};
  for (const role of FORM_CONTACT_ROLES) {
    const x = c?.contacts.find((k) => k.role === role);
    contacts[role] = x ? { name: s(x.name), company: s(x.company), email: s(x.email), phone: s(x.phone) } : emptyContact();
  }
  return {
    title: s(c?.title),
    vendorName: s(c?.vendorName),
    counterpartyName: s(c?.counterpartyName),
    agreementCategory: c?.agreementCategory ?? "",
    location: s(c?.location),
    department: s(c?.department),
    status: c?.status ?? "Draft",
    description: s(c?.description),
    startDate: s(c?.startDate),
    endDate: s(c?.endDate),
    renewalDate: s(c?.renewalDate),
    renewalType: c?.renewalType ?? "Unknown",
    renewalTermMonths: s(c?.renewalTermMonths),
    noticePeriodDays: s(c?.noticePeriodDays),
    earliestDecision: s(c?.earliestRenewalDecisionDate),
    latestDecision: s(c?.latestRenewalDecisionDate),
    totalValue: s(c?.totalValue ?? c?.value),
    billingFrequency: c?.billingFrequency ?? "Unknown",
    recurringAmount: s(c?.recurringAmount),
    slaTerms: s(c?.slaTerms),
    terminationTerms: s(c?.terminationTerms),
    policyOrAccountNumber: s(c?.policyOrAccountNumber),
    coverageOrScopeSummary: s(c?.coverageOrScopeSummary),
    notes: s(c?.notes),
    tags: c?.tags ?? [],
    confidenceTier: c?.confidenceTier ?? "",
    needsReview: c?.needsReview ?? false,
    reviewQuestions: (c?.reviewQuestions ?? []).join("\n"),
    contacts,
  };
}

/** Merge an extraction into the form. Only fields the document supported are overwritten. */
function applyExtraction(prev: FormState, f: Extraction["fields"], picklist: Picklist | null): FormState {
  const next = { ...prev, contacts: { ...prev.contacts } };
  const setStr = (key: keyof FormState, v: unknown) => {
    if (typeof v === "string" && v.trim()) (next as unknown as Record<string, unknown>)[key] = v.trim();
    if (typeof v === "number") (next as unknown as Record<string, unknown>)[key] = String(v);
  };
  setStr("title", f.title);
  setStr("vendorName", f.vendorName);
  setStr("counterpartyName", f.counterpartyName);
  if (f.agreementCategory && AGREEMENT_CATEGORIES.includes(f.agreementCategory)) next.agreementCategory = f.agreementCategory;
  if (f.location && picklist?.locations.includes(f.location)) next.location = f.location;
  if (f.department && picklist?.departments.includes(f.department)) next.department = f.department;
  if (f.status && (CONTRACT_STATUSES as readonly string[]).includes(f.status)) next.status = f.status;
  setStr("description", f.description);
  setStr("startDate", f.startDate);
  setStr("endDate", f.endDate);
  setStr("renewalDate", f.renewalDate);
  if (f.renewalType) next.renewalType = f.renewalType;
  setStr("renewalTermMonths", f.renewalTermMonths);
  setStr("noticePeriodDays", f.noticePeriodDays);
  setStr("earliestDecision", f.earliestRenewalDecisionDate);
  setStr("latestDecision", f.latestRenewalDecisionDate);
  setStr("totalValue", f.totalValue);
  if (f.billingFrequency) next.billingFrequency = f.billingFrequency;
  setStr("recurringAmount", f.recurringAmount);
  setStr("slaTerms", f.slaTerms);
  setStr("terminationTerms", f.terminationTerms);
  setStr("policyOrAccountNumber", f.policyOrAccountNumber);
  setStr("coverageOrScopeSummary", f.coverageOrScopeSummary);
  if (Array.isArray(f.tags)) next.tags = f.tags.filter((t) => CONTRACT_TAGS.some((x) => x.name === t));
  if (f.confidenceTier) next.confidenceTier = f.confidenceTier;
  if (typeof f.needsReview === "boolean") next.needsReview = f.needsReview;
  if (Array.isArray(f.reviewQuestions)) next.reviewQuestions = f.reviewQuestions.join("\n");
  for (const c of f.contacts ?? []) {
    if (!FORM_CONTACT_ROLES.includes(c.role)) continue;
    next.contacts[c.role] = { name: s(c.name), company: s(c.company), email: s(c.email), phone: s(c.phone) };
  }
  return next;
}

function toInput(f: FormState, existing: ContractDetail | null): ContractInput {
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  const t = (v: string) => (v.trim() === "" ? null : v.trim());
  const formContacts = FORM_CONTACT_ROLES.flatMap((role) => {
    const row = f.contacts[role];
    if (!row.name && !row.company && !row.email && !row.phone) return [];
    const prior = existing?.contacts.find((c) => c.role === role);
    return [{
      id: prior?.id ?? crypto.randomUUID(),
      role,
      name: t(row.name), company: t(row.company), email: t(row.email), phone: t(row.phone),
      title: prior?.title ?? null, portalUrl: prior?.portalUrl ?? null, notes: prior?.notes ?? null, sourceRef: prior?.sourceRef ?? null,
    }];
  });
  const otherContacts = (existing?.contacts ?? [])
    .filter((c) => !FORM_CONTACT_ROLES.includes(c.role))
    .map(({ contractId: _c, ...rest }) => rest);
  return {
    title: f.title.trim(),
    vendorName: f.vendorName.trim(),
    counterpartyName: t(f.counterpartyName),
    agreementCategory: f.agreementCategory as AgreementCategory,
    location: t(f.location),
    department: t(f.department),
    status: f.status,
    startDate: t(f.startDate),
    endDate: t(f.endDate),
    renewalDate: t(f.renewalDate),
    renewalType: f.renewalType,
    noticePeriodDays: n(f.noticePeriodDays),
    renewalTermMonths: n(f.renewalTermMonths),
    earliestRenewalDecisionDate: t(f.earliestDecision),
    latestRenewalDecisionDate: t(f.latestDecision),
    totalValue: n(f.totalValue),
    recurringAmount: n(f.recurringAmount),
    billingFrequency: f.billingFrequency,
    description: t(f.description),
    slaTerms: t(f.slaTerms),
    notes: t(f.notes),
    terminationTerms: t(f.terminationTerms),
    clientInternalOwner: existing?.clientInternalOwner ?? null,
    riskClass: existing?.riskClass ?? null,
    policyOrAccountNumber: t(f.policyOrAccountNumber),
    coverageOrScopeSummary: t(f.coverageOrScopeSummary),
    reviewQuestions: f.reviewQuestions.split("\n").map((q) => q.trim()).filter(Boolean),
    tags: f.tags,
    confidenceTier: f.confidenceTier || null,
    needsReview: f.needsReview,
    contacts: [...formContacts, ...otherContacts],
    obligations: (existing?.obligations ?? []).map(({ contractId: _c, ...rest }) => rest),
  };
}

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "24px", maxWidth: "860px" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  form: { display: "flex", flexDirection: "column", gap: "24px" },
  section: { padding: "20px", display: "flex", flexDirection: "column", gap: "16px" },
  fieldRow: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
    "@media (max-width: 640px)": { gridTemplateColumns: "1fr" },
  },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  label: { fontWeight: "600" as const, fontSize: "13px" },
  actions: { display: "flex", gap: "12px", justifyContent: "flex-end", flexWrap: "wrap" },
  tagsRow: { display: "flex", flexWrap: "wrap", gap: "8px" },
  contactBlock: { display: "flex", flexDirection: "column", gap: "8px" },
  hint: { fontSize: "12px", color: tokens.colorNeutralForeground3 },
  dropZone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: "28px",
    textAlign: "center" as const,
    cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
  },
  dropActive: { border: `2px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
});

type UploadState =
  | { step: "idle" }
  | { step: "uploading"; name: string }
  | { step: "reading"; file: UploadedFile }
  | { step: "done"; file: UploadedFile; extraction: Extraction | null; note: string | null };

export function ContractFormPage({ mode }: { mode: "new" | "edit" | "renew" }) {
  const styles = useStyles();
  const navigate = useNavigate();
  const params = useParams<{ tenantId: string; id: string }>();
  const { selectedTenant } = useTenantContext();

  const [tenantId, setTenantId] = useState<string>(
    mode === "new" ? (selectedTenant.tenantId === "all" ? "" : selectedTenant.tenantId) : params.tenantId ?? ""
  );
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [existing, setExisting] = useState<ContractDetail | null>(null);
  const [etag, setEtag] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode !== "new");
  const [picklist, setPicklist] = useState<Picklist | null>(null);
  const [form, setForm] = useState<FormState>(() => stateFrom(null));
  const [upload, setUpload] = useState<UploadState>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Tenant choices for a new agreement started from "All Tenants".
  useEffect(() => {
    if (mode !== "new" || selectedTenant.tenantId !== "all") return;
    getAvailableTenants().then(setTenants).catch(() => setTenants([]));
  }, [mode, selectedTenant.tenantId]);

  // Existing agreement for edit / renew.
  useEffect(() => {
    if (mode === "new" || !params.id || !params.tenantId) return;
    if (isDemoMode) {
      const c = getMockDetail(params.id);
      setExisting(c);
      setForm(stateFrom(c));
      setLoading(false);
      return;
    }
    let cancelled = false;
    getContract(params.tenantId, params.id)
      .then(({ contract, etag }) => {
        if (cancelled) return;
        setExisting(contract);
        setEtag(etag);
        setForm(stateFrom(contract));
      })
      .catch((err) => !cancelled && setLoadError(isGraphError(err) ? err.message : "Could not load this agreement."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, params.id, params.tenantId]);

  // The tenant's location and department lists.
  useEffect(() => {
    setPicklist(null);
    if (!tenantId || isDemoMode) return;
    let cancelled = false;
    getPicklist(tenantId)
      .then((p) => !cancelled && setPicklist(p))
      .catch(() => !cancelled && setPicklist({
        tenantId, tenantDisplayName: "", locations: [], departments: [],
        locationSource: "list", departmentSource: "list",
        warning: "Could not load this tenant's location and department lists.",
      }));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const handleFile = async (file: File) => {
    if (!tenantId) {
      setSaveError("Choose the tenant before uploading.");
      return;
    }
    setSaveError(null);
    setUpload({ step: "uploading", name: file.name });
    let uploaded: UploadedFile;
    try {
      uploaded = await uploadContractFile(tenantId, file);
    } catch (err) {
      setUpload({ step: "idle" });
      setSaveError(isGraphError(err) ? err.message : "The upload failed. Please try again.");
      return;
    }
    setUpload({ step: "reading", file: uploaded });
    try {
      const extraction = await extractContractFile(tenantId, uploaded.id, mode === "renew" ? existing?.id : undefined);
      setForm((f) => applyExtraction(f, extraction.fields, picklist));
      const note = extraction.fields.isExecutedAgreement === false
        ? "This document does not look like a signed agreement. Check the status and tier."
        : null;
      setUpload({ step: "done", file: uploaded, extraction, note });
    } catch (err) {
      setUpload({
        step: "done",
        file: uploaded,
        extraction: null,
        note: isGraphError(err) ? err.message : "The document could not be read automatically. Enter the details by hand.",
      });
    }
  };

  const computeDates = () => {
    const notice = form.noticePeriodDays === "" ? null : Number(form.noticePeriodDays);
    const { earliest, latest } = computeDecisionDates(form.endDate, notice, form.renewalType);
    setForm((f) => ({ ...f, earliestDecision: earliest ?? "", latestDecision: latest ?? "" }));
  };

  const annualized = annualizeValue(
    form.recurringAmount === "" ? null : Number(form.recurringAmount),
    form.billingFrequency,
    form.totalValue === "" ? null : Number(form.totalValue),
    form.startDate,
    form.endDate,
  );

  const uploadedFile = upload.step === "done" ? upload.file : null;
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!tenantId) m.push("tenant");
    if (!form.title.trim()) m.push("title");
    if (!form.vendorName.trim()) m.push("vendor");
    if (!form.agreementCategory) m.push("category");
    if (picklist && picklist.locations.length > 0 && !form.location) m.push("location");
    if (picklist && picklist.departments.length > 0 && !form.department) m.push("department");
    if (mode === "renew" && !uploadedFile) m.push("the renewed agreement upload");
    return m;
  }, [tenantId, form, picklist, mode, uploadedFile]);

  const busy = upload.step === "uploading" || upload.step === "reading";
  const canSave = !isDemoMode && !saving && !busy && missing.length === 0 && !!picklist && !picklist.warning;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const input = toInput(form, existing);
    const extras = uploadedFile
      ? {
          fileId: uploadedFile.id,
          extractedAt: upload.step === "done" ? upload.extraction?.extractedAt : undefined,
          extractionModel: upload.step === "done" ? upload.extraction?.model : undefined,
        }
      : {};
    try {
      const result =
        mode === "new"
          ? await createContract(tenantId, input, extras)
          : mode === "renew"
            ? await renewContract(tenantId, existing!.id, input, etag, extras)
            : await updateContract(tenantId, existing!.id, input, etag);
      navigate(contractPath(result.contract.tenantId, result.contract.id));
    } catch (err) {
      setSaveError(isGraphError(err) ? err.message : "Saving failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading agreement…" />;
  if (loadError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{loadError}</MessageBarBody>
      </MessageBar>
    );
  }

  const heading = mode === "new" ? "New Agreement" : mode === "renew" ? `Renew: ${existing?.title ?? ""}` : "Edit Agreement";

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate(-1)} aria-label="Back" />
          <Title2>{heading}</Title2>
        </div>
      </div>

      {isDemoMode && (
        <MessageBar intent="info">
          <MessageBarBody>Demo mode shows sample data. Saving is turned off.</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.form}>
        {/* Tenant */}
        {mode === "new" && selectedTenant.tenantId === "all" && (
          <Card className={styles.section}>
            <div className={styles.field}>
              <Label className={styles.label} required>Tenant</Label>
              <Dropdown
                placeholder="Choose the client"
                value={tenants.find((t) => t.tenantId === tenantId)?.displayName ?? ""}
                selectedOptions={tenantId ? [tenantId] : []}
                onOptionSelect={(_, d) => {
                  setTenantId(d.optionValue ?? "");
                  setForm((f) => ({ ...f, location: "", department: "" }));
                }}
                disabled={upload.step !== "idle"}
              >
                {tenants.map((t) => <Option key={t.tenantId} value={t.tenantId}>{t.displayName}</Option>)}
              </Dropdown>
            </div>
          </Card>
        )}

        {/* Upload */}
        {mode !== "edit" && (
          <Card className={styles.section}>
            <Text weight="semibold" size={400}>
              {mode === "renew" ? "Upload the renewed agreement" : "Upload the agreement"}
            </Text>
            <Text className={styles.hint}>
              The document is read automatically and the fields below are filled in for you to review.
              PDF, Word (.docx), or an image, up to 25 MB.
            </Text>
            {upload.step === "idle" && (
              <div
                className={`${styles.dropZone} ${dragging ? styles.dropActive : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
              >
                <ArrowUpload24Regular style={{ fontSize: "32px" }} />
                <Text>Drop the file here or click to choose</Text>
                {!tenantId && <Text className={styles.hint}>Choose the tenant first.</Text>}
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleFile(f);
              }}
            />
            {upload.step === "uploading" && <Spinner size="small" label={`Uploading ${upload.name}…`} />}
            {upload.step === "reading" && <Spinner size="small" label="Reading the document. This can take up to 40 seconds." />}
            {upload.step === "done" && (
              <MessageBar intent={upload.extraction ? (upload.note ? "warning" : "success") : "warning"}>
                <MessageBarBody>
                  <MessageBarTitle>{upload.file.fileName}</MessageBarTitle>
                  {upload.extraction
                    ? "Filled in from the document. Review every field before saving."
                    : upload.note}
                  {upload.extraction && upload.note ? ` ${upload.note}` : ""}
                </MessageBarBody>
              </MessageBar>
            )}
            {upload.step === "done" && (
              <div>
                <Button appearance="subtle" size="small" onClick={() => setUpload({ step: "idle" })}>
                  Use a different file
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Details */}
        <Card className={styles.section}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Text weight="semibold" size={400}>Agreement Details</Text>
            {upload.step === "done" && upload.extraction && (
              <Badge appearance="tint" color="brand" icon={<Sparkle24Regular />}>Filled from document</Badge>
            )}
          </div>
          <div className={styles.field}>
            <Label className={styles.label} required>Title</Label>
            <Input value={form.title} onChange={(_, d) => set("title", d.value)} placeholder="e.g., Microsoft 365 Business Premium" />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label} required>Vendor</Label>
              <Input value={form.vendorName} onChange={(_, d) => set("vendorName", d.value)} placeholder="Company the agreement is with" />
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Counterparty (as written on the paper)</Label>
              <Input value={form.counterpartyName} onChange={(_, d) => set("counterpartyName", d.value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label} required>Category</Label>
              <Dropdown
                placeholder="Choose a category"
                value={form.agreementCategory ? getCategoryLabel(form.agreementCategory) : ""}
                selectedOptions={form.agreementCategory ? [form.agreementCategory] : []}
                onOptionSelect={(_, d) => set("agreementCategory", (d.optionValue ?? "") as AgreementCategory)}
              >
                {AGREEMENT_CATEGORIES.map((c) => <Option key={c} value={c}>{getCategoryLabel(c)}</Option>)}
              </Dropdown>
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Status</Label>
              <Dropdown
                value={getStatusLabel(form.status)}
                selectedOptions={[form.status]}
                onOptionSelect={(_, d) => set("status", (d.optionValue ?? "Draft") as ContractStatus)}
              >
                {CONTRACT_STATUSES.map((st) => <Option key={st} value={st}>{getStatusLabel(st)}</Option>)}
              </Dropdown>
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label} required={!!picklist?.locations.length}>Location</Label>
              <Dropdown
                placeholder={!tenantId ? "Choose the tenant first" : picklist?.locations.length ? "Choose a location" : "No locations set up"}
                disabled={!picklist?.locations.length}
                value={form.location}
                selectedOptions={form.location ? [form.location] : []}
                onOptionSelect={(_, d) => set("location", d.optionValue ?? "")}
              >
                {(picklist?.locations ?? []).map((l) => <Option key={l} value={l}>{l}</Option>)}
              </Dropdown>
            </div>
            <div className={styles.field}>
              <Label className={styles.label} required={!!picklist?.departments.length}>Department</Label>
              <Dropdown
                placeholder={!tenantId ? "Choose the tenant first" : picklist?.departments.length ? "Choose a department" : "No departments set up"}
                disabled={!picklist?.departments.length}
                value={form.department}
                selectedOptions={form.department ? [form.department] : []}
                onOptionSelect={(_, d) => set("department", d.optionValue ?? "")}
              >
                {(picklist?.departments ?? []).map((l) => <Option key={l} value={l}>{l}</Option>)}
              </Dropdown>
            </div>
          </div>
          {picklist?.warning && (
            <MessageBar intent="error">
              <MessageBarBody>{picklist.warning} Saving is paused until the lists load.</MessageBarBody>
            </MessageBar>
          )}
          <div className={styles.field}>
            <Label className={styles.label}>Description</Label>
            <Textarea value={form.description} onChange={(_, d) => set("description", d.value)} rows={3} />
          </div>
        </Card>

        {/* Dates */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Dates & Renewal</Text>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Start date</Label>
              <Input type="date" value={form.startDate} onChange={(_, d) => set("startDate", d.value)} />
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>End date</Label>
              <Input type="date" value={form.endDate} onChange={(_, d) => set("endDate", d.value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Renewal type</Label>
              <Dropdown
                value={getRenewalTypeLabel(form.renewalType)}
                selectedOptions={[form.renewalType]}
                onOptionSelect={(_, d) => set("renewalType", (d.optionValue ?? "Unknown") as RenewalType)}
              >
                {RENEWAL_TYPES.map((t) => <Option key={t} value={t}>{getRenewalTypeLabel(t)}</Option>)}
              </Dropdown>
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Renewal date</Label>
              <Input type="date" value={form.renewalDate} onChange={(_, d) => set("renewalDate", d.value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Renewal term (months)</Label>
              <Input type="number" min={0} value={form.renewalTermMonths} onChange={(_, d) => set("renewalTermMonths", d.value)} />
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Notice period (days)</Label>
              <Input type="number" min={0} value={form.noticePeriodDays} onChange={(_, d) => set("noticePeriodDays", d.value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Decision window opens</Label>
              <Input type="date" value={form.earliestDecision} onChange={(_, d) => set("earliestDecision", d.value)} />
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Decision deadline</Label>
              <Input type="date" value={form.latestDecision} onChange={(_, d) => set("latestDecision", d.value)} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <Button appearance="outline" onClick={computeDates} disabled={!form.endDate}>Compute decision dates</Button>
            <Text className={styles.hint}>
              Leave both empty to compute them automatically: the deadline is the end date minus the notice period, and the window opens 90 days before that.
            </Text>
          </div>
          <div className={styles.field}>
            <Label className={styles.label}>Termination terms</Label>
            <Textarea value={form.terminationTerms} onChange={(_, d) => set("terminationTerms", d.value)} rows={2} />
          </div>
        </Card>

        {/* Financial */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Financial</Text>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Total value (whole term)</Label>
              <Input type="number" min={0} value={form.totalValue} onChange={(_, d) => set("totalValue", d.value)} contentBefore={<Text>$</Text>} />
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Account or policy number</Label>
              <Input value={form.policyOrAccountNumber} onChange={(_, d) => set("policyOrAccountNumber", d.value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Billing frequency</Label>
              <Dropdown
                value={getBillingFrequencyLabel(form.billingFrequency)}
                selectedOptions={[form.billingFrequency]}
                onOptionSelect={(_, d) => set("billingFrequency", (d.optionValue ?? "Unknown") as BillingFrequency)}
              >
                {BILLING_FREQUENCIES.map((f) => <Option key={f} value={f}>{getBillingFrequencyLabel(f)}</Option>)}
              </Dropdown>
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Recurring amount (per billing cycle)</Label>
              <Input type="number" min={0} value={form.recurringAmount} onChange={(_, d) => set("recurringAmount", d.value)} contentBefore={<Text>$</Text>} />
            </div>
          </div>
          <Text className={styles.hint}>
            Annualized value: {annualized !== null ? formatCurrency(annualized) : "—"}
          </Text>
          <div className={styles.field}>
            <Label className={styles.label}>Coverage or scope</Label>
            <Textarea value={form.coverageOrScopeSummary} onChange={(_, d) => set("coverageOrScopeSummary", d.value)} rows={2} />
          </div>
          <div className={styles.field}>
            <Label className={styles.label}>SLA terms</Label>
            <Textarea value={form.slaTerms} onChange={(_, d) => set("slaTerms", d.value)} rows={2} />
          </div>
        </Card>

        {/* Contacts */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Contacts</Text>
          {FORM_CONTACT_ROLES.map((role) => (
            <div key={role} className={styles.contactBlock}>
              <Label className={styles.label}>{getContactRoleLabel(role)}</Label>
              <div className={styles.fieldRow}>
                {(["name", "company", "email", "phone"] as const).map((field) => (
                  <Input
                    key={field}
                    type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                    placeholder={field[0].toUpperCase() + field.slice(1)}
                    value={form.contacts[role][field]}
                    onChange={(_, d) =>
                      setForm((f) => ({ ...f, contacts: { ...f.contacts, [role]: { ...f.contacts[role], [field]: d.value } } }))
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </Card>

        {/* Review */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Review</Text>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Confidence tier</Label>
              <Dropdown
                placeholder="Not set"
                value={form.confidenceTier ? TIER_LABELS[form.confidenceTier] : ""}
                selectedOptions={form.confidenceTier ? [form.confidenceTier] : []}
                onOptionSelect={(_, d) => set("confidenceTier", (d.optionValue ?? "") as ConfidenceTier)}
              >
                {(Object.keys(TIER_LABELS) as ConfidenceTier[]).map((t) => <Option key={t} value={t}>{TIER_LABELS[t]}</Option>)}
              </Dropdown>
            </div>
            <div className={styles.field} style={{ justifyContent: "flex-end" }}>
              <Switch checked={form.needsReview} onChange={(_, d) => set("needsReview", d.checked)} label="Needs review" />
            </div>
          </div>
          <div className={styles.field}>
            <Label className={styles.label}>Review questions (one per line)</Label>
            <Textarea value={form.reviewQuestions} onChange={(_, d) => set("reviewQuestions", d.value)} rows={3} />
          </div>
          <div className={styles.field}>
            <Label className={styles.label}>Tags</Label>
            <div className={styles.tagsRow}>
              {CONTRACT_TAGS.map((t) => {
                const on = form.tags.includes(t.name);
                return (
                  <Button
                    key={t.name}
                    size="small"
                    shape="circular"
                    appearance={on ? "primary" : "outline"}
                    aria-pressed={on}
                    onClick={() => set("tags", on ? form.tags.filter((x) => x !== t.name) : [...form.tags, t.name])}
                  >
                    {t.name}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className={styles.field}>
            <Label className={styles.label}>Notes</Label>
            <Textarea value={form.notes} onChange={(_, d) => set("notes", d.value)} rows={3} />
          </div>
        </Card>

        <Divider />

        {saveError && (
          <MessageBar intent="error">
            <MessageBarBody>{saveError}</MessageBarBody>
          </MessageBar>
        )}
        {missing.length > 0 && !isDemoMode && (
          <Text className={styles.hint}>Still needed: {missing.join(", ")}.</Text>
        )}

        <div className={styles.actions}>
          <Button appearance="subtle" onClick={() => navigate(-1)}>Cancel</Button>
          <Button appearance="primary" icon={<Save24Regular />} disabled={!canSave} onClick={save}>
            {saving ? "Saving…" : mode === "new" ? "Create Agreement" : mode === "renew" ? "Save Renewal" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
