import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Button,
  Card,
  Input,
  Dropdown,
  Option,
  Checkbox,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  Save24Regular,
  Add24Regular,
  Delete20Regular,
  ArrowUp20Regular,
  ArrowDown20Regular,
} from "@fluentui/react-icons";
import {
  fetchPolicy,
  replacePolicyVariables,
  type GovVariableDef,
} from "../../services/governanceService";
import { useGovQuery, errorMessage } from "./governanceUtils";

const INPUT_TYPES = ["text", "textarea", "date", "select", "number"];

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1200px" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const, padding: "8px",
    borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3, fontSize: "12px", fontWeight: "600" as const,
    textTransform: "uppercase" as const, letterSpacing: "0.5px",
  },
  td: {
    padding: "8px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "top" as const,
  },
  actions: { display: "flex", gap: "8px" },
  rowButtons: { display: "flex", gap: "2px" },
});

/** Edit a policy's wizard variable definitions. Saved as a full replace
 * (PUT /policies/{id}/variables) — the API rewrites the definition set;
 * clients' collected answers (ClientVariables) are keyed by name and survive. */
export function PolicyVariablesPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: policy, loading, error } = useGovQuery(() => fetchPolicy(id!), [id]);
  const [rows, setRows] = useState<GovVariableDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (policy) setRows(policy.variables.map((v) => ({ ...v })));
  }, [policy]);

  const update = (index: number, patch: Partial<GovVariableDef>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        key: "",
        label: "",
        question: "",
        inputType: "text",
        options: null,
        isUniversal: false,
        required: true,
        sortOrder: prev.length,
      },
    ]);

  const handleSave = async () => {
    const missingKey = rows.some((r) => !r.key.trim());
    if (missingKey) {
      setSaveError("Every variable needs a key.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await replacePolicyVariables(
        id!,
        rows.map((row, index) => ({ ...row, key: row.key.trim(), sortOrder: index }))
      );
      navigate(`/governance/policies/${id}`);
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading variables…" />;
  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{errorMessage(error)}</MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.page}>
      <div>
        <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate(`/governance/policies/${id}`)}>
          Back to policy
        </Button>
      </div>

      <div>
        <Title2>Wizard Variables</Title2>
        <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
          {policy?.title} — each row is one question the variable wizard asks. Universal variables are
          shared across all policies and asked once per client.
        </Text>
      </div>

      {saveError && (
        <MessageBar intent="error">
          <MessageBarBody>{saveError}</MessageBarBody>
        </MessageBar>
      )}

      <Card>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Key</th>
              <th className={styles.th}>Label</th>
              <th className={styles.th}>Question</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Options (select)</th>
              <th className={styles.th}>Universal</th>
              <th className={styles.th}>Required</th>
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className={styles.td}>
                  <Input
                    size="small"
                    value={row.key}
                    onChange={(_, d) => update(index, { key: d.value })}
                    placeholder="company_name"
                  />
                </td>
                <td className={styles.td}>
                  <Input size="small" value={row.label} onChange={(_, d) => update(index, { label: d.value })} />
                </td>
                <td className={styles.td}>
                  <Input size="small" value={row.question} onChange={(_, d) => update(index, { question: d.value })} />
                </td>
                <td className={styles.td}>
                  <Dropdown
                    size="small"
                    style={{ minWidth: "110px" }}
                    value={row.inputType}
                    selectedOptions={[row.inputType]}
                    onOptionSelect={(_, d) => update(index, { inputType: d.optionValue ?? "text" })}
                  >
                    {INPUT_TYPES.map((t) => (
                      <Option key={t} value={t}>{t}</Option>
                    ))}
                  </Dropdown>
                </td>
                <td className={styles.td}>
                  <Input
                    size="small"
                    disabled={row.inputType !== "select"}
                    value={row.options ?? ""}
                    onChange={(_, d) => update(index, { options: d.value || null })}
                    placeholder='["Option A","Option B"]'
                  />
                </td>
                <td className={styles.td}>
                  <Checkbox
                    checked={row.isUniversal}
                    onChange={(_, d) => update(index, { isUniversal: Boolean(d.checked) })}
                  />
                </td>
                <td className={styles.td}>
                  <Checkbox
                    checked={row.required}
                    onChange={(_, d) => update(index, { required: Boolean(d.checked) })}
                  />
                </td>
                <td className={styles.td}>
                  <div className={styles.rowButtons}>
                    <Button size="small" appearance="subtle" icon={<ArrowUp20Regular />} onClick={() => move(index, -1)} />
                    <Button size="small" appearance="subtle" icon={<ArrowDown20Regular />} onClick={() => move(index, 1)} />
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<Delete20Regular />}
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: "12px" }}>
          <Button appearance="transparent" icon={<Add24Regular />} onClick={addRow}>
            Add variable
          </Button>
        </div>
      </Card>

      <div className={styles.actions}>
        <Button appearance="primary" icon={<Save24Regular />} disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save variables"}
        </Button>
        <Button onClick={() => navigate(`/governance/policies/${id}`)}>Cancel</Button>
      </div>
    </div>
  );
}
