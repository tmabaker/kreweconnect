import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Button,
  Card,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  CheckmarkCircle24Regular,
  Print24Regular,
} from "@fluentui/react-icons";
import { acknowledgeAssembled, fetchAssembled } from "../../services/governanceService";
import { useGovQuery, formatDateTime, errorMessage } from "./governanceUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1000px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" },
  meta: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  content: {
    whiteSpace: "pre-wrap" as const,
    fontSize: "14px",
    lineHeight: "1.7",
    padding: "24px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  actions: { display: "flex", gap: "8px", flexWrap: "wrap" },
});

/** The assembled (client-specific) policy document + acknowledgment. */
export function AssembledPolicyPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const assembledId = Number(id);

  // Passed by the wizard's "save & assemble" so unfilled tokens surface immediately.
  const missingVariables: string[] = location.state?.missingVariables ?? [];

  const { data: doc, loading, error, reload } = useGovQuery(
    () => fetchAssembled(assembledId),
    [assembledId]
  );
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    setAckError(null);
    try {
      await acknowledgeAssembled(assembledId);
      reload();
    } catch (err) {
      setAckError(errorMessage(err));
    } finally {
      setAcknowledging(false);
    }
  };

  if (loading) return <Spinner label="Loading policy document…" />;
  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{errorMessage(error)}</MessageBarBody>
      </MessageBar>
    );
  }
  if (!doc) return null;

  return (
    <div className={styles.page}>
      <div>
        <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <div className={styles.header}>
        <div>
          <Title2>{doc.policyTitle}</Title2>
          <div className={styles.meta}>
            <Badge appearance="tint" color="brand">{doc.client}</Badge>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              Assembled {formatDateTime(doc.assembledAt)} by {doc.assembledBy}
            </Text>
          </div>
        </div>
        <div className={styles.actions}>
          <Button icon={<Print24Regular />} onClick={() => window.print()}>Print</Button>
          {doc.acknowledgedByClient ? (
            <Badge appearance="filled" color="success" size="large" icon={<CheckmarkCircle24Regular />}>
              Acknowledged {formatDateTime(doc.acknowledgedAt)}
            </Badge>
          ) : (
            <Button
              appearance="primary"
              icon={<CheckmarkCircle24Regular />}
              disabled={acknowledging}
              onClick={handleAcknowledge}
            >
              {acknowledging ? "Recording…" : "Acknowledge"}
            </Button>
          )}
        </div>
      </div>

      {missingVariables.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>
            Assembled with {missingVariables.length} unfilled variable
            {missingVariables.length === 1 ? "" : "s"}: {missingVariables.join(", ")} — re-run the
            wizard and assemble again to fill them.
          </MessageBarBody>
        </MessageBar>
      )}

      {ackError && (
        <MessageBar intent="error">
          <MessageBarBody>{ackError}</MessageBarBody>
        </MessageBar>
      )}

      <Card>
        <div className={styles.content}>{doc.assembledContent}</div>
      </Card>
    </div>
  );
}
