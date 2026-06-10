import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  makeStyles,

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
  Combobox,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  Save24Regular,
  Send24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useMockContracts } from "../../shared/hooks/useMockContracts";
import { CONTRACT_TYPES } from "./contractUtils";
import type { ContractType } from "../../shared/types";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  form: { display: "flex", flexDirection: "column", gap: "24px" },
  section: { padding: "20px", display: "flex", flexDirection: "column", gap: "16px" },
  fieldRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  label: { fontWeight: "600" as const, fontSize: "13px" },
  actions: { display: "flex", gap: "12px", justifyContent: "flex-end" },
  tagInput: { display: "flex", gap: "8px", alignItems: "center" },
  tagsRow: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" },
});

export function ContractFormPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { selectedTenant } = useTenantContext();
  const { getDetail, vendors, tags } = useMockContracts(selectedTenant.tenantId);

  const isEdit = !!id;
  const existing = isEdit ? getDetail(id) : null;

  const [vendorName, setVendorName] = useState(existing?.vendorName ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [contractType, setContractType] = useState<ContractType>(existing?.contractType ?? "Software");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ?? "");
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [renewalDate, setRenewalDate] = useState(existing?.renewalDate ?? "");
  const [autoRenew, setAutoRenew] = useState(existing?.autoRenew ?? false);
  const [value, setValue] = useState(existing?.value?.toString() ?? "");
  const [currency] = useState(existing?.currency ?? "USD");
  const [slaTerms, setSlaTerms] = useState(existing?.slaTerms ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(existing?.tags ?? []);
  const [newTag, setNewTag] = useState("");

  const addTag = () => {
    if (newTag && !selectedTags.includes(newTag)) {
      setSelectedTags([...selectedTags, newTag]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tag));
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate(-1)} />
          <Title2>{isEdit ? "Edit Contract" : "New Contract"}</Title2>
        </div>
      </div>

      <div className={styles.form}>
        {/* Basic Info */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Contract Details</Text>
          <div className={styles.field}>
            <Label className={styles.label} required>Title</Label>
            <Input value={title} onChange={(_, d) => setTitle(d.value)} placeholder="e.g., Microsoft 365 Business Premium" />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label} required>Vendor</Label>
              <Combobox
                value={vendorName}
                onOptionSelect={(_: import("@fluentui/react-components").SelectionEvents, d: import("@fluentui/react-components").OptionOnSelectData) => setVendorName(d.optionText ?? "")}
                placeholder="Select or type vendor"
                freeform
                onInput={(e: React.FormEvent<HTMLInputElement>) => setVendorName((e.target as HTMLInputElement).value)}
              >
                {vendors.map((v) => <Option key={v} value={v}>{v}</Option>)}
              </Combobox>
            </div>
            <div className={styles.field}>
              <Label className={styles.label} required>Contract Type</Label>
              <Dropdown
                value={contractType}
                onOptionSelect={(_, d) => setContractType((d.optionValue ?? "Software") as ContractType)}
              >
                {CONTRACT_TYPES.map((t) => <Option key={t} value={t}>{t}</Option>)}
              </Dropdown>
            </div>
          </div>
          <div className={styles.field}>
            <Label className={styles.label}>Description</Label>
            <Textarea value={description} onChange={(_, d) => setDescription(d.value)} rows={3} placeholder="Contract description..." />
          </div>
        </Card>

        {/* Dates */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Dates & Renewal</Text>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label} required>Start Date</Label>
              <Input type="date" value={startDate} onChange={(_, d) => setStartDate(d.value)} />
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>End Date</Label>
              <Input type="date" value={endDate} onChange={(_, d) => setEndDate(d.value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Renewal Date</Label>
              <Input type="date" value={renewalDate} onChange={(_, d) => setRenewalDate(d.value)} />
            </div>
            <div className={styles.field} style={{ justifyContent: "center" }}>
              <Switch checked={autoRenew} onChange={(_, d) => setAutoRenew(d.checked)} label="Auto-Renew" />
            </div>
          </div>
        </Card>

        {/* Financial */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Financial</Text>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <Label className={styles.label}>Contract Value</Label>
              <Input type="number" value={value} onChange={(_, d) => setValue(d.value)} contentBefore={<Text>$</Text>} />
            </div>
            <div className={styles.field}>
              <Label className={styles.label}>Currency</Label>
              <Input value={currency} disabled />
            </div>
          </div>
          <div className={styles.field}>
            <Label className={styles.label}>SLA Terms</Label>
            <Textarea value={slaTerms} onChange={(_, d) => setSlaTerms(d.value)} rows={2} placeholder="e.g., 99.9% uptime, 4hr response time" />
          </div>
        </Card>

        {/* Tags */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Tags</Text>
          <div className={styles.tagInput}>
            <Dropdown
              value={newTag}
              onOptionSelect={(_, d) => setNewTag(d.optionValue ?? "")}
              placeholder="Select tag"
              style={{ minWidth: "200px" }}
            >
              {tags.filter((t) => !selectedTags.includes(t.name)).map((t) => (
                <Option key={t.id} value={t.name}>{t.name}</Option>
              ))}
            </Dropdown>
            <Button appearance="subtle" onClick={addTag} disabled={!newTag}>Add</Button>
          </div>
          <div className={styles.tagsRow}>
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                appearance="tint"
                color="brand"
                style={{ cursor: "pointer" }}
                onClick={() => removeTag(tag)}
              >
                {tag} ×
              </Badge>
            ))}
          </div>
        </Card>

        {/* Notes */}
        <Card className={styles.section}>
          <Text weight="semibold" size={400}>Notes</Text>
          <Textarea value={notes} onChange={(_, d) => setNotes(d.value)} rows={3} placeholder="Internal notes about this contract..." />
        </Card>

        <Divider />

        {/* Actions */}
        <div className={styles.actions}>
          <Button appearance="subtle" onClick={() => navigate(-1)}>Cancel</Button>
          <Button appearance="secondary" icon={<Save24Regular />}>Save as Draft</Button>
          <Button appearance="primary" icon={<Send24Regular />}>
            {isEdit ? "Save Changes" : "Create Contract"}
          </Button>
        </div>
      </div>
    </div>
  );
}
