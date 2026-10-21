'use strict';
// Runtime configuration. App settings (environment variables) win; the client profile supplies defaults.
// Secret VALUES are never written to this repo; only setting NAMES appear here.
const profile = require('./profile');
const env = process.env;
const list = (v, fallback) => String(v || fallback || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const p = profile.load();
const slug = p.client.slug;
const tenantId = String(env.PORTAL_TENANT_ID || p.client.tenantId || '').toLowerCase();

const config = {
  clientSlug: env.PORTAL_CLIENT || slug,
  tenantId,
  // Identities allowed to sign in at all. Everyone still needs an access entry (or bootstrap admin) to see data.
  allowedTenantIds: list(env.PORTAL_ALLOWED_TENANTS, (p.tenants.allowed.length ? p.tenants.allowed : [tenantId]).join(',')),
  bootstrapAdmins: list(env.PORTAL_BOOTSTRAP_ADMINS, ''),
  storageConnection: env.PORTAL_STORAGE_CONNECTION || '',
  tablePrefix: env.PORTAL_TABLE_PREFIX || p.deploy.tablePrefix || `kw${slug.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
  blobContainer: env.PORTAL_BLOB_CONTAINER || p.deploy.blobContainer || `kw-${slug}-attachments`,
  dataDir: env.PORTAL_DATA_DIR || '', // local JSON persistence when no storage connection (dev only)
  graph: {
    tenantId: env.PORTAL_GRAPH_TENANT_ID || tenantId,
    clientId: env.PORTAL_GRAPH_CLIENT_ID || p.deploy.graphClientId || '',
    clientSecret: env.PORTAL_GRAPH_CLIENT_SECRET || '',
    // Directory lookups (manager picker, prefill) in the client tenant. Off when the app is not consented there.
    directory: env.PORTAL_DIRECTORY_ENABLED ? env.PORTAL_DIRECTORY_ENABLED !== 'false' : p.deploy.directory !== false
  },
  mail: {
    enabled: env.PORTAL_MAIL_ENABLED !== 'false' && !!env.PORTAL_GRAPH_CLIENT_SECRET,
    from: env.PORTAL_MAIL_FROM || p.mail.from || '',
    // The tenant that owns the "from" mailbox; defaults to the client tenant (e.g. the MSP's tenant when it sends for the client).
    tenantId: env.PORTAL_MAIL_TENANT_ID || p.mail.tenantId || '',
    hr: env.PORTAL_HR_EMAIL || p.mail.hr || '',
    it: env.PORTAL_IT_EMAIL || p.mail.it || '',
    // A co-managed client's other IT partner, copied on IT hand-offs.
    itCc: list(env.PORTAL_IT_CC, (p.mail.itCc || []).join(',')),
    bcc: list(env.PORTAL_MAIL_BCC, '')
  },
  baseUrl: (env.PORTAL_BASE_URL || p.deploy.baseUrl || '').replace(/\/$/, ''),
  techtoolsBase: (env.TECHTOOLS_BASE_URL || 'https://techtools.noitgroup.com').replace(/\/$/, ''),
  maxAttachmentBytes: parseInt(env.PORTAL_MAX_ATTACHMENT_BYTES || String(8 * 1024 * 1024), 10),
  // Local development only: a fake signed-in principal (JSON: {upn,name,tid}). Ignored when a real SWA principal header is present.
  devPrincipal: env.PORTAL_DEV_PRINCIPAL || '',
  isProduction: !!env.WEBSITE_SITE_NAME || env.NODE_ENV === 'production'
};
module.exports = config;
