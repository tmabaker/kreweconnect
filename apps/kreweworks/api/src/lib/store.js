'use strict';
// Persistence. Production: Azure Table Storage + Blob Storage (PORTAL_STORAGE_CONNECTION).
// Development and tests: an in-memory store, optionally persisted to a JSON file (PORTAL_DATA_DIR).
// Every table uses a single partition per client so a full scan is cheap (hundreds of rows, not millions).
const fs = require('fs');
const path = require('path');
const config = require('./config');

const TABLES = ['people', 'requests', 'events', 'access', 'settings'];

class MemoryStore {
  constructor(dataDir) {
    this.dataDir = dataDir || '';
    this.data = {};
    this.blobs = {};
    for (const t of TABLES) this.data[t] = new Map();
    this._load();
  }
  _file() { return this.dataDir ? path.join(this.dataDir, 'portal-data.json') : ''; }
  _load() {
    const f = this._file();
    if (!f || !fs.existsSync(f)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const t of TABLES) for (const [k, v] of Object.entries(raw[t] || {})) this.data[t].set(k, v);
      this.blobs = raw.blobs || {};
    } catch (e) { /* start empty */ }
  }
  _save() {
    const f = this._file();
    if (!f) return;
    const raw = { blobs: this.blobs };
    for (const t of TABLES) raw[t] = Object.fromEntries(this.data[t]);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(raw, null, 1));
  }
  _key(pk, rk) { return `${pk}|${rk}`; }
  async get(table, pk, rk) { const v = this.data[table].get(this._key(pk, rk)); return v ? JSON.parse(JSON.stringify(v)) : null; }
  async upsert(table, pk, rk, entity) {
    const copy = Object.assign({}, entity, { partitionKey: pk, rowKey: rk });
    this.data[table].set(this._key(pk, rk), JSON.parse(JSON.stringify(copy)));
    this._save();
    return copy;
  }
  async remove(table, pk, rk) { this.data[table].delete(this._key(pk, rk)); this._save(); }
  async list(table, pk) {
    const out = [];
    for (const [k, v] of this.data[table]) if (k.startsWith(pk + '|')) out.push(JSON.parse(JSON.stringify(v)));
    return out;
  }
  async putBlob(name, buffer, contentType) { this.blobs[name] = { contentType, data: buffer.toString('base64') }; this._save(); }
  async getBlob(name) { const b = this.blobs[name]; return b ? { contentType: b.contentType, data: Buffer.from(b.data, 'base64') } : null; }
  async deleteBlob(name) { delete this.blobs[name]; this._save(); }
}

// Azure Table Storage keeps flat properties. Nested objects are serialized into a single JSON column.
class AzureStore {
  constructor(connection) {
    const { TableClient } = require('@azure/data-tables');
    const { BlobServiceClient } = require('@azure/storage-blob');
    this.clients = {};
    for (const t of TABLES) this.clients[t] = TableClient.fromConnectionString(connection, `${config.tablePrefix}${t}`);
    this.blobService = BlobServiceClient.fromConnectionString(connection);
    this.container = this.blobService.getContainerClient(config.blobContainer);
    this.ready = null;
  }
  async _ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        for (const t of TABLES) await this.clients[t].createTable().catch(err => { if (!/TableAlreadyExists|409/.test(String(err && (err.message || err.statusCode)))) throw err; });
        await this.container.createIfNotExists();
      })();
    }
    return this.ready;
  }
  _wrap(entity) { return { doc: JSON.stringify(entity) }; }
  _unwrap(row) {
    if (!row) return null;
    const e = row.doc ? JSON.parse(row.doc) : {};
    e.partitionKey = row.partitionKey; e.rowKey = row.rowKey;
    return e;
  }
  async get(table, pk, rk) {
    await this._ensure();
    try { return this._unwrap(await this.clients[table].getEntity(pk, rk)); }
    catch (err) { if (err.statusCode === 404) return null; throw err; }
  }
  async upsert(table, pk, rk, entity) {
    await this._ensure();
    const copy = Object.assign({}, entity, { partitionKey: pk, rowKey: rk });
    await this.clients[table].upsertEntity(Object.assign({ partitionKey: pk, rowKey: rk }, this._wrap(copy)), 'Replace');
    return copy;
  }
  async remove(table, pk, rk) {
    await this._ensure();
    try { await this.clients[table].deleteEntity(pk, rk); } catch (err) { if (err.statusCode !== 404) throw err; }
  }
  async list(table, pk) {
    await this._ensure();
    const out = [];
    const iter = this.clients[table].listEntities({ queryOptions: { filter: `PartitionKey eq '${pk.replace(/'/g, "''")}'` } });
    for await (const row of iter) out.push(this._unwrap(row));
    return out;
  }
  async putBlob(name, buffer, contentType) {
    await this._ensure();
    await this.container.getBlockBlobClient(name).uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' } });
  }
  async getBlob(name) {
    await this._ensure();
    const client = this.container.getBlockBlobClient(name);
    if (!(await client.exists())) return null;
    const dl = await client.download();
    const chunks = [];
    for await (const c of dl.readableStreamBody) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return { contentType: dl.contentType, data: Buffer.concat(chunks) };
  }
  async deleteBlob(name) { await this._ensure(); await this.container.getBlockBlobClient(name).deleteIfExists(); }
}

let instance = null;
function getStore() {
  if (instance) return instance;
  instance = config.storageConnection ? new AzureStore(config.storageConnection) : new MemoryStore(config.dataDir);
  return instance;
}
function resetStore(custom) { instance = custom || null; }

module.exports = { getStore, resetStore, MemoryStore, TABLES };
