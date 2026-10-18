/**
 * KreweReview persistence on Azure Blob storage.
 *
 *   krewereview/contracts/{tenantId}/{contractId}.json  one record per agreement
 *   krewereview/files/{tenantId}/{fileId}               uploaded originals
 *   krewereview/files/{tenantId}/{fileId}.meta.json     upload metadata
 *   krewereview/config/picklists.json                   per-tenant pick lists
 *
 * Every path is built from the authorized tenant id, so a caller can only ever
 * reach blobs under its own tenant prefix. Record writes are ETag guarded so
 * two people saving the same agreement cannot silently overwrite each other.
 */

import { BlobServiceClient, type ContainerClient, RestError } from "@azure/storage-blob";
import { ConflictError, NotFoundError, ServiceUnavailableError } from "./http";
import type { ContractRecord } from "./contractSchema";

const CONTAINER = "krewereview";
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[0-9a-f-]{36}$/i;

export function contractsConnection(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CONTRACTS_STORAGE_CONNECTION || env.CDK_STORAGE_CONNECTION || undefined;
}

let containerPromise: Promise<ContainerClient> | null = null;
let containerFor = "";

async function container(): Promise<ContainerClient> {
  const conn = contractsConnection();
  if (!conn) {
    throw new ServiceUnavailableError("KreweReview storage is not configured. Nothing was saved.");
  }
  if (!containerPromise || containerFor !== conn) {
    containerFor = conn;
    containerPromise = (async () => {
      const client = BlobServiceClient.fromConnectionString(conn).getContainerClient(CONTAINER);
      await client.createIfNotExists();
      return client;
    })();
    containerPromise.catch(() => {
      containerPromise = null;
    });
  }
  return containerPromise;
}

function tenantKey(tenantId: string): string {
  if (!GUID_RE.test(tenantId)) throw new NotFoundError("Unknown tenant.");
  return tenantId.toLowerCase();
}

function idKey(id: string): string {
  if (!ID_RE.test(id)) throw new NotFoundError("Not found.");
  return id.toLowerCase();
}

function contractPath(tenantId: string, id: string): string {
  return `contracts/${tenantKey(tenantId)}/${idKey(id)}.json`;
}

async function readText(c: ContainerClient, path: string): Promise<{ text: string; etag: string } | null> {
  try {
    // One download gives the body and the ETag of exactly that body.
    const resp = await c.getBlobClient(path).download();
    const chunks: Buffer[] = [];
    for await (const chunk of resp.readableStreamBody ?? []) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return { text: Buffer.concat(chunks).toString("utf8"), etag: resp.etag ?? "" };
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return null;
    throw err;
  }
}

async function writeJson(
  c: ContainerClient,
  path: string,
  value: unknown,
  condition: { ifMatch?: string; ifNoneMatch?: string } = {}
): Promise<void> {
  const body = JSON.stringify(value);
  try {
    await c.getBlockBlobClient(path).upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: "application/json" },
      conditions: condition,
    });
  } catch (err) {
    if (err instanceof RestError && (err.statusCode === 412 || err.statusCode === 409)) {
      throw new ConflictError("This agreement was changed by someone else. Reload and try again.");
    }
    throw err;
  }
}

// ─── Contracts ────────────────────────────────────────────────────

export async function listContracts(tenantId: string): Promise<ContractRecord[]> {
  const c = await container();
  const prefix = `contracts/${tenantKey(tenantId)}/`;
  const paths: string[] = [];
  for await (const blob of c.listBlobsFlat({ prefix })) paths.push(blob.name);
  const records = await Promise.all(
    paths.map(async (p) => {
      const buf = await c.getBlobClient(p).downloadToBuffer();
      return JSON.parse(buf.toString("utf8")) as ContractRecord;
    })
  );
  return records;
}

/** Every tenant's agreements (MSP "All Tenants" view). */
export async function listAllContracts(): Promise<ContractRecord[]> {
  const c = await container();
  const paths: string[] = [];
  for await (const blob of c.listBlobsFlat({ prefix: "contracts/" })) paths.push(blob.name);
  return Promise.all(
    paths.map(async (p) => JSON.parse((await c.getBlobClient(p).downloadToBuffer()).toString("utf8")) as ContractRecord)
  );
}

export async function getContract(
  tenantId: string,
  id: string
): Promise<{ record: ContractRecord; etag: string }> {
  const c = await container();
  const found = await readText(c, contractPath(tenantId, id));
  if (!found) throw new NotFoundError("Agreement not found.");
  return { record: JSON.parse(found.text) as ContractRecord, etag: found.etag };
}

export async function createContract(record: ContractRecord): Promise<void> {
  const c = await container();
  await writeJson(c, contractPath(record.tenantId, record.id), record, { ifNoneMatch: "*" });
}

export async function saveContract(record: ContractRecord, etag: string): Promise<void> {
  const c = await container();
  await writeJson(c, contractPath(record.tenantId, record.id), record, { ifMatch: etag });
}

/** Permanently remove an agreement and every file attached to it. */
export async function deleteContract(record: ContractRecord): Promise<void> {
  const c = await container();
  for (const doc of record.documents) {
    await deleteFile(record.tenantId, doc.id);
  }
  await c.getBlobClient(contractPath(record.tenantId, record.id)).deleteIfExists();
}

// ─── Uploaded files ───────────────────────────────────────────────

export interface StoredFileMeta {
  id: string;
  tenantId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedById: string | null;
  uploadedAt: string;
}

function filePath(tenantId: string, fileId: string): string {
  return `files/${tenantKey(tenantId)}/${idKey(fileId)}`;
}

export async function putFile(meta: StoredFileMeta, data: Buffer): Promise<void> {
  const c = await container();
  const path = filePath(meta.tenantId, meta.id);
  await c.getBlockBlobClient(path).uploadData(data, {
    blobHTTPHeaders: { blobContentType: meta.contentType },
  });
  await writeJson(c, path + ".meta.json", meta);
}

export async function getFileMeta(tenantId: string, fileId: string): Promise<StoredFileMeta> {
  const c = await container();
  const found = await readText(c, filePath(tenantId, fileId) + ".meta.json");
  if (!found) throw new NotFoundError("File not found.");
  return JSON.parse(found.text) as StoredFileMeta;
}

export async function getFile(tenantId: string, fileId: string): Promise<{ meta: StoredFileMeta; data: Buffer }> {
  const meta = await getFileMeta(tenantId, fileId);
  const c = await container();
  const data = await c.getBlobClient(filePath(tenantId, fileId)).downloadToBuffer();
  return { meta, data };
}

export async function deleteFile(tenantId: string, fileId: string): Promise<void> {
  const c = await container();
  const path = filePath(tenantId, fileId);
  await c.getBlobClient(path).deleteIfExists();
  await c.getBlobClient(path + ".meta.json").deleteIfExists();
}

// ─── Pick list configuration ──────────────────────────────────────

export interface PicklistSource {
  /** "entra" reads distinct values from the tenant's directory; "list" uses `values`. */
  source: "entra" | "list";
  values: string[];
}

export interface TenantPicklistConfig {
  locations: PicklistSource;
  departments: PicklistSource;
  updatedAt: string;
  updatedById: string | null;
}

const PICKLIST_PATH = "config/picklists.json";

export async function readPicklistConfig(): Promise<Record<string, TenantPicklistConfig>> {
  const c = await container();
  const found = await readText(c, PICKLIST_PATH);
  return found ? (JSON.parse(found.text) as Record<string, TenantPicklistConfig>) : {};
}

export async function writeTenantPicklistConfig(tenantId: string, value: TenantPicklistConfig): Promise<void> {
  const c = await container();
  const key = tenantKey(tenantId);
  // Read-modify-write under the blob ETag so concurrent edits to two tenants
  // can't drop each other's change.
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await readText(c, PICKLIST_PATH);
    const all = found ? (JSON.parse(found.text) as Record<string, TenantPicklistConfig>) : {};
    all[key] = value;
    try {
      await writeJson(c, PICKLIST_PATH, all, found ? { ifMatch: found.etag } : { ifNoneMatch: "*" });
      return;
    } catch (err) {
      if (!(err instanceof ConflictError) || attempt === 2) throw err;
    }
  }
}

/** Test hook: forget the cached container client. */
export function resetContractStoreForTests(): void {
  containerPromise = null;
  containerFor = "";
}
