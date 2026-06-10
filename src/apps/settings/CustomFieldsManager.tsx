import { useState } from "react";
import {
  makeStyles,
  tokens,
  Title3,
  Text,
  Button,
  Input,
  Dropdown,
  Option,
  Badge,
  Switch,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  DialogTrigger,
  Textarea,
} from "@fluentui/react-components";
import {
  Add24Regular,
  Delete24Regular,
  ArrowUp24Regular,
  ArrowDown24Regular,
  Settings24Regular,
} from "@fluentui/react-icons";
import type { CustomFieldDefinition } from "../../shared/types";

const useStyles = makeStyles({
  container: { display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  fieldList: { display: "flex", flexDirection: "column", gap: "8px" },
  fieldRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  fieldInfo: { flex: 1, display: "flex", flexDirection: "column", gap: "2px" },
  fieldActions: { display: "flex", gap: "4px" },
  formField: { display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "32px",
    color: tokens.colorNeutralForeground3,
  },
});

const FIELD_TYPES = [
  { value: "Text", label: "Text" },
  { value: "Number", label: "Number" },
  { value: "Date", label: "Date" },
  { value: "Select", label: "Select (dropdown)" },
];

// Mock initial definitions
const INITIAL_DEFINITIONS: CustomFieldDefinition[] = [
  { id: "cfd-1", tenantId: null, fieldName: "Emergency Contact", fieldType: "Text", isRequired: false, displayOrder: 1, selectOptions: null },
  { id: "cfd-2", tenantId: null, fieldName: "Seat Location", fieldType: "Text", isRequired: false, displayOrder: 2, selectOptions: null },
  { id: "cfd-3", tenantId: null, fieldName: "T-Shirt Size", fieldType: "Select", isRequired: false, displayOrder: 3, selectOptions: '["XS","S","M","L","XL","2XL"]' },
  { id: "cfd-4", tenantId: null, fieldName: "Badge Number", fieldType: "Text", isRequired: false, displayOrder: 4, selectOptions: null },
  { id: "cfd-5", tenantId: null, fieldName: "Parking Spot", fieldType: "Text", isRequired: false, displayOrder: 5, selectOptions: null },
];

export function CustomFieldsManager() {
  const styles = useStyles();
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>(INITIAL_DEFINITIONS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newField, setNewField] = useState({ fieldName: "", fieldType: "Text", isRequired: false, selectOptions: "" });

  const handleAdd = () => {
    if (!newField.fieldName.trim()) return;
    const nextOrder = definitions.length > 0 ? Math.max(...definitions.map((d) => d.displayOrder)) + 1 : 1;
    setDefinitions([
      ...definitions,
      {
        id: `cfd-${Date.now()}`,
        tenantId: null,
        fieldName: newField.fieldName.trim(),
        fieldType: newField.fieldType,
        isRequired: newField.isRequired,
        displayOrder: nextOrder,
        selectOptions: newField.fieldType === "Select" && newField.selectOptions ? newField.selectOptions : null,
      },
    ]);
    setNewField({ fieldName: "", fieldType: "Text", isRequired: false, selectOptions: "" });
    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setDefinitions(definitions.filter((d) => d.id !== id));
  };

  const handleMove = (id: string, direction: "up" | "down") => {
    const idx = definitions.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const newDefs = [...definitions];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newDefs.length) return;
    [newDefs[idx], newDefs[swapIdx]] = [newDefs[swapIdx], newDefs[idx]];
    setDefinitions(newDefs.map((d, i) => ({ ...d, displayOrder: i + 1 })));
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <Title3>Custom Field Definitions</Title3>
          <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3, marginTop: "2px" }}>
            Define additional fields for employee profiles (e.g., Emergency Contact, Badge Number)
          </Text>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(_, data) => setIsDialogOpen(data.open)}>
          <DialogTrigger disableButtonEnhancement>
            <Button appearance="primary" icon={<Add24Regular />}>
              Add Field
            </Button>
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Add Custom Field</DialogTitle>
              <DialogContent>
                <div className={styles.formField}>
                  <Text size={300} weight="semibold">Field Name</Text>
                  <Input
                    value={newField.fieldName}
                    onChange={(_, data) => setNewField({ ...newField, fieldName: data.value })}
                    placeholder="e.g., Emergency Contact Phone"
                  />
                </div>
                <div className={styles.formField}>
                  <Text size={300} weight="semibold">Field Type</Text>
                  <Dropdown
                    value={FIELD_TYPES.find((t) => t.value === newField.fieldType)?.label || "Text"}
                    onOptionSelect={(_, data) => setNewField({ ...newField, fieldType: data.optionValue ?? "Text" })}
                  >
                    {FIELD_TYPES.map((t) => (
                      <Option key={t.value} value={t.value}>{t.label}</Option>
                    ))}
                  </Dropdown>
                </div>
                {newField.fieldType === "Select" && (
                  <div className={styles.formField}>
                    <Text size={300} weight="semibold">Options (one per line)</Text>
                    <Textarea
                      value={newField.selectOptions}
                      onChange={(_, data) => setNewField({ ...newField, selectOptions: data.value })}
                      placeholder={"Option 1\nOption 2\nOption 3"}
                      rows={4}
                    />
                  </div>
                )}
                <div className={styles.formField}>
                  <Switch
                    label="Required field"
                    checked={newField.isRequired}
                    onChange={(_, data) => setNewField({ ...newField, isRequired: data.checked })}
                  />
                </div>
              </DialogContent>
              <DialogActions>
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="secondary">Cancel</Button>
                </DialogTrigger>
                <Button appearance="primary" onClick={handleAdd} disabled={!newField.fieldName.trim()}>
                  Add
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>

      {definitions.length === 0 ? (
        <div className={styles.emptyState}>
          <Settings24Regular style={{ fontSize: "32px" }} />
          <Text>No custom fields defined yet. Click "Add Field" to create one.</Text>
        </div>
      ) : (
        <div className={styles.fieldList}>
          {definitions.map((def, idx) => (
            <div key={def.id} className={styles.fieldRow}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, minWidth: "20px" }}>
                {idx + 1}
              </Text>
              <div className={styles.fieldInfo}>
                <Text weight="semibold" size={300}>
                  {def.fieldName}
                </Text>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <Badge appearance="outline" size="small">
                    {def.fieldType}
                  </Badge>
                  {def.isRequired && (
                    <Badge appearance="filled" color="danger" size="small">
                      Required
                    </Badge>
                  )}
                  {def.tenantId === null && (
                    <Badge appearance="outline" color="informative" size="small">
                      Global
                    </Badge>
                  )}
                </div>
              </div>
              <div className={styles.fieldActions}>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowUp24Regular />}
                  disabled={idx === 0}
                  onClick={() => handleMove(def.id, "up")}
                />
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowDown24Regular />}
                  disabled={idx === definitions.length - 1}
                  onClick={() => handleMove(def.id, "down")}
                />
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Delete24Regular />}
                  onClick={() => handleDelete(def.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
