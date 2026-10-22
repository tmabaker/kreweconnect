'use strict';
// Microsoft Graph as the deployment's app registration (app-only, client credentials) in the client tenant.
// Used for: the direct-manager / employee picker (Directory.Read.All) and notification mail (Mail.Send).
// The client secret only ever arrives through the PORTAL_GRAPH_CLIENT_SECRET app setting.
const config = require('./config');

const tokenCache = {}; // per tenant: { value, expiresAt }
let directoryCache = { at: 0, users: [] };
const DIRECTORY_TTL_MS = 10 * 60 * 1000;

function credentialed() { return !!(config.graph.clientId && config.graph.clientSecret); }
// Directory lookups in the client tenant.
function configured() { return credentialed() && !!config.graph.tenantId && config.graph.directory !== false; }
function mailTenant() { return config.mail.tenantId || config.graph.tenantId; }

async function token(tenantId) {
  const tid = tenantId || config.graph.tenantId;
  if (!credentialed() || !tid) throw new Error('Graph is not configured (PORTAL_GRAPH_CLIENT_SECRET missing).');
  const cached = tokenCache[tid];
  if (cached && Date.now() < cached.expiresAt - 60000) return cached.value;
  const body = new URLSearchParams({ client_id: config.graph.clientId, client_secret: config.graph.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const res = await fetch(`https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Graph token request failed: ${json.error_description || res.status}`);
  tokenCache[tid] = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return tokenCache[tid].value;
}

async function call(method, path, body, extraHeaders, tenantId) {
  const t = await token(tenantId);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method, headers: Object.assign({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ConsistencyLevel: 'eventual' }, extraHeaders || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 202 || res.status === 204) return null;
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  if (!res.ok) { const err = new Error(`Graph ${method} ${path} failed: ${res.status} ${(json && json.error && json.error.message) || text}`); err.status = res.status; throw err; }
  return json;
}

const USER_SELECT = 'id,displayName,givenName,surname,userPrincipalName,mail,jobTitle,department,companyName,officeLocation,accountEnabled,userType,employeeId,mobilePhone,businessPhones,assignedLicenses';

async function directory(force) {
  if (!force && directoryCache.users.length && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) return directoryCache.users;
  const users = [];
  let next = `/users?$select=${USER_SELECT}&$expand=manager($select=displayName,userPrincipalName,mail)&$top=999`;
  while (next) {
    const page = await call('GET', next.replace('https://graph.microsoft.com/v1.0', ''));
    users.push(...(page.value || []));
    next = page['@odata.nextLink'] ? page['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
  }
  const people = users.filter(u => u.accountEnabled && u.userType !== 'Guest' && u.mail && !/^(.*(account|boardroom|copier|key machine|photo booth).*)$/i.test(u.jobTitle || ''))
    .map(u => ({ id: u.id, displayName: u.displayName, givenName: u.givenName || '', surname: u.surname || '', upn: (u.userPrincipalName || '').toLowerCase(), mail: (u.mail || '').toLowerCase(), jobTitle: u.jobTitle || '', department: u.department || '', companyName: u.companyName || '', officeLocation: u.officeLocation || '', employeeId: u.employeeId || '', mobilePhone: u.mobilePhone || '',
      licensed: Array.isArray(u.assignedLicenses) && u.assignedLicenses.length > 0,
      managerUpn: u.manager ? String(u.manager.userPrincipalName || u.manager.mail || '').toLowerCase() : '', managerName: u.manager ? u.manager.displayName || '' : '' }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  directoryCache = { at: Date.now(), users: people };
  return people;
}

async function searchUsers(q, limit) {
  const users = await directory(false);
  const needle = String(q || '').trim().toLowerCase();
  const hits = needle ? users.filter(u => `${u.displayName} ${u.mail} ${u.jobTitle} ${u.companyName}`.toLowerCase().includes(needle)) : users;
  return hits.slice(0, limit || 25);
}

async function userByUpn(upn) {
  const users = await directory(false);
  const u = users.find(x => x.upn === String(upn).toLowerCase() || x.mail === String(upn).toLowerCase());
  if (u) return u;
  try { const g = await call('GET', `/users/${encodeURIComponent(upn)}?$select=${USER_SELECT}`); return g; } catch (e) { return null; }
}

async function managerOf(upn) {
  try { const m = await call('GET', `/users/${encodeURIComponent(upn)}/manager?$select=id,displayName,userPrincipalName,mail`); return m; } catch (e) { return null; }
}

async function sendMail(from, message) {
  return call('POST', `/users/${encodeURIComponent(from)}/sendMail`, { message, saveToSentItems: true }, null, mailTenant());
}

module.exports = { configured, credentialed, mailTenant, token, call, directory, searchUsers, userByUpn, managerOf, sendMail };
