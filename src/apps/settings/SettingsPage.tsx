import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Card,
  Body1,
  Button,
  Badge,
  Divider,
} from "@fluentui/react-components";
import {
  People24Regular,
  Building24Regular,
  ShieldKeyhole24Regular,
  Info24Regular,
} from "@fluentui/react-icons";
import { CustomFieldsManager } from "./CustomFieldsManager";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    maxWidth: "900px",
  },
  section: {
    padding: "20px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
  },
});

export function SettingsPage() {
  const styles = useStyles();

  return (
    <div className={styles.page}>
      <div>
        <Title2>Settings</Title2>
        <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "4px" }}>
          Application configuration and administration
        </Text>
      </div>

      <Card className={styles.section}>
        <div className={styles.sectionHeader}>
          <Info24Regular />
          <Text weight="semibold" size={400}>About</Text>
        </div>
        <div className={styles.infoRow}>
          <Text>Application</Text>
          <Text weight="semibold">NOIT Client Tools v1.0.0 — KreweConnect</Text>
        </div>
        <Divider />
        <div className={styles.infoRow}>
          <Text>Environment</Text>
          <Badge appearance="outline" color="informative">Development</Badge>
        </div>
        <Divider />
        <div className={styles.infoRow}>
          <Text>NOIT Tenant ID</Text>
          <Text size={200} style={{ fontFamily: "monospace" }}>7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e</Text>
        </div>
        <Divider />
        <div className={styles.infoRow}>
          <Text>Deploy Target</Text>
          <Text>techtools.noitgroup.com</Text>
        </div>
      </Card>

      <Card className={styles.section}>
        <div className={styles.sectionHeader}>
          <Building24Regular />
          <Text weight="semibold" size={400}>Tenant Management</Text>
          <Badge appearance="outline" color="success">Active</Badge>
        </div>
        <Body1>
          Manage GDAP-connected client tenants, sync relationships from Partner Center,
          and configure per-tenant settings.
        </Body1>
        <div style={{ marginTop: "12px" }}>
          <Button appearance="primary" icon={<ShieldKeyhole24Regular />}>
            Sync GDAP Relationships
          </Button>
        </div>
      </Card>

      <Card className={styles.section}>
        <div className={styles.sectionHeader}>
          <People24Regular />
          <Text weight="semibold" size={400}>User Management</Text>
          <Badge appearance="outline" color="warning">Admin Only</Badge>
        </div>
        <Body1>
          Manage NOIT staff access, assign roles (Admin, Staff, ReadOnly), and configure
          per-user tenant access.
        </Body1>
      </Card>

      {/* Custom Fields Management */}
      <Card className={styles.section}>
        <CustomFieldsManager />
      </Card>
    </div>
  );
}
