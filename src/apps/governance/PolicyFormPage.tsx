import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Title2,
  Button,
  Card,
  Input,
  Textarea,
  Dropdown,
  Option,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { ArrowLeft24Regular, Save24Regular, Add24Regular } from "@fluentui/react-icons";
import {
  createCategory,
  createPolicy,
  fetchCategories,
  fetchPolicy,
  updatePolicy,
  type GovCategory,
} from "../../services/governanceService";
import { useGovQuery, errorMessage } from "./governanceUtils";

const POLICY_STATUSES = ["draft", "review", "active", "retired"];

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "900px" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  rowFields: { display: "flex", gap: "16px", flexWrap: "wrap" },
  grow: { flex: 1, minWidth: "220px" },
  newCategoryRow: { display: "flex", gap: "8px", alignItems: "flex-end" },
  actions: { display: "flex", gap: "8px" },
  contentArea: { minHeight: "320px", fontFamily: tokens.fontFamilyMonospace },
});

/** Create/edit a policy template. Content edits are versioned server-side
 * (CurrentVersion bump + PolicyVersions snapshot), so change notes matter. */
export function PolicyFormPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const { data: categories, reload: reloadCategories } = useGovQuery(fetchCategories);
  const { data: existing, loading: loadingExisting, error: loadError } = useGovQuery(
    () => (isEdit ? fetchPolicy(id!) : Promise.resolve(null)),
    [id]
  );

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("draft");
  const [nextReviewDate, setNextReviewDate] = useState("");
  const [changeNotes, setChangeNotes] = useState("");

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setSummary(existing.summary ?? "");
      setContent(existing.content ?? "");
      setCategoryId(existing.categoryId);
      setStatus(existing.status);
      setNextReviewDate(existing.nextReviewDate ? existing.nextReviewDate.slice(0, 10) : "");
    }
  }, [existing]);

  const selectedCategory: GovCategory | undefined = (categories ?? []).find((c) => c.id === categoryId);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSaveError(null);
    try {
      const created = await createCategory({ name: newCategoryName.trim() });
      setNewCategoryName("");
      setShowNewCategory(false);
      reloadCategories();
      setCategoryId(created.id);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !categoryId) {
      setSaveError("Title and category are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title: title.trim(),
        summary: summary || undefined,
        content: content || undefined,
        categoryId,
        status,
        nextReviewDate: nextReviewDate || null,
      };
      if (isEdit) {
        await updatePolicy(id!, { ...payload, changeNotes: changeNotes || undefined });
        navigate(`/governance/policies/${id}`);
      } else {
        const created = await createPolicy(payload);
        navigate(`/governance/policies/${created.id}`);
      }
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  };

  if (isEdit && loadingExisting) return <Spinner label="Loading policy…" />;
  if (isEdit && loadError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{errorMessage(loadError)}</MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.page}>
      <div>
        <Button
          appearance="subtle"
          icon={<ArrowLeft24Regular />}
          onClick={() => navigate(isEdit ? `/governance/policies/${id}` : "/governance")}
        >
          {isEdit ? "Back to policy" : "Policy Library"}
        </Button>
      </div>

      <Title2>{isEdit ? "Edit Policy" : "New Policy"}</Title2>

      {saveError && (
        <MessageBar intent="error">
          <MessageBarBody>{saveError}</MessageBarBody>
        </MessageBar>
      )}

      <Card>
        <div className={styles.form}>
          <Field label="Title" required>
            <Input value={title} onChange={(_, d) => setTitle(d.value)} placeholder="e.g. Access Control Policy" />
          </Field>

          <Field label="Summary">
            <Input
              value={summary}
              onChange={(_, d) => setSummary(d.value)}
              placeholder="One-line description shown in the library"
            />
          </Field>

          <div className={styles.rowFields}>
            <Field label="Category" required className={styles.grow}>
              <Dropdown
                placeholder="Select a category"
                value={selectedCategory?.name ?? ""}
                selectedOptions={categoryId ? [categoryId] : []}
                onOptionSelect={(_, d) => setCategoryId(d.optionValue ?? "")}
              >
                {(categories ?? []).map((category) => (
                  <Option key={category.id} value={category.id}>{category.name}</Option>
                ))}
              </Dropdown>
            </Field>

            <Field label="Status" className={styles.grow}>
              <Dropdown
                value={status}
                selectedOptions={[status]}
                onOptionSelect={(_, d) => setStatus(d.optionValue ?? "draft")}
              >
                {POLICY_STATUSES.map((s) => (
                  <Option key={s} value={s}>{s}</Option>
                ))}
              </Dropdown>
            </Field>

            <Field label="Next review date" className={styles.grow}>
              <Input type="date" value={nextReviewDate} onChange={(_, d) => setNextReviewDate(d.value)} />
            </Field>
          </div>

          {!showNewCategory ? (
            <div>
              <Button appearance="transparent" icon={<Add24Regular />} onClick={() => setShowNewCategory(true)}>
                New category
              </Button>
            </div>
          ) : (
            <div className={styles.newCategoryRow}>
              <Field label="New category name" className={styles.grow}>
                <Input value={newCategoryName} onChange={(_, d) => setNewCategoryName(d.value)} />
              </Field>
              <Button appearance="primary" onClick={handleAddCategory}>Add</Button>
              <Button onClick={() => setShowNewCategory(false)}>Cancel</Button>
            </div>
          )}

          <Field
            label="Template content"
            hint={`Use {{variable_key}} placeholders — they are filled from each client's wizard answers.`}
          >
            <Textarea
              className={styles.contentArea}
              resize="vertical"
              value={content}
              onChange={(_, d) => setContent(d.value)}
              placeholder={"# Policy title\n\nThis policy applies to {{company_name}}…"}
            />
          </Field>

          {isEdit && (
            <Field label="Change notes" hint="Recorded in the version history when the content changes.">
              <Input
                value={changeNotes}
                onChange={(_, d) => setChangeNotes(d.value)}
                placeholder="What changed and why"
              />
            </Field>
          )}

          <div className={styles.actions}>
            <Button appearance="primary" icon={<Save24Regular />} disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create policy"}
            </Button>
            <Button onClick={() => navigate(isEdit ? `/governance/policies/${id}` : "/governance")}>
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
