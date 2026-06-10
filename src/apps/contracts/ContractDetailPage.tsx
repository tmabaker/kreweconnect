import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Title3,
  Text,
  Card,
  Button,
  Badge,
  Divider,
  Textarea,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  DialogTrigger,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  Edit24Regular,
  Archive24Regular,
  DocumentText24Regular,
  ArrowUpload24Regular,
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  Warning24Regular,
  Tag24Regular,
  History24Regular,
} from "@fluentui/react-icons";
import { useTenantContext } from "../../shared/hooks/useTenantContext";
import { useMockContracts } from "../../shared/hooks/useMockContracts";
import { getStatusColor, getStatusLabel, formatCurrency, formatDaysRemaining, formatFileSize } from "./contractUtils";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "24px" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  actions: { display: "flex", gap: "8px" },
  grid: { display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px", "@media (max-width: 900px)": { gridTemplateColumns: "1fr" } },
  mainCol: { display: "flex", flexDirection: "column", gap: "20px" },
  sideCol: { display: "flex", flexDirection: "column", gap: "20px" },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px", padding: "16px" },
  metaItem: { display: "flex", flexDirection: "column", gap: "2px" },
  metaLabel: { fontSize: "11px", textTransform: "uppercase" as const, letterSpacing: "0.5px", color: tokens.colorNeutralForeground3 },
  section: { padding: "16px", display: "flex", flexDirection: "column", gap: "12px" },
  sectionTitle: { display: "flex", alignItems: "center", gap: "8px" },
  timeline: { display: "flex", flexDirection: "column", gap: "12px", padding: "0 8px" },
  timelineItem: {
    display: "flex", gap: "12px", position: "relative" as const,
    paddingLeft: "20px", borderLeft: `2px solid ${tokens.colorNeutralStroke2}`,
    paddingBottom: "8px",
  },
  timelineDot: {
    position: "absolute" as const, left: "-5px", top: "4px",
    width: "8px", height: "8px", borderRadius: "50%",
    backgroundColor: tokens.colorBrandForeground1,
  },
  docItem: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 12px", borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  docInfo: { display: "flex", flexDirection: "column", gap: "2px" },
  dropZone: {
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: "32px", textAlign: "center" as const,
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
  },
  approvalItem: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px", borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  tagsRow: { display: "flex", flexWrap: "wrap", gap: "6px" },
  notFound: { display: "flex", flexDirection: "column", alignItems: "center", padding: "64px", gap: "12px" },
});

export function ContractDetailPage() {
  const styles = useStyles();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedTenant } = useTenantContext();
  const { getDetail } = useMockContracts(selectedTenant.tenantId);
  const [approvalComment, setApprovalComment] = useState("");
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);

  const contract = useMemo(() => (id ? getDetail(id) : null), [id, getDetail]);

  if (!contract) {
    return (
      <div className={styles.notFound}>
        <DocumentText24Regular style={{ fontSize: "48px", color: tokens.colorNeutralForeground3 }} />
        <Title2>Contract Not Found</Title2>
        <Button appearance="primary" onClick={() => navigate("/contracts/all")}>Back to Contracts</Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={() => navigate(-1)} />
          <div>
            <Title2>{contract.title}</Title2>
            <Text size={300} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
              {contract.vendorName} · {contract.tenantDisplayName}
            </Text>
          </div>
        </div>
        <div className={styles.actions}>
          <Button icon={<Edit24Regular />} onClick={() => navigate(`/contracts/${id}/edit`)}>Edit</Button>
          <Button icon={<Archive24Regular />} appearance="subtle">Archive</Button>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Main Column */}
        <div className={styles.mainCol}>
          {/* Status & Key Metrics */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Badge appearance="filled" color={getStatusColor(contract.status)} size="large">
                  {getStatusLabel(contract.status)}
                </Badge>
                {contract.autoRenew && <Badge appearance="outline" color="brand" size="small">Auto-Renew</Badge>}
                {contract.daysUntilExpiry !== null && contract.daysUntilExpiry <= 90 && contract.daysUntilExpiry > 0 && (
                  <Badge appearance="filled" color={contract.daysUntilExpiry <= 30 ? "danger" : "warning"} size="small">
                    <Warning24Regular style={{ fontSize: "14px", marginRight: "4px" }} />
                    {formatDaysRemaining(contract.daysUntilExpiry)}
                  </Badge>
                )}
              </div>
              {contract.value && (
                <Text size={600} weight="bold">{formatCurrency(contract.value)}</Text>
              )}
            </div>
            <Divider />
            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <Text className={styles.metaLabel}>Contract Type</Text>
                <Text weight="semibold">{contract.contractType}</Text>
              </div>
              <div className={styles.metaItem}>
                <Text className={styles.metaLabel}>Start Date</Text>
                <Text weight="semibold">{contract.startDate}</Text>
              </div>
              <div className={styles.metaItem}>
                <Text className={styles.metaLabel}>End Date</Text>
                <Text weight="semibold">{contract.endDate ?? "—"}</Text>
              </div>
              <div className={styles.metaItem}>
                <Text className={styles.metaLabel}>Renewal Date</Text>
                <Text weight="semibold">{contract.renewalDate ?? "—"}</Text>
              </div>
              <div className={styles.metaItem}>
                <Text className={styles.metaLabel}>Currency</Text>
                <Text weight="semibold">{contract.currency}</Text>
              </div>
              <div className={styles.metaItem}>
                <Text className={styles.metaLabel}>Created</Text>
                <Text weight="semibold">{new Date(contract.createdAt).toLocaleDateString()}</Text>
              </div>
            </div>
          </Card>

          {/* Description & SLA */}
          {(contract.description || contract.slaTerms) && (
            <Card className={styles.section}>
              {contract.description && (
                <>
                  <Text className={styles.metaLabel}>Description</Text>
                  <Text>{contract.description}</Text>
                </>
              )}
              {contract.slaTerms && (
                <>
                  <Divider />
                  <Text className={styles.metaLabel}>SLA Terms</Text>
                  <Text>{contract.slaTerms}</Text>
                </>
              )}
            </Card>
          )}

          {/* Documents (Epic 10) */}
          <Card className={styles.section}>
            <div className={styles.sectionTitle}>
              <DocumentText24Regular />
              <Title3>Documents</Title3>
            </div>
            {contract.documents.length > 0 ? (
              contract.documents.map((doc) => (
                <div key={doc.id} className={styles.docItem}>
                  <div className={styles.docInfo}>
                    <Text weight="semibold">{doc.fileName}</Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {formatFileSize(doc.fileSize)} · {doc.contentType} · {new Date(doc.uploadedAt).toLocaleDateString()}
                    </Text>
                  </div>
                  <Button appearance="subtle" size="small">Download</Button>
                </div>
              ))
            ) : (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No documents uploaded yet.</Text>
            )}
            <div className={styles.dropZone}>
              <ArrowUpload24Regular style={{ fontSize: "32px", marginBottom: "8px" }} />
              <Text size={200} style={{ display: "block" }}>
                Drag & drop files here or click to upload
              </Text>
              <Text size={100} style={{ display: "block", marginTop: "4px", color: tokens.colorNeutralForeground3 }}>
                PDF, DOC, XLSX up to 25 MB · File storage coming in Phase 4
              </Text>
            </div>
          </Card>

          {/* Version History */}
          <Card className={styles.section}>
            <div className={styles.sectionTitle}>
              <History24Regular />
              <Title3>Version History</Title3>
            </div>
            <div className={styles.timeline}>
              {contract.versions.map((v) => (
                <div key={v.id} className={styles.timelineItem}>
                  <div className={styles.timelineDot} />
                  <div>
                    <Text weight="semibold" size={300}>v{v.versionNumber}: {v.summary}</Text>
                    <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                      {new Date(v.changedAt).toLocaleDateString()} · {v.changeNotes}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Side Column */}
        <div className={styles.sideCol}>
          {/* Tags */}
          <Card className={styles.section}>
            <div className={styles.sectionTitle}>
              <Tag24Regular />
              <Title3>Tags</Title3>
            </div>
            <div className={styles.tagsRow}>
              {contract.tags.map((tag) => (
                <Badge key={tag} appearance="tint" color="brand">{tag}</Badge>
              ))}
            </div>
          </Card>

          {/* Approvals (Epic 12) */}
          <Card className={styles.section}>
            <div className={styles.sectionTitle}>
              <CheckmarkCircle24Regular />
              <Title3>Approvals</Title3>
            </div>
            {contract.approvals.length > 0 ? (
              contract.approvals.map((a) => (
                <div key={a.id} className={styles.approvalItem}>
                  <div>
                    <Badge
                      appearance="filled"
                      color={a.status === "Approved" ? "success" : a.status === "Rejected" ? "danger" : "warning"}
                      size="small"
                    >
                      {a.status}
                    </Badge>
                    <Text size={200} style={{ display: "block", marginTop: "4px", color: tokens.colorNeutralForeground3 }}>
                      {new Date(a.requestedAt).toLocaleDateString()}
                    </Text>
                    {a.comments && (
                      <Text size={200} style={{ display: "block", marginTop: "2px" }}>{a.comments}</Text>
                    )}
                  </div>
                  {a.status === "Pending" && (
                    <div style={{ display: "flex", gap: "4px" }}>
                      <Button icon={<CheckmarkCircle24Regular />} appearance="primary" size="small">Approve</Button>
                      <Button icon={<DismissCircle24Regular />} appearance="subtle" size="small">Reject</Button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No approval requests.</Text>
            )}
            {contract.status !== "UnderReview" && (
              <Button
                appearance="outline"
                icon={<CheckmarkCircle24Regular />}
                onClick={() => setShowApprovalDialog(true)}
                style={{ marginTop: "8px" }}
              >
                Request Approval
              </Button>
            )}
          </Card>

          {/* Contract Info */}
          <Card className={styles.section}>
            <Title3>Contract Info</Title3>
            <div className={styles.metaItem}>
              <Text className={styles.metaLabel}>Tenant</Text>
              <Badge appearance="outline" color="informative">{contract.tenantDisplayName}</Badge>
            </div>
            <div className={styles.metaItem}>
              <Text className={styles.metaLabel}>Vendor</Text>
              <Text weight="semibold">{contract.vendorName}</Text>
            </div>
            <div className={styles.metaItem}>
              <Text className={styles.metaLabel}>Auto Renew</Text>
              <Text weight="semibold">{contract.autoRenew ? "Yes" : "No"}</Text>
            </div>
          </Card>
        </div>
      </div>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={(_, d) => setShowApprovalDialog(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Request Approval</DialogTitle>
            <DialogContent>
              <Text style={{ display: "block", marginBottom: "12px" }}>
                Submit this contract for review and approval.
              </Text>
              <Textarea
                placeholder="Add notes for the reviewer..."
                value={approvalComment}
                onChange={(_, d) => setApprovalComment(d.value)}
                style={{ width: "100%" }}
                rows={3}
              />
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={() => setShowApprovalDialog(false)}>
                Submit for Review
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
