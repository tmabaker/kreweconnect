'use strict';
// Who may use the portal, and as what. Default deny.
// Roles: manager (hire, change, terminate for their stores), hr, it, admin.
// Access entries live in the "access" table; bootstrap admins come from PORTAL_BOOTSTRAP_ADMINS.
const config = require('./config');
const principal = require('./principal');
const data = require('./profile');
const { getStore } = require('./store');

const ROLES = ['manager', 'hr', 'it', 'admin'];
const PK = 'access';

// Which roles satisfy a required role. hr and admin can do everything a manager can do.
const SATISFIES = {
  manager: ['manager', 'hr', 'admin'],
  hr: ['hr', 'admin'],
  it: ['it', 'admin'],
  admin: ['admin']
};

function makeCaller(p, entry, bootstrap) {
  const role = bootstrap ? 'admin' : (entry && entry.active !== false ? entry.role : null);
  const stores = bootstrap ? ['*'] : ((entry && entry.stores && entry.stores.length) ? entry.stores : ['*']);
  const caller = {
    upn: p.upn, name: (entry && entry.displayName) || p.name, tid: p.tid, oid: p.oid, role, stores,
    isBootstrapAdmin: !!bootstrap,
    can(required) {
      const list = Array.isArray(required) ? required : [required];
      return list.some(r => (SATISFIES[r] || []).includes(role));
    },
    seesAll() { return role === 'hr' || role === 'it' || role === 'admin' || stores.includes('*'); },
    inScope(storeId) { return this.seesAll() || (storeId && stores.includes(storeId)); }
  };
  return caller;
}

async function lookup(upn) {
  if (!upn) return null;
  return getStore().get('access', PK, upn.toLowerCase());
}

// A new deployment starts with the profile's initialAccess list. It fills the access table only
// while that table is empty, so access granted or removed later in the portal is never overwritten.
let seeded = null;
function seedFromProfile() {
  const store = getStore();
  if (!seeded || seeded.store !== store) {
    const promise = (async () => {
      const list = data.initialAccess || [];
      if (!list.length || (await store.list('access', PK)).length) return;
      for (const e of list) await saveAccess(e, { upn: 'initial-access' });
    })();
    promise.catch(() => { seeded = null; });
    seeded = { store, promise };
  }
  return seeded.promise;
}

async function resolveCaller(request) {
  const p = principal.fromRequest(request);
  if (!p || !p.upn) return null;
  await seedFromProfile();
  if (p.tid && !config.allowedTenantIds.includes(p.tid)) return makeCaller(p, null, false);
  const bootstrap = config.bootstrapAdmins.includes(p.upn);
  const entry = await lookup(p.upn);
  const caller = makeCaller(p, entry, bootstrap);
  if (entry && caller.role) {
    // Light-touch "last seen" so admins can spot dormant accounts. Best effort.
    const now = new Date().toISOString();
    if (!entry.lastSeenAt || entry.lastSeenAt.slice(0, 10) !== now.slice(0, 10)) {
      getStore().upsert('access', PK, p.upn, Object.assign({}, entry, { lastSeenAt: now })).catch(() => {});
    }
  }
  return caller;
}

// Roles handed back to Static Web Apps after login (rolesSource). "portal" gates every protected route.
async function rolesForLogin(swaPrincipal) {
  const p = principal.fromSwaPrincipal(swaPrincipal);
  if (!p || !p.upn) return [];
  if (p.tid && !config.allowedTenantIds.includes(p.tid)) return [];
  await seedFromProfile();
  const bootstrap = config.bootstrapAdmins.includes(p.upn);
  const entry = await lookup(p.upn);
  const caller = makeCaller(p, entry, bootstrap);
  if (!caller.role) return [];
  return ['portal', caller.role];
}

async function listAccess() {
  const rows = await getStore().list('access', PK);
  return rows.sort((a, b) => (a.displayName || a.upn).localeCompare(b.displayName || b.upn));
}

async function saveAccess(entry, actor) {
  const upn = String(entry.upn || '').trim().toLowerCase();
  if (!upn || !upn.includes('@')) throw new Error('A valid email address is required.');
  if (!ROLES.includes(entry.role)) throw new Error(`Role must be one of ${ROLES.join(', ')}.`);
  const existing = await lookup(upn);
  const stores = Array.isArray(entry.stores) ? entry.stores.filter(Boolean) : [];
  const saved = {
    upn, displayName: entry.displayName || (existing && existing.displayName) || upn, role: entry.role,
    stores: stores.length ? stores : ['*'], active: entry.active !== false,
    createdAt: (existing && existing.createdAt) || new Date().toISOString(), createdBy: (existing && existing.createdBy) || actor.upn,
    updatedAt: new Date().toISOString(), updatedBy: actor.upn, lastSeenAt: existing && existing.lastSeenAt
  };
  await getStore().upsert('access', PK, upn, saved);
  return saved;
}

async function removeAccess(upn) { await getStore().remove('access', PK, String(upn).toLowerCase()); }

module.exports = { ROLES, seedFromProfile, resolveCaller, rolesForLogin, listAccess, saveAccess, removeAccess, lookup, makeCaller };
