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

/**
 * Resolve the storage connection for a tenant.
 *
 * Bring-your-own storage: a client can host its KreweReview data in its own
 * Azure resource — their subscription, their region — for data residency and
 * continuity, while still using our shared front end. CONTRACTS_STORAGE_MAP is
 * a JSON object { "<tenantId>": "<connection string>" }; each value should be a
 * Key Vault reference in production, never a literal key in config. A tenant not
 * listed falls back to the shared NOIT store (CONTRACTS_STORAGE_CONNECTION, then
 * CDK_STORAGE_CONNECTION). The per-tenant blob path layout is unchanged, so a
 * client's own store simply contains that one tenant's data.
 */
export function contractsConnection(tenantId: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.CONTRACTS_STORAGE_MAP;
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const own = map[tenantId] ?? map[tenantId.toLowerCase()];
      if (own) return own;
    } catch {
      // malformed map — fall back to the shared store rather than failing writes
    }
  }
  return env.CONTRACTS_STORAGE_CONNECTION || env.CDK_STORAGE_CONNECTION || undefined;
}

// One container client per distinct connection string: the shared NOIT store
// plus any bring-your-own client stores, each cached across calls.
const containers = new Map<string, Promise<ContainerClient>>();

async function container(tenantId: string): Promise<ContainerClient> {
  const conn = contractsConnection(tenantId);
  if (!conn) {
    throw new ServiceUnavailableError("KreweReview storage is not configured. Nothing was saved.");
  }
  let promise = containers.get(conn);
  if (!promise) {
    promise = (async () => {
      const client = BlobServiceClient.fromConnectionString(conn).getContainerClient(CONTAINER);
      await client.createIfNotExists();
      return client;
    })();
    promise.catch(() => containers.delete(conn));
    containers.set(conn, promise);
  }
  return promise;
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

// A list used to download every record blob on every request. With a few
// hundred agreements per client that ran past the 45 second SWA function
// limit on the All Tenants view. Each tenant now keeps a snapshot at
// index/{tenantId}.json: every record plus the ETag it was read at. A list
// call does one cheap blob listing (names + ETags), loads the snapshot, and
// downloads only records whose ETag moved. The listing stays the source of
// truth, so a stale or missing snapshot only costs speed, never correctness.

interface Snapshot {
  v: 1;
  entries: Record<string, { etag: string; record: ContractRecord }>;
}

const SNAPSHOT_CONCURRENCY = 32;
const SNAPSHOT_BATCH = 150;
const snapshots = new Map<string, Snapshot>();

function snapshotPath(tenantId: string): string {
  return `index/${tenantKey(tenantId)}.json`;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export async function listContracts(tenantId: string): Promise<ContractRecord[]> {
  const c = await container(tenantId);
  const key = tenantKey(tenantId);
  const listing = new Map<string, string>();
  for await (const blob of c.listBlobsFlat({ prefix: `contracts/${key}/` })) {
    listing.set(blob.name, blob.properties.etag ?? "");
  }

  let snap = snapshots.get(key);
  if (!snap) {
    const stored = await readText(c, snapshotPath(tenantId)).catch(() => null);
    try {
      snap = stored ? (JSON.parse(stored.text) as Snapshot) : undefined;
    } catch {
      snap = undefined;
    }
    if (snap?.v !== 1 || !snap.entries) snap = { v: 1, entries: {} };
  }

  const stale = [...listing].filter(([name, etag]) => snap!.entries[name]?.etag !== etag).map(([name]) => name);
  const removed = Object.keys(snap.entries).filter((name) => !listing.has(name));
  if (stale.length || removed.length) {
    const entries = { ...snap.entries };
    for (const name of removed) delete entries[name];
    // Saved after every batch, so a first build that the platform cuts off
    // still leaves progress for the next request to finish.
    for (let i = 0; i < stale.length || i === 0; i += SNAPSHOT_BATCH) {
      const batch = stale.slice(i, i + SNAPSHOT_BATCH);
      const fresh = await mapLimit(batch, SNAPSHOT_CONCURRENCY, async (name) => ({ name, found: await readText(c, name) }));
      for (const { name, found } of fresh) {
        if (found) entries[name] = { etag: found.etag, record: JSON.parse(found.text) as ContractRecord };
        else delete entries[name]; // deleted between the listing and the read
      }
      snap = { v: 1, entries: { ...entries } };
      snapshots.set(key, snap);
      // Best effort: a failed snapshot write only means the next cold start
      // reads more blobs.
      await writeJson(c, snapshotPath(tenantId), snap).catch(() => undefined);
    }
  }
  snapshots.set(key, snap);
  return Object.values(snap.entries).map((e) => e.record);
}

/**
 * Every tenant's agreements (MSP "All Tenants" view). Fans out across each
 * tenant's store, so bring-your-own-storage tenants are included alongside the
 * shared store. Callers pass the set of tenants the MSP may see.
 */
export async function listAllContracts(tenantIds: string[]): Promise<ContractRecord[]> {
  const perTenant = await Promise.all(tenantIds.map((t) => listContracts(t).catch(() => [])));
  return perTenant.flat();
}

export async function getContract(
  tenantId: string,
  id: string
): Promise<{ record: ContractRecord; etag: string }> {
  const c = await container(tenantId);
  const found = await readText(c, contractPath(tenantId, id));
  if (!found) throw new NotFoundError("Agreement not found.");
  return { record: JSON.parse(found.text) as ContractRecord, etag: found.etag };
}

export async function createContract(record: ContractRecord): Promise<void> {
  const c = await container(record.tenantId);
  await writeJson(c, contractPath(record.tenantId, record.id), record, { ifNoneMatch: "*" });
}

export async function saveContract(record: ContractRecord, etag: string): Promise<void> {
  const c = await container(record.tenantId);
  await writeJson(c, contractPath(record.tenantId, record.id), record, { ifMatch: etag });
}

/** Permanently remove an agreement and every file attached to it. */
export async function deleteContract(record: ContractRecord): Promise<void> {
  const c = await container(record.tenantId);
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
  const c = await container(meta.tenantId);
  const path = filePath(meta.tenantId, meta.id);
  await c.getBlockBlobClient(path).uploadData(data, {
    blobHTTPHeaders: { blobContentType: meta.contentType },
  });
  await writeJson(c, path + ".meta.json", meta);
}

export async function getFileMeta(tenantId: string, fileId: string): Promise<StoredFileMeta> {
  const c = await container(tenantId);
  const found = await readText(c, filePath(tenantId, fileId) + ".meta.json");
  if (!found) throw new NotFoundError("File not found.");
  return JSON.parse(found.text) as StoredFileMeta;
}

export async function getFile(tenantId: string, fileId: string): Promise<{ meta: StoredFileMeta; data: Buffer }> {
  const meta = await getFileMeta(tenantId, fileId);
  const c = await container(tenantId);
  const data = await c.getBlobClient(filePath(tenantId, fileId)).downloadToBuffer();
  return { meta, data };
}

export async function deleteFile(tenantId: string, fileId: string): Promise<void> {
  const c = await container(tenantId);
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

export async function readPicklistConfig(tenantId: string): Promise<Record<string, TenantPicklistConfig>> {
  const c = await container(tenantId);
  const found = await readText(c, PICKLIST_PATH);
  return found ? (JSON.parse(found.text) as Record<string, TenantPicklistConfig>) : {};
}

export async function writeTenantPicklistConfig(tenantId: string, value: TenantPicklistConfig): Promise<void> {
  const c = await container(tenantId);
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

/** Test hook: forget the cached container clients. */
export function resetContractStoreForTests(): void {
  snapshots.clear();
  containers.clear();
}
