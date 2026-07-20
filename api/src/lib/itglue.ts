/**
 * Optional IT Glue integration for saving credentials. Config-gated: does
 * nothing unless ITGLUE_API_KEY and a tenant→organization mapping are set,
 * so the rest of the API works whether or not IT Glue is wired up.
 *
 * App settings:
 *   ITGLUE_API_KEY   — IT Glue API key (x-api-key header)
 *   ITGLUE_BASE_URL  — defaults to https://api.itglue.com (use the EU host if applicable)
 *   ITGLUE_ORG_MAP   — JSON object mapping tenantId → IT Glue organization id,
 *                      e.g. {"6444fec1-...":"1234567"}
 *
 * Vaulting layout (per NOIT convention, 2026-07-15):
 *   <organization> → folder "User Passwords" → folder "<First Last>" →
 *   password "M365 - <email>". Folders are created restricted. If the
 *   password record already exists, the OLD password value is copied into
 *   the Notes (with a rotation timestamp) and the new value saved — so the
 *   record keeps its history instead of stacking duplicates.
 *
 * API limitation: IT Glue's public API cannot grant folder access to a
 * specific MyGlue user — folders are created with restricted=true, and the
 * per-user MyGlue grant is a one-time manual step in the IT Glue UI.
 */

import { config } from "./config";

export class ItGlueError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ItGlueError";
    this.status = status;
  }
}

export function itGlueConfigured(): boolean {
  return Boolean(config.itGlueApiKey);
}

export interface ItGlueSaveInput {
  tenantId: string;
  /** User's sign-in address (UPN) — becomes both username and record name. */
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  password: string;
  notes?: string;
}

export interface ItGlueSaveResult {
  id: string;
  /** "created" for a new record, "updated" when an existing one was rotated. */
  action: "created" | "updated";
  folder: string;
}

/* ── low-level API helper ───────────────────────────────────────────── */

interface JsonApiResource {
  id: string;
  attributes: Record<string, unknown>;
}

async function itGlueRequest<T = { data: JsonApiResource }>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${config.itGlueBaseUrl}${path}`, {
    method,
    headers: {
      "x-api-key": config.itGlueApiKey!,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ItGlueError(
      `IT Glue ${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`,
      response.status
    );
  }
  return (await response.json().catch(() => ({}))) as T;
}

/* ── folders ────────────────────────────────────────────────────────── */

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
}

async function listFolders(orgId: string): Promise<Folder[]> {
  const folders: Folder[] = [];
  let path: string | null =
    `/organizations/${orgId}/relationships/password_folders?page[size]=200`;
  while (path) {
    const page: { data: JsonApiResource[]; links?: { next?: string | null } } =
      await itGlueRequest("GET", path);
    for (const f of page.data ?? []) {
      folders.push({
        id: Number(f.id),
        name: String(f.attributes.name ?? ""),
        parentId: (f.attributes["parent-id"] as number | null) ?? null,
      });
    }
    const next = page.links?.next;
    path = next ? next.replace(config.itGlueBaseUrl, "") : null;
  }
  return folders;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Find a folder by name (case-insensitive) under the given parent, or create it (restricted). */
async function ensureFolder(
  orgId: string,
  name: string,
  parentId: number | null,
  existing: Folder[]
): Promise<Folder> {
  const found = existing.find((f) => norm(f.name) === norm(name) && f.parentId === parentId);
  if (found) return found;
  const attributes: Record<string, unknown> = { name, restricted: true };
  if (parentId !== null) attributes["parent-id"] = parentId;
  const created = await itGlueRequest<{ data: JsonApiResource }>(
    "POST",
    `/organizations/${orgId}/relationships/password_folders`,
    { data: { type: "password-folders", attributes } }
  );
  const folder: Folder = { id: Number(created.data.id), name, parentId };
  existing.push(folder);
  return folder;
}

/* ── passwords ──────────────────────────────────────────────────────── */

const USER_PASSWORDS_FOLDER = "User Passwords";

/**
 * Save an M365 password using the NOIT vaulting convention. Creates the
 * "User Passwords" / "<First Last>" folder chain as needed; updates the
 * existing "M365 - <email>" record in place (old password preserved in
 * Notes) or creates it.
 */
export async function savePasswordToItGlue(input: ItGlueSaveInput): Promise<ItGlueSaveResult> {
  if (!config.itGlueApiKey) {
    throw new ItGlueError("IT Glue is not configured (ITGLUE_API_KEY app setting is missing).");
  }
  const orgId = config.itGlueOrgFor(input.tenantId);
  if (!orgId) {
    throw new ItGlueError(
      `No IT Glue organization is mapped for tenant ${input.tenantId} (set ITGLUE_ORG_MAP).`
    );
  }

  const personName =
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    (input.displayName || "").trim() ||
    input.email;
  const recordName = `M365 - ${input.email}`;

  // Folder chain: "User Passwords" → "<First Last>"
  const folders = await listFolders(orgId);
  const root = await ensureFolder(orgId, USER_PASSWORDS_FOLDER, null, folders);
  const personFolder = await ensureFolder(orgId, personName, root.id, folders);

  // Existing record in that folder?
  const search = await itGlueRequest<{ data: JsonApiResource[] }>(
    "GET",
    `/passwords?filter[organization_id]=${orgId}&filter[name]=${encodeURIComponent(recordName)}&page[size]=50`
  );
  const match = (search.data ?? []).find(
    (p) => (p.attributes["password-folder-id"] as number | null) === personFolder.id
  );

  if (match) {
    // Rotate in place: old password value goes to Notes with a timestamp.
    let oldPassword = "";
    try {
      const full = await itGlueRequest<{ data: JsonApiResource }>(
        "GET",
        `/passwords/${match.id}?show_password=true`
      );
      oldPassword = String(full.data.attributes.password ?? "");
    } catch {
      // Old value unreadable — still rotate, but say so in the notes.
    }
    const previousNotes = String(match.attributes.notes ?? "").trim();
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const historyLine = oldPassword
      ? `Previous password (rotated ${stamp} UTC): ${oldPassword}`
      : `Rotated ${stamp} UTC (previous value could not be read).`;
    const notes = [input.notes || "Reset via NOIT Tech Portal", historyLine, previousNotes]
      .filter(Boolean)
      .join("\n\n");
    await itGlueRequest("PATCH", `/passwords/${match.id}`, {
      data: {
        type: "passwords",
        attributes: { password: input.password, notes },
      },
    });
    return { id: match.id, action: "updated", folder: `${USER_PASSWORDS_FOLDER}/${personName}` };
  }

  const created = await itGlueRequest<{ data: JsonApiResource }>("POST", "/passwords", {
    data: {
      type: "passwords",
      attributes: {
        "organization-id": Number(orgId),
        "password-folder-id": personFolder.id,
        restricted: true,
        name: recordName,
        username: input.email,
        password: input.password,
        notes: input.notes || "Reset via NOIT Tech Portal",
      },
    },
  });
  return {
    id: created.data.id || "",
    action: "created",
    folder: `${USER_PASSWORDS_FOLDER}/${personName}`,
  };
}
