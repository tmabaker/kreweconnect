import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Spinner,
  MessageBar,
  MessageBarBody,
  RadioGroup,
  Radio,
  Label,
} from "@fluentui/react-components";
import { ArrowLeft24Regular, Add24Regular, Dismiss16Regular, Save24Regular } from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { isDemoMode } from "../../shared/auth/demoMode";
import { getAvailableTenants, type TenantInfo } from "../../services/tenantService";
import { isGraphError } from "../../services/graphService";
import { getPicklist, savePicklist, type Picklist } from "../../services/contractService";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "24px", maxWidth: "860px" },
  section: { padding: "20px", display: "flex", flexDirection: "column", gap: "12px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "8px" },
  chip: {
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "4px 6px 4px 10px", borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  addRow: { display: "flex", gap: "8px", flexWrap: "wrap" },
  hint: { fontSize: "12px", color: tokens.colorNeutralForeground3 },
});

interface ListEditorProps {
  title: string;
  entraLabel: string;
  source: "entra" | "list";
  values: string[];
  resolved: string[];
  onSource: (s: "entra" | "list") => void;
  onValues: (v: string[]) => void;
}

function ListEditor({ title, entraLabel, source, values, resolved, onSource, onValues }: ListEditorProps) {
  const styles = useStyles();
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onValues([...values, v]);
    setDraft("");
  };
  return (
    <Card className={styles.section}>
      <Text weight="semibold" size={400}>{title}</Text>
      <RadioGroup value={source} onChange={(_, d) => onSource(d.value as "entra" | "list")} layout="horizontal">
        <Radio value="list" label="Fixed list" />
        <Radio value="entra" label={`Use ${entraLabel} from the client's directory`} />
      </RadioGroup>
      {source === "list" ? (
        <>
          <div className={styles.chips}>
            {values.length === 0 && <Text className={styles.hint}>No entries. The field is hidden on agreements until you add some.</Text>}
            {values.map((v) => (
              <span key={v} className={styles.chip}>
                <Text size={200}>{v}</Text>
                <Button
                  size="small"
                  appearance="transparent"
                  icon={<Dismiss16Regular />}
                  aria-label={`Remove ${v}`}
                  onClick={() => onValues(values.filter((x) => x !== v))}
                />
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <Input value={draft} onChange={(_, d) => setDraft(d.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add an entry" />
            <Button icon={<Add24Regular />} onClick={add} disabled={!draft.trim()}>Add</Button>
          </div>
        </>
      ) : (
        <>
          <Text className={styles.hint}>Current values in the directory ({resolved.length}):</Text>
          <div className={styles.chips}>
            {resolved.map((v) => <span key={v} className={styles.chip} style={{ paddingRight: "10px" }}><Text size={200}>{v}</Text></span>)}
          </div>
        </>
      )}
    </Card>
  );
}

export function PicklistsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [tenantId, setTenantId] = useState(selectedTenant.tenantId === "all" ? "" : selectedTenant.tenantId);
  const [current, setCurrent] = useState<Picklist | null>(null);
  const [locSource, setLocSource] = useState<"entra" | "list">("list");
  const [locValues, setLocValues] = useState<string[]>([]);
  const [depSource, setDepSource] = useState<"entra" | "list">("list");
  const [depValues, setDepValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ intent: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    getAvailableTenants().then(setTenants).catch(() => setTenants([]));
  }, []);

  const load = (p: Picklist) => {
    setCurrent(p);
    setLocSource(p.locationSource);
    setLocValues(p.locationSource === "list" ? p.locations : []);
    setDepSource(p.departmentSource);
    setDepValues(p.departmentSource === "list" ? p.departments : []);
  };

  useEffect(() => {
    setCurrent(null);
    setMessage(null);
    if (!tenantId || isDemoMode) return;
    setLoading(true);
    getPicklist(tenantId)
      .then(load)
      .catch((err) => setMessage({ intent: "error", text: isGraphError(err) ? err.message : "Could not load the lists." }))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      load(await savePicklist(tenantId, { source: locSource, values: locValues }, { source: depSource, values: depValues }));
      setMessage({ intent: "success", text: "Saved. New and edited agreements now use these lists." });
    } catch (err) {
      setMessage({ intent: "error", text: isGraphError(err) ? err.message : "Saving failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate("/contracts")} aria-label="Back" />
        <div>
          <Title2>Locations & Departments</Title2>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
            The only values an agreement can use for each client.
          </Text>
        </div>
      </div>

      <Card className={styles.section}>
        <Label weight="semibold">Client</Label>
        <Dropdown
          placeholder="Choose a client"
          value={tenants.find((t) => t.tenantId === tenantId)?.displayName ?? (tenantId ? selectedTenant.displayName : "")}
          selectedOptions={tenantId ? [tenantId] : []}
          onOptionSelect={(_, d) => setTenantId(d.optionValue ?? "")}
        >
          {tenants.map((t) => <Option key={t.tenantId} value={t.tenantId}>{t.displayName}</Option>)}
        </Dropdown>
      </Card>

      {isDemoMode && (
        <MessageBar intent="info"><MessageBarBody>Demo mode has no lists to edit.</MessageBarBody></MessageBar>
      )}
      {loading && <Spinner label="Loading lists…" />}
      {current?.warning && (
        <MessageBar intent="warning"><MessageBarBody>{current.warning}</MessageBarBody></MessageBar>
      )}

      {current && (
        <>
          <ListEditor
            title="Locations"
            entraLabel="Company Name"
            source={locSource}
            values={locValues}
            resolved={current.locationSource === "entra" ? current.locations : []}
            onSource={setLocSource}
            onValues={setLocValues}
          />
          <ListEditor
            title="Departments"
            entraLabel="Department"
            source={depSource}
            values={depValues}
            resolved={current.departmentSource === "entra" ? current.departments : []}
            onSource={setDepSource}
            onValues={setDepValues}
          />
          {message && (
            <MessageBar intent={message.intent}><MessageBarBody>{message.text}</MessageBarBody></MessageBar>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button appearance="primary" icon={<Save24Regular />} disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save Lists"}
            </Button>
          </div>
        </>
      )}
      {!current && message && (
        <MessageBar intent={message.intent}><MessageBarBody>{message.text}</MessageBarBody></MessageBar>
      )}
    </div>
  );
}
