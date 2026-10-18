'use strict';
// Microsoft Graph as the deployment's app registration (app-only, client credentials) in the client tenant.
// Used for: the direct-manager / employee picker (Directory.Read.All) and notification mail (Mail.Send).
// The client secret only ever arrives through the PORTAL_GRAPH_CLIENT_SECRET app setting.
const config = require('./config');

let tokenCache = { value: '', expiresAt: 0 };
let directoryCache = { at: 0, users: [] };
const DIRECTORY_TTL_MS = 10 * 60 * 1000;

function configured() { return !!(config.graph.clientId && config.graph.clientSecret && config.graph.tenantId); }

async function token() {
  if (!configured()) throw new Error('Graph is not configured (PORTAL_GRAPH_CLIENT_SECRET missing).');
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.value;
  const body = new URLSearchParams({ client_id: config.graph.clientId, client_secret: config.graph.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const res = await fetch(`https://login.microsoftonline.com/${config.graph.tenantId}/oauth2/v2.0/token`, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Graph token request failed: ${json.error_description || res.status}`);
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

async function call(method, path, body, extraHeaders) {
  const t = await token();
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

const USER_SELECT = 'id,displayName,userPrincipalName,mail,jobTitle,department,companyName,officeLocation,accountEnabled,userType,employeeId,mobilePhone,businessPhones';

async function directory(force) {
  if (!force && directoryCache.users.length && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) return directoryCache.users;
  const users = [];
  let next = `/users?$select=${USER_SELECT}&$top=999`;
  while (next) {
    const page = await call('GET', next.replace('https://graph.microsoft.com/v1.0', ''));
    users.push(...(page.value || []));
    next = page['@odata.nextLink'] ? page['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
  }
  const people = users.filter(u => u.accountEnabled && u.userType !== 'Guest' && u.mail && !/^(.*(account|boardroom|copier|key machine|photo booth).*)$/i.test(u.jobTitle || ''))
    .map(u => ({ id: u.id, displayName: u.displayName, upn: (u.userPrincipalName || '').toLowerCase(), mail: (u.mail || '').toLowerCase(), jobTitle: u.jobTitle || '', department: u.department || '', companyName: u.companyName || '', employeeId: u.employeeId || '', mobilePhone: u.mobilePhone || '' }))
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
  return call('POST', `/users/${encodeURIComponent(from)}/sendMail`, { message, saveToSentItems: true });
}

module.exports = { configured, token, call, directory, searchUsers, userByUpn, managerOf, sendMail };
