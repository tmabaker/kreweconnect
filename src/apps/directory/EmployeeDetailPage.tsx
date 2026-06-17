import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Title3,
  Text,
  Card,
  Button,
  Avatar,
  Badge,
  Spinner,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  Mail24Regular,
  Phone24Regular,
  Call24Regular,
  Chat24Regular,
  Person24Regular,
  People24Regular,
  Briefcase24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useGraphEmployees } from "../../shared/hooks/useGraphEmployees";
import { teamsChatLink, telLink, monthDay, yearsSince, birthdayDisplay, looksLikeGuid } from "./contactUtils";
import type { EmployeeDetail } from "../../shared/types";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "960px" },
  backButton: { alignSelf: "flex-start" },
  profileHeader: {
    display: "flex",
    gap: "24px",
    alignItems: "flex-start",
    padding: "24px",
  },
  profileInfo: { flex: 1 },
  profileName: { display: "flex", alignItems: "center", gap: "12px" },
  contactActions: { display: "flex", gap: "8px", marginTop: "12px" },
  section: { padding: "20px" },
  sectionTitle: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" },
  infoItem: { display: "flex", flexDirection: "column", gap: "2px" },
  infoLabel: { fontSize: "12px", color: tokens.colorNeutralForeground3 },
  peopleGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" },
  personCard: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  notFound: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    padding: "64px 24px",
  },
});

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "brand", "dark-red", "cranberry", "pumpkin", "marigold", "forest",
    "seafoam", "teal", "steel", "blue", "royal-blue", "cornflower",
    "navy", "lavender", "purple", "grape", "lilac", "pink", "magenta", "plum",
  ] as const;
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export function EmployeeDetailPage() {
  const styles = useStyles();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const { getDetail } = useGraphEmployees(selectedTenant.tenantId);
  const [employee, setEmployee] = useState<EmployeeDetail | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setEmployee(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.resolve(getDetail(id)).then((detail) => {
      if (!cancelled) {
        setEmployee(detail);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setEmployee(null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [id, getDetail]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "64px" }}>
        <Spinner size="large" label="Loading employee details..." />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className={styles.notFound}>
        <Person24Regular style={{ fontSize: "48px", color: tokens.colorNeutralForeground3 }} />
        <Title2>Employee not found</Title2>
        <Button appearance="primary" onClick={() => navigate("/directory")}>
          Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Button
        className={styles.backButton}
        appearance="subtle"
        icon={<ArrowLeft24Regular />}
        onClick={() => navigate("/directory")}
      >
        Back to Directory
      </Button>

      {/* Profile Header */}
      <Card className={styles.profileHeader}>
        <Avatar
          name={employee.displayName}
          initials={getInitials(employee.displayName)}
          color={getAvatarColor(employee.displayName)}
          size={96}
        />
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>
            <Title2>{employee.displayName}</Title2>
            <Badge appearance="filled" color={employee.isActive ? "success" : "danger"}>
              {employee.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <Text size={400} style={{ color: tokens.colorNeutralForeground2, display: "block", marginTop: "4px" }}>
            {employee.jobTitle || "No title"}
          </Text>
          {employee.department && (
            <Text size={300} style={{ color: tokens.colorNeutralForeground3, display: "block" }}>
              {employee.department}
              {employee.officeLocation ? ` · ${employee.officeLocation}` : ""}
            </Text>
          )}
          {employee.tenantId && employee.tenantDisplayName && !looksLikeGuid(employee.tenantDisplayName) && (
            <Badge appearance="outline" color="informative" style={{ marginTop: "8px" }}>
              {employee.tenantDisplayName}
            </Badge>
          )}
          <div className={styles.contactActions}>
            {employee.email && (
              <Button
                appearance="primary"
                icon={<Mail24Regular />}
                as="a"
                href={`mailto:${employee.email}`}
              >
                Email
              </Button>
            )}
            {employee.email && (
              <Button
                appearance="outline"
                icon={<Chat24Regular />}
                as="a"
                href={teamsChatLink(employee.email)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Teams
              </Button>
            )}
            {employee.businessPhone && (
              <Button
                appearance="outline"
                icon={<Phone24Regular />}
                as="a"
                href={telLink(employee.businessPhone)}
              >
                Office
              </Button>
            )}
            {employee.mobilePhone && (
              <Button
                appearance="outline"
                icon={<Call24Regular />}
                as="a"
                href={telLink(employee.mobilePhone)}
              >
                Mobile
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Contact & Work Details */}
      <Card className={styles.section}>
        <div className={styles.sectionTitle}>
          <Briefcase24Regular />
          <Title3>Details</Title3>
        </div>
        <div className={styles.infoGrid}>
          <InfoItem label="Email" value={employee.email} />
          <InfoItem label="Mobile Phone" value={employee.mobilePhone} />
          <InfoItem label="Business Phone" value={employee.businessPhone} />
          <InfoItem label="Company" value={employee.companyName} />
          <InfoItem label="Department" value={employee.department} />
          <InfoItem label="Job Title" value={employee.jobTitle} />
          <InfoItem label="Office Location" value={employee.officeLocation} />
          <InfoItem label="Employee ID" value={employee.employeeId} />
          <InfoItem
            label="Work Anniversary"
            value={
              monthDay(employee.hireDate)
                ? `${monthDay(employee.hireDate)}${
                    yearsSince(employee.hireDate) != null
                      ? ` · ${yearsSince(employee.hireDate)} yr${yearsSince(employee.hireDate) === 1 ? "" : "s"}`
                      : ""
                  }`
                : null
            }
          />
          <InfoItem label="Birthday" value={birthdayDisplay(employee.birthday)} />
        </div>
      </Card>

      {/* Manager */}
      {employee.manager && (
        <Card className={styles.section}>
          <div className={styles.sectionTitle}>
            <Person24Regular />
            <Title3>Manager</Title3>
          </div>
          <div
            className={styles.personCard}
            onClick={() => navigate(`/directory/${employee.manager!.id}`)}
          >
            <Avatar
              name={employee.manager.displayName}
              initials={getInitials(employee.manager.displayName)}
              color={getAvatarColor(employee.manager.displayName)}
              size={40}
            />
            <div>
              <Text weight="semibold" size={300} style={{ display: "block" }}>
                {employee.manager.displayName}
              </Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {employee.manager.jobTitle || "—"}
              </Text>
            </div>
          </div>
        </Card>
      )}

      {/* Direct Reports */}
      {employee.directReports.length > 0 && (
        <Card className={styles.section}>
          <div className={styles.sectionTitle}>
            <People24Regular />
            <Title3>Direct Reports</Title3>
            <Badge appearance="outline">{employee.directReports.length}</Badge>
          </div>
          <div className={styles.peopleGrid}>
            {employee.directReports.map((dr) => (
              <div
                key={dr.id}
                className={styles.personCard}
                onClick={() => navigate(`/directory/${dr.id}`)}
              >
                <Avatar
                  name={dr.displayName}
                  initials={getInitials(dr.displayName)}
                  color={getAvatarColor(dr.displayName)}
                  size={36}
                />
                <div>
                  <Text weight="semibold" size={300} style={{ display: "block" }}>
                    {dr.displayName}
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {dr.jobTitle || "—"}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Custom Fields */}
      {employee.customFields.length > 0 && (
        <Card className={styles.section}>
          <div className={styles.sectionTitle}>
            <Briefcase24Regular />
            <Title3>Custom Fields</Title3>
          </div>
          <div className={styles.infoGrid}>
            {employee.customFields.map((cf) => (
              <InfoItem key={cf.id} label={cf.fieldName} value={cf.fieldValue} />
            ))}
          </div>
        </Card>
      )}

      {/* Sync Info */}
      <Text size={200} style={{ color: tokens.colorNeutralForeground3, textAlign: "right" }}>
        Last synced: {employee.lastSyncedAt ? new Date(employee.lastSyncedAt).toLocaleString() : "Never"}
      </Text>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  const styles = useStyles();
  return (
    <div className={styles.infoItem}>
      <Text className={styles.infoLabel}>{label}</Text>
      <Text size={300}>{value || "—"}</Text>
    </div>
  );
}
