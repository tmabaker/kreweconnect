import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Button,
  Card,
  Input,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { Add24Regular, Building24Regular } from "@fluentui/react-icons";
import { createGovClient, fetchGovClients } from "../../services/governanceService";
import { detectUserTenantContext } from "../../services/tenantService";
import { useGovQuery, errorMessage } from "./governanceUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
  },
  clientCard: {
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  cardTitle: { display: "flex", alignItems: "center", gap: "8px" },
  newForm: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "480px" },
  formActions: { display: "flex", gap: "8px" },
});

/** Governance client companies. Staff see all + can add; a client-tenant user
 * sees only its own company (server-scoped) and is sent straight to it. */
export function ClientsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { isMspAdmin } = detectUserTenantContext();
  const { data: clients, loading, error, reload } = useGovQuery(fetchGovClients);

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // A client-tenant user only ever gets one company back — skip the list.
  useEffect(() => {
    if (!isMspAdmin && clients && clients.length === 1) {
      navigate(`/governance/clients/${clients[0].id}`, { replace: true });
    }
  }, [isMspAdmin, clients, navigate]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setSaveError("Company name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createGovClient({ name: name.trim(), industry: industry || undefined });
      navigate(`/governance/clients/${created.id}`);
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Title2>Governance Clients</Title2>
          <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
            Client companies, their wizard answers, and their assembled policies
          </Text>
        </div>
        {isMspAdmin && (
          <Button appearance="primary" icon={<Add24Regular />} onClick={() => setShowNew((v) => !v)}>
            New Client
          </Button>
        )}
      </div>

      {showNew && (
        <Card>
          <div className={styles.newForm}>
            <Field label="Company name" required>
              <Input value={name} onChange={(_, d) => setName(d.value)} />
            </Field>
            <Field label="Industry">
              <Input value={industry} onChange={(_, d) => setIndustry(d.value)} />
            </Field>
            {saveError && (
              <MessageBar intent="error">
                <MessageBarBody>{saveError}</MessageBarBody>
              </MessageBar>
            )}
            <div className={styles.formActions}>
              <Button appearance="primary" disabled={saving} onClick={handleCreate}>
                {saving ? "Creating…" : "Create"}
              </Button>
              <Button onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            {errorMessage(error)}{" "}
            <Button size="small" appearance="transparent" onClick={reload}>Retry</Button>
          </MessageBarBody>
        </MessageBar>
      )}

      {loading && <Spinner label="Loading clients…" />}

      {!loading && !error && (clients ?? []).length === 0 && (
        <Text size={300}>No client companies yet.</Text>
      )}

      <div className={styles.grid}>
        {(clients ?? []).map((client) => (
          <Card
            key={client.id}
            className={styles.clientCard}
            onClick={() => navigate(`/governance/clients/${client.id}`)}
          >
            <div className={styles.cardTitle}>
              <Building24Regular />
              <Text weight="semibold">{client.name}</Text>
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {client.industry || "—"}
            </Text>
            {client.primaryContactName && (
              <Text size={200} style={{ display: "block" }}>
                {client.primaryContactName}
                {client.primaryContactEmail ? ` · ${client.primaryContactEmail}` : ""}
              </Text>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
