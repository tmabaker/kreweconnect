import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Button,
  Card,
  Input,
  Textarea,
  Dropdown,
  Option,
  Field,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  Save24Regular,
  DocumentFlowchart24Regular,
} from "@fluentui/react-icons";
import {
  assemblePolicy,
  fetchGovClients,
  fetchWizard,
  saveClientVariables,
  type GovWizardQuestion,
} from "../../services/governanceService";
import { detectUserTenantContext } from "../../services/tenantService";
import { useGovQuery, parseOptions, errorMessage } from "./governanceUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "820px" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  sectionHeader: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
  actions: { display: "flex", gap: "8px", flexWrap: "wrap" },
  clientPicker: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  pickerDropdown: { minWidth: "320px" },
});

/** One wizard question rendered by its InputType. */
function QuestionField({
  question,
  value,
  onChange,
}: {
  question: GovWizardQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const hint = question.question !== question.label ? question.question : undefined;
  switch (question.inputType) {
    case "textarea":
      return (
        <Field label={question.label} hint={hint} required={question.required}>
          <Textarea resize="vertical" value={value} onChange={(_, d) => onChange(d.value)} />
        </Field>
      );
    case "date":
      return (
        <Field label={question.label} hint={hint} required={question.required}>
          <Input type="date" value={value} onChange={(_, d) => onChange(d.value)} />
        </Field>
      );
    case "number":
      return (
        <Field label={question.label} hint={hint} required={question.required}>
          <Input type="number" value={value} onChange={(_, d) => onChange(d.value)} />
        </Field>
      );
    case "select": {
      const options = parseOptions(question.options);
      return (
        <Field label={question.label} hint={hint} required={question.required}>
          <Dropdown
            placeholder="Select…"
            value={value}
            selectedOptions={value ? [value] : []}
            onOptionSelect={(_, d) => onChange(d.optionValue ?? "")}
          >
            {options.map((option) => (
              <Option key={option} value={option}>{option}</Option>
            ))}
          </Dropdown>
        </Field>
      );
    }
    default:
      return (
        <Field label={question.label} hint={hint} required={question.required}>
          <Input value={value} onChange={(_, d) => onChange(d.value)} />
        </Field>
      );
  }
}

/** Variable-collection wizard: asks a policy's questions (universal first),
 * prefilled from the client's existing answers, and saves to ClientVariables.
 * Staff can assemble the policy immediately after saving. */
export function WizardPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { id: policyId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = searchParams.get("client") ?? "";
  const { isMspAdmin, userDisplayName } = detectUserTenantContext();

  const { data: clients, loading: loadingClients, error: clientsError } = useGovQuery(fetchGovClients);

  // Non-staff users are scoped to a single company server-side — auto-select it.
  useEffect(() => {
    if (!clientId && clients && clients.length === 1) {
      setSearchParams({ client: clients[0].id }, { replace: true });
    }
  }, [clients, clientId, setSearchParams]);

  const {
    data: wizard,
    loading: loadingWizard,
    error: wizardError,
  } = useGovQuery(
    () => (clientId ? fetchWizard(policyId!, clientId) : Promise.resolve(null)),
    [policyId, clientId]
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (wizard) {
      const initial: Record<string, string> = {};
      for (const q of wizard.questions) initial[q.key] = q.currentValue ?? "";
      setAnswers(initial);
      setSavedMessage(null);
    }
  }, [wizard]);

  const [universal, specific] = useMemo(() => {
    const qs = wizard?.questions ?? [];
    return [qs.filter((q) => q.isUniversal), qs.filter((q) => !q.isUniversal)];
  }, [wizard]);

  const missingRequired = (wizard?.questions ?? []).filter(
    (q) => q.required && !(answers[q.key] ?? "").trim()
  );

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const payload = Object.entries(answers)
        .filter(([, value]) => value.trim() !== "")
        .map(([key, value]) => ({ key, value }));
      await saveClientVariables(clientId, payload);
      return true;
    } catch (err) {
      setSaveError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (await save()) setSavedMessage("Answers saved.");
  };

  const handleSaveAndAssemble = async () => {
    if (!(await save())) return;
    setSaving(true);
    try {
      const outcome = await assemblePolicy(policyId!, clientId, userDisplayName);
      navigate(`/governance/assembled/${outcome.assembledPolicyId}`, {
        state: { missingVariables: outcome.missingVariables },
      });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  const selectedClient = (clients ?? []).find((c) => c.id === clientId);

  return (
    <div className={styles.page}>
      <div>
        <Button
          appearance="subtle"
          icon={<ArrowLeft24Regular />}
          onClick={() =>
            isMspAdmin ? navigate(`/governance/policies/${policyId}`) : navigate("/governance/clients")
          }
        >
          Back
        </Button>
      </div>

      <div>
        <Title2>{wizard ? `Wizard — ${wizard.title}` : "Policy Wizard"}</Title2>
        <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
          Answers fill the {"{{variables}}"} in the policy template. Universal answers are shared
          across every policy for the company.
        </Text>
      </div>

      {clientsError && (
        <MessageBar intent="error">
          <MessageBarBody>{errorMessage(clientsError)}</MessageBarBody>
        </MessageBar>
      )}

      {/* Client picker (staff; clients are auto-selected) */}
      {!clientId && !loadingClients && (clients ?? []).length > 1 && (
        <Card>
          <div className={styles.clientPicker}>
            <Field label="Run the wizard for" className={styles.pickerDropdown}>
              <Dropdown
                placeholder="Select a client company"
                onOptionSelect={(_, d) => d.optionValue && setSearchParams({ client: d.optionValue })}
              >
                {(clients ?? []).map((client) => (
                  <Option key={client.id} value={client.id}>{client.name}</Option>
                ))}
              </Dropdown>
            </Field>
          </div>
        </Card>
      )}

      {(loadingClients || (clientId && loadingWizard)) && <Spinner label="Loading wizard…" />}

      {wizardError && (
        <MessageBar intent="error">
          <MessageBarBody>{errorMessage(wizardError)}</MessageBarBody>
        </MessageBar>
      )}

      {wizard && selectedClient && (
        <Badge appearance="tint" color="brand" size="large">
          {selectedClient.name}
        </Badge>
      )}

      {wizard && (
        <>
          {universal.length > 0 && (
            <Card>
              <div className={styles.sectionHeader}>
                <Text weight="semibold">Company profile (universal)</Text>
                <Badge appearance="tint" color="brand">{universal.length}</Badge>
              </div>
              <div className={styles.form}>
                {universal.map((q) => (
                  <QuestionField
                    key={q.key}
                    question={q}
                    value={answers[q.key] ?? ""}
                    onChange={(value) => setAnswers((prev) => ({ ...prev, [q.key]: value }))}
                  />
                ))}
              </div>
            </Card>
          )}

          {specific.length > 0 && (
            <Card>
              <div className={styles.sectionHeader}>
                <Text weight="semibold">Policy-specific</Text>
                <Badge appearance="tint" color="informative">{specific.length}</Badge>
              </div>
              <div className={styles.form}>
                {specific.map((q) => (
                  <QuestionField
                    key={q.key}
                    question={q}
                    value={answers[q.key] ?? ""}
                    onChange={(value) => setAnswers((prev) => ({ ...prev, [q.key]: value }))}
                  />
                ))}
              </div>
            </Card>
          )}

          {saveError && (
            <MessageBar intent="error">
              <MessageBarBody>{saveError}</MessageBarBody>
            </MessageBar>
          )}
          {savedMessage && (
            <MessageBar intent="success">
              <MessageBarBody>{savedMessage}</MessageBarBody>
            </MessageBar>
          )}
          {missingRequired.length > 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>
                {missingRequired.length} required answer{missingRequired.length === 1 ? "" : "s"} still
                blank — assembly would leave {"{{tokens}}"} unfilled.
              </MessageBarBody>
            </MessageBar>
          )}

          <div className={styles.actions}>
            <Button appearance="primary" icon={<Save24Regular />} disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save answers"}
            </Button>
            {isMspAdmin && (
              <Button
                icon={<DocumentFlowchart24Regular />}
                disabled={saving}
                onClick={handleSaveAndAssemble}
              >
                Save &amp; assemble policy
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
