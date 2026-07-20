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
  Field,
  Badge,
  Dropdown,
  Option,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  Save24Regular,
  PlayCircle24Regular,
  CheckmarkCircle20Regular,
  Clock20Regular,
} from "@fluentui/react-icons";
import {
  fetchAssembledForClient,
  fetchGovClients,
  fetchPolicies,
  updateGovClient,
} from "../../services/governanceService";
import { detectUserTenantContext } from "../../services/tenantService";
import { useGovQuery, formatDateTime, errorMessage } from "./governanceUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1000px" },
  form: { display: "flex", flexDirection: "column", gap: "12px" },
  rowFields: { display: "flex", gap: "16px", flexWrap: "wrap" },
  grow: { flex: 1, minWidth: "220px" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const, padding: "8px 12px",
    borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3, fontSize: "12px", fontWeight: "600" as const,
    textTransform: "uppercase" as const, letterSpacing: "0.5px",
  },
  td: {
    padding: "8px 12px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "middle" as const,
  },
  row: { cursor: "pointer", ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover } },
  wizardLauncher: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  launcherDropdown: { minWidth: "320px" },
});

/** One governance client: profile (staff-editable), wizard launcher, and the
 * company's assembled policies with acknowledgment state. */
export function ClientDetailPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isMspAdmin } = detectUserTenantContext();

  // /clients is already scoped server-side; find this company in it.
  const { data: clients, loading: loadingClients, error: clientsError } = useGovQuery(fetchGovClients);
  const client = (clients ?? []).find((c) => c.id === id);

  const { data: assembled, loading: loadingAssembled, reload: reloadAssembled } = useGovQuery(
    () => fetchAssembledForClient(id!),
    [id]
  );
  const { data: policies } = useGovQuery(fetchPolicies);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [mitpClientId, setMitpClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [wizardPolicyId, setWizardPolicyId] = useState("");

  useEffect(() => {
    if (client) {
      setName(client.name);
      setIndustry(client.industry ?? "");
      setContactName(client.primaryContactName ?? "");
      setContactEmail(client.primaryContactEmail ?? "");
      setMitpClientId(client.mitpClientId ?? "");
    }
  }, [client]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      await updateGovClient(id!, {
        name: name.trim(),
        industry,
        primaryContactName: contactName,
        primaryContactEmail: contactEmail,
        mitpClientId,
      });
      setSavedMessage("Profile saved.");
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loadingClients) return <Spinner label="Loading client…" />;
  if (clientsError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{errorMessage(clientsError)}</MessageBarBody>
      </MessageBar>
    );
  }
  if (!client) {
    return (
      <MessageBar intent="warning">
        <MessageBarBody>This client company was not found (or you don't have access to it).</MessageBarBody>
      </MessageBar>
    );
  }

  const selectedWizardPolicy = (policies ?? []).find((p) => p.id === wizardPolicyId);

  return (
    <div className={styles.page}>
      {isMspAdmin && (
        <div>
          <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate("/governance/clients")}>
            All clients
          </Button>
        </div>
      )}

      <Title2>{client.name}</Title2>

      <Card>
        <Text weight="semibold">Company profile</Text>
        <div className={styles.form}>
          <div className={styles.rowFields}>
            <Field label="Company name" required className={styles.grow}>
              <Input value={name} disabled={!isMspAdmin} onChange={(_, d) => setName(d.value)} />
            </Field>
            <Field label="Industry" className={styles.grow}>
              <Input value={industry} disabled={!isMspAdmin} onChange={(_, d) => setIndustry(d.value)} />
            </Field>
          </div>
          <div className={styles.rowFields}>
            <Field label="Primary contact" className={styles.grow}>
              <Input value={contactName} disabled={!isMspAdmin} onChange={(_, d) => setContactName(d.value)} />
            </Field>
            <Field label="Contact email" className={styles.grow}>
              <Input
                type="email"
                value={contactEmail}
                disabled={!isMspAdmin}
                onChange={(_, d) => setContactEmail(d.value)}
              />
            </Field>
            <Field label="MyITProcess client id" className={styles.grow} hint="Links vCIO findings to this company (R4).">
              <Input value={mitpClientId} disabled={!isMspAdmin} onChange={(_, d) => setMitpClientId(d.value)} />
            </Field>
          </div>
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
          {isMspAdmin && (
            <div>
              <Button appearance="primary" icon={<Save24Regular />} disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <Text weight="semibold">Run the variable wizard</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          Collect or update this company's answers for a policy, then assemble it.
        </Text>
        <div className={styles.wizardLauncher}>
          <Field label="Policy" className={styles.launcherDropdown}>
            <Dropdown
              placeholder="Select a policy"
              value={selectedWizardPolicy?.title ?? ""}
              selectedOptions={wizardPolicyId ? [wizardPolicyId] : []}
              onOptionSelect={(_, d) => setWizardPolicyId(d.optionValue ?? "")}
            >
              {(policies ?? []).map((policy) => (
                <Option key={policy.id} value={policy.id}>{policy.title}</Option>
              ))}
            </Dropdown>
          </Field>
          <Button
            appearance="primary"
            icon={<PlayCircle24Regular />}
            disabled={!wizardPolicyId}
            onClick={() => navigate(`/governance/policies/${wizardPolicyId}/wizard?client=${client.id}`)}
          >
            Open wizard
          </Button>
        </div>
      </Card>

      <Card>
        <Text weight="semibold">Assembled policies</Text>
        {loadingAssembled && <Spinner size="tiny" label="Loading…" />}
        {!loadingAssembled && (assembled ?? []).length === 0 && (
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            Nothing assembled yet — run the wizard, then assemble.
          </Text>
        )}
        {(assembled ?? []).length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Policy</th>
                <th className={styles.th}>Assembled</th>
                <th className={styles.th}>By</th>
                <th className={styles.th}>Acknowledgment</th>
              </tr>
            </thead>
            <tbody>
              {(assembled ?? []).map((item) => (
                <tr
                  key={item.id}
                  className={styles.row}
                  onClick={() => navigate(`/governance/assembled/${item.id}`)}
                >
                  <td className={styles.td}><Text weight="semibold" size={300}>{item.policyTitle}</Text></td>
                  <td className={styles.td}><Text size={300}>{formatDateTime(item.assembledAt)}</Text></td>
                  <td className={styles.td}><Text size={300}>{item.assembledBy}</Text></td>
                  <td className={styles.td}>
                    {item.acknowledgedByClient ? (
                      <Badge appearance="tint" color="success" icon={<CheckmarkCircle20Regular />}>
                        Acknowledged {formatDateTime(item.acknowledgedAt)}
                      </Badge>
                    ) : (
                      <Badge appearance="tint" color="warning" icon={<Clock20Regular />}>
                        Pending
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div>
          <Button size="small" appearance="transparent" onClick={reloadAssembled}>Refresh</Button>
        </div>
      </Card>
    </div>
  );
}
