/**
 * KreweReview (contract lifecycle) routes.
 *
 * Reads follow the normal tenant isolation: a client sees only its own
 * tenant, NOIT staff see any tenant or "all". Every write (create, edit,
 * upload, renew, archive, delete, pick list changes) is NOIT staff only and
 * targets one concrete tenant.
 */

import { randomUUID } from "node:crypto";
import { app, type HttpRequest } from "@azure/functions";
import { AuthError, type CallerContext } from "../lib/authMiddleware";
import { config } from "../lib/config";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  readJsonBody,
  withAuth,
  withMspWriteAuth,
  type Handler,
} from "../lib/http";
import { parseContractFields, type ContractDocument, type ContractRecord } from "../lib/contractSchema";
import {
  createContract,
  deleteContract,
  getContract,
  getFile,
  getFileMeta,
  listAllContracts,
  listContracts,
  putFile,
  saveContract,
  writeTenantPicklistConfig,
  type PicklistSource,
} from "../lib/contractStore";
import { EXTRACTABLE_TYPES, extractContractFields } from "../lib/contractExtraction";
import { resolvePicklist, tenantName, type ResolvedPicklist } from "../lib/picklists";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function displayName(tenantId: string): string {
  if (tenantId.toLowerCase() === config.mspTenantId.toLowerCase()) return "NOIT Group";
  return tenantName(tenantId);
}

/** Same rule as withMspWriteAuth, for routes that mix reads and writes. */
function requireMspWrite(caller: CallerContext, tenantId: string): void {
  if (!caller.isMspAdmin) throw new AuthError("Changes to agreements require NOIT staff.", 403);
  if (tenantId === "all") throw new BadRequestError("Write operations require a specific tenant, not 'all'.");
}

function actor(caller: CallerContext): string {
  return caller.userPrincipalName || caller.userObjectId || "unknown";
}

/** Writes need the tenant's lists; refuse rather than save without them. */
async function writablePicklist(tenantId: string): Promise<ResolvedPicklist> {
  const picklist = await resolvePicklist(tenantId);
  if (picklist.warning) {
    throw new ServiceUnavailableError(`${picklist.warning} Nothing was saved; try again shortly.`);
  }
  return picklist;
}

/** Attach an uploaded file (by id) as a document on a record. */
async function documentFromUpload(
  tenantId: string,
  fileId: unknown,
  kind: ContractDocument["kind"]
): Promise<ContractDocument | null> {
  if (fileId === undefined || fileId === null || fileId === "") return null;
  if (typeof fileId !== "string") throw new BadRequestError("fileId must be text.");
  const meta = await getFileMeta(tenantId, fileId);
  return {
    id: meta.id,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    contentType: meta.contentType,
    kind,
    uploadedById: meta.uploadedById,
    uploadedAt: meta.uploadedAt,
  };
}

function expectedEtag(body: Record<string, unknown>): string {
  if (typeof body.etag !== "string" || !body.etag) {
    throw new BadRequestError("etag is required so a stale edit can't overwrite a newer one.");
  }
  return body.etag;
}

function changedFields(before: ContractRecord, after: Partial<ContractRecord>): string[] {
  return Object.keys(after).filter(
    (k) => JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k])
  );
}

function withVersion(record: ContractRecord, by: string, summary: string, notes: string | null): ContractRecord {
  const next = (record.versions.at(-1)?.versionNumber ?? 0) + 1;
  return {
    ...record,
    versions: [
      ...record.versions,
      { id: randomUUID(), versionNumber: next, summary, changedById: by, changedAt: new Date().toISOString(), changeNotes: notes },
    ],
  };
}

function sortForList(records: ContractRecord[], includeArchived: boolean): ContractRecord[] {
  return records
    .filter((r) => includeArchived || !r.isArchived)
    .map((r) => ({ ...r, tenantDisplayName: displayName(r.tenantId) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// ─── Read ─────────────────────────────────────────────────────────

const listContractsHandler: Handler = async (request, _caller, tenantId) => {
  const includeArchived = request.query.get("includeArchived") === "true";
  const records =
    tenantId === "all"
      ? await listAllContracts(config.clientTenants.map((t) => t.id))
      : await listContracts(tenantId);
  return { status: 200, jsonBody: { contracts: sortForList(records, includeArchived) } };
};

const getContractHandler: Handler = async (request, _caller, tenantId) => {
  if (tenantId === "all") throw new BadRequestError("Open an agreement from its own tenant.");
  const { record, etag } = await getContract(tenantId, request.params.contractId);
  return { status: 200, jsonBody: { contract: { ...record, tenantDisplayName: displayName(tenantId) }, etag } };
};

app.http("contractsDocument", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contracts/{contractId}/documents/{fileId}",
  handler: withAuth(async (request, _caller, tenantId) => {
    if (tenantId === "all") throw new BadRequestError("Open a document from its own tenant.");
    const { record } = await getContract(tenantId, request.params.contractId);
    const doc = record.documents.find((d) => d.id === request.params.fileId);
    if (!doc) throw new NotFoundError("Document not found on this agreement.");
    const { data, meta } = await getFile(tenantId, doc.id);
    const safeName = meta.fileName.replace(/[^\w.\- ()]/g, "_");
    return {
      status: 200,
      body: data,
      headers: {
        "Content-Type": meta.contentType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    };
  }),
});

app.http("contractsPicklist", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contract-picklist",
  handler: withAuth(async (request, caller, tenantId) => {
    if (tenantId === "all") throw new BadRequestError("Pick lists belong to one tenant.");
    if (request.method === "GET") {
      return { status: 200, jsonBody: await resolvePicklist(tenantId) };
    }
    requireMspWrite(caller, tenantId);
    const body = await readJsonBody(request);
    const parseSource = (key: string): PicklistSource => {
      const v = body[key] as Record<string, unknown> | undefined;
      if (!v || typeof v !== "object") throw new BadRequestError(`${key} is required.`);
      if (v.source !== "entra" && v.source !== "list") throw new BadRequestError(`${key}.source must be entra or list.`);
      const values = Array.isArray(v.values) ? v.values : [];
      if (values.some((x) => typeof x !== "string")) throw new BadRequestError(`${key}.values must be text.`);
      const clean = [...new Set((values as string[]).map((s) => s.trim()).filter(Boolean))];
      if (clean.length > 200 || clean.some((s) => s.length > 200)) throw new BadRequestError(`${key}.values is too long.`);
      return { source: v.source, values: v.source === "list" ? clean : [] };
    };
    await writeTenantPicklistConfig(tenantId, {
      locations: parseSource("locations"),
      departments: parseSource("departments"),
      updatedAt: new Date().toISOString(),
      updatedById: actor(caller),
    });
    return { status: 200, jsonBody: await resolvePicklist(tenantId) };
  }),
});

// ─── Upload and extraction ────────────────────────────────────────

app.http("contractsUpload", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contract-files",
  handler: withMspWriteAuth(async (request, caller, tenantId) => {
    const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!EXTRACTABLE_TYPES[contentType]) {
      throw new BadRequestError("Upload a PDF, Word document (.docx), image, or text file.");
    }
    const rawName = request.headers.get("x-file-name") || "agreement";
    let fileName = rawName;
    try {
      fileName = decodeURIComponent(rawName);
    } catch {
      // keep the raw header value
    }
    fileName = fileName.slice(0, 200);
    const data = Buffer.from(await request.arrayBuffer());
    if (data.length === 0) throw new BadRequestError("The file is empty.");
    if (data.length > MAX_UPLOAD_BYTES) throw new BadRequestError("Files over 25 MB can't be uploaded.");
    const meta = {
      id: randomUUID(),
      tenantId,
      fileName,
      contentType,
      fileSize: data.length,
      uploadedById: actor(caller),
      uploadedAt: new Date().toISOString(),
    };
    await putFile(meta, data);
    return { status: 201, jsonBody: { file: meta } };
  }),
});

app.http("contractsExtract", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contract-files/{fileId}/extract",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request).catch(() => ({}) as Record<string, unknown>);
    const renewalOf =
      typeof body.renewalOf === "string" && body.renewalOf ? (await getContract(tenantId, body.renewalOf)).record : null;
    const { data, meta } = await getFile(tenantId, request.params.fileId);
    const picklist = await resolvePicklist(tenantId);
    const result = await extractContractFields(data, meta.contentType, picklist, renewalOf);
    return { status: 200, jsonBody: result };
  }),
});

// ─── Write ────────────────────────────────────────────────────────

const createContractHandler: Handler = async (request, caller, tenantId) => {
    const body = await readJsonBody(request);
    const fields = parseContractFields(body, await writablePicklist(tenantId), randomUUID);
    const doc = await documentFromUpload(tenantId, body.fileId, "original");
    const now = new Date().toISOString();
    const by = actor(caller);
    let record: ContractRecord = {
      ...fields,
      id: randomUUID(),
      tenantId: tenantId.toLowerCase(),
      tenantDisplayName: displayName(tenantId),
      documents: doc ? [doc] : [],
      versions: [],
      extractedAt: typeof body.extractedAt === "string" && doc ? body.extractedAt : null,
      extractionModel: typeof body.extractionModel === "string" && doc ? body.extractionModel.slice(0, 100) : null,
      isArchived: false,
      archivedAt: null,
      createdById: by,
      createdAt: now,
      updatedById: by,
      updatedAt: now,
    };
    record = withVersion(record, by, doc ? "Created from upload" : "Created", doc ? doc.fileName : null);
    await createContract(record);
    const saved = await getContract(tenantId, record.id);
    return { status: 201, jsonBody: { contract: saved.record, etag: saved.etag } };
};

app.http("contracts", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contracts",
  handler: withAuth(async (request, caller, tenantId) => {
    if (request.method === "GET") return listContractsHandler(request, caller, tenantId);
    requireMspWrite(caller, tenantId);
    return createContractHandler(request, caller, tenantId);
  }),
});

app.http("contract", {
  methods: ["GET", "PATCH", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contracts/{contractId}",
  handler: withAuth(async (request, caller, tenantId) => {
    if (request.method === "GET") return getContractHandler(request, caller, tenantId);
    requireMspWrite(caller, tenantId);
    const { record, etag } = await getContract(tenantId, request.params.contractId);

    if (request.method === "DELETE") {
      // Permanent removal: the record and every attached file.
      if (request.query.get("confirm") !== record.id) {
        throw new BadRequestError("Permanent delete needs confirm=<agreement id>.");
      }
      await deleteContract(record);
      return { status: 200, jsonBody: { deleted: record.id } };
    }

    const body = await readJsonBody(request);
    if (expectedEtag(body) !== etag) {
      throw new ConflictError("This agreement was changed by someone else. Reload and try again.");
    }
    const fields = parseContractFields(body, await writablePicklist(tenantId), randomUUID);
    const changes = changedFields(record, fields);
    const by = actor(caller);
    const updated = withVersion(
      { ...record, ...fields, updatedById: by, updatedAt: new Date().toISOString() },
      by,
      "Edited",
      changes.length ? `Changed: ${changes.join(", ")}` : "No field changes"
    );
    await saveContract(updated, etag);
    const saved = await getContract(tenantId, record.id);
    return { status: 200, jsonBody: { contract: saved.record, etag: saved.etag } };
  }),
});

app.http("contractsRenew", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contracts/{contractId}/renew",
  handler: withMspWriteAuth(async (request, caller, tenantId) => {
    const { record, etag } = await getContract(tenantId, request.params.contractId);
    const body = await readJsonBody(request);
    if (expectedEtag(body) !== etag) {
      throw new ConflictError("This agreement was changed by someone else. Reload and try again.");
    }
    const doc = await documentFromUpload(tenantId, body.fileId, "renewal");
    if (!doc) throw new BadRequestError("Upload the renewed agreement first (fileId).");
    if (record.documents.some((d) => d.id === doc.id)) throw new BadRequestError("That file is already attached.");
    const fields = parseContractFields(body, await writablePicklist(tenantId), randomUUID);
    const by = actor(caller);
    const previousTerm = `Previous term ${record.startDate ?? "?"} to ${record.endDate ?? "?"}; renewed with ${doc.fileName}`;
    const updated = withVersion(
      {
        ...record,
        ...fields,
        documents: [...record.documents, doc],
        extractedAt: typeof body.extractedAt === "string" ? body.extractedAt : record.extractedAt,
        extractionModel: typeof body.extractionModel === "string" ? body.extractionModel.slice(0, 100) : record.extractionModel,
        isArchived: false,
        archivedAt: null,
        updatedById: by,
        updatedAt: new Date().toISOString(),
      },
      by,
      "Renewed",
      previousTerm
    );
    await saveContract(updated, etag);
    const saved = await getContract(tenantId, record.id);
    return { status: 200, jsonBody: { contract: saved.record, etag: saved.etag } };
  }),
});

app.http("contractsArchive", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/contracts/{contractId}/archive",
  handler: withMspWriteAuth(async (request: HttpRequest, caller, tenantId) => {
    const { record, etag } = await getContract(tenantId, request.params.contractId);
    const body = await readJsonBody(request);
    const archive = body.archived !== false;
    if (record.isArchived === archive) {
      return { status: 200, jsonBody: { contract: record, etag } };
    }
    const by = actor(caller);
    const now = new Date().toISOString();
    const updated = withVersion(
      { ...record, isArchived: archive, archivedAt: archive ? now : null, updatedById: by, updatedAt: now },
      by,
      archive ? "Archived" : "Restored",
      null
    );
    await saveContract(updated, etag);
    const saved = await getContract(tenantId, record.id);
    return { status: 200, jsonBody: { contract: saved.record, etag: saved.etag } };
  }),
});
