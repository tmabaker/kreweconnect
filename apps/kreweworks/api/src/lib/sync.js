'use strict';
// Keeps the people registry in step with the client's Microsoft 365 directory, so existing employees
// can be changed or terminated without anyone entering them first. Licensed, enabled members only.
// The directory adds people and refreshes title, department and manager; it never terminates anyone.
// Active people the directory no longer lists are reported for HR to review.
const graph = require('./graph');
const people = require('./people');
const data = require('./profile');
const { getStore } = require('./store');

const KEY = 'directorySync';
const INTERVAL_MS = parseInt(process.env.PORTAL_SYNC_INTERVAL_HOURS || '6', 10) * 3600 * 1000;
const ACTOR = { upn: 'directory-sync' };
let running = null;

function storeFor(u) {
  if (data.stores.length === 1) return data.stores[0].id;
  const s = people.storeByName(u.companyName) || people.storeByName(u.officeLocation);
  return s ? s.id : '';
}

function names(u) {
  if (u.givenName && u.surname) return { firstName: u.givenName, lastName: u.surname };
  const parts = String(u.displayName || '').replace(/^(.+),\s*(.+)$/, '$2 $1').split(' ');
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

async function lastRun() { return getStore().get('settings', 'settings', KEY); }

async function run() {
  const users = (await graph.directory(true)).filter(u => u.licensed);
  const existing = await people.list();
  const byEntra = new Map(existing.filter(p => p.entraId).map(p => [p.entraId, p]));
  const byEmail = new Map(existing.filter(p => p.workEmail).map(p => [p.workEmail, p]));
  let created = 0, updated = 0;
  const seen = new Set();
  const jobs = [];
  for (const u of users) {
    const email = u.mail || u.upn;
    const p = byEntra.get(u.id) || byEmail.get(email) || byEmail.get(u.upn);
    if (!p) {
      const n = names(u);
      if (!n.firstName || !n.lastName) continue;
      jobs.push(() => people.create({ ...n, workEmail: email, entraId: u.id, storeId: storeFor(u), department: u.department, title: u.jobTitle,
        employeeNumber: u.employeeId, mobile: u.mobilePhone, managerUpn: u.managerUpn, managerName: u.managerName, status: 'active', notes: 'Added from the company directory.' }, ACTOR).then(() => { created++; }));
      continue;
    }
    seen.add(p.id);
    if (p.status !== 'active') continue;
    const patch = { entraId: u.id, workEmail: p.workEmail || email, title: u.jobTitle || p.title, department: u.department || p.department,
      managerUpn: u.managerUpn || p.managerUpn, managerName: u.managerName || p.managerName, employeeNumber: p.employeeNumber || u.employeeId, storeId: p.storeId || storeFor(u) };
    if (Object.keys(patch).some(k => (p[k] || '') !== (patch[k] || ''))) jobs.push(() => people.save(Object.assign(p, patch)).then(() => { updated++; }));
  }
  for (let i = 0; i < jobs.length; i += 20) await Promise.all(jobs.slice(i, i + 20).map(j => j()));
  const missing = existing.filter(p => p.status === 'active' && p.workEmail && !seen.has(p.id) && !users.some(u => u.mail === p.workEmail || u.upn === p.workEmail))
    .map(p => ({ id: p.id, name: people.fullName(p), workEmail: p.workEmail }));
  const result = { at: new Date().toISOString(), directoryUsers: users.length, created, updated, missing };
  await getStore().upsert('settings', 'settings', KEY, result);
  return result;
}

// Run now (HR) or when the last run is older than the interval (on the people list). One run at a time.
async function sync(force) {
  if (!graph.configured()) return { skipped: 'directory not connected' };
  if (!force) { const last = await lastRun(); if (last && Date.now() - Date.parse(last.at) < INTERVAL_MS) return last; }
  if (!running) running = run().finally(() => { running = null; });
  return running;
}

module.exports = { sync, lastRun };
