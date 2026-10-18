'use strict';
// The people registry: one record per person across their whole life with the company
// (applicant, approved, hired, active, changed, terminated, rehired).
const { getStore } = require('./store');
const { newId } = require('./ids');
const { HttpError } = require('./http');
const data = require('./profile');

const PK = 'people';

function normMobile(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}
function storeById(id) { return data.stores.find(s => s.id === id) || null; }
function storeByName(name) { return data.stores.find(s => s.name === name || s.short === name) || null; }

function fullName(p) { return `${p.firstName || ''} ${p.lastName || ''}`.trim(); }

function searchText(p) {
  return [p.firstName, p.lastName, p.preferredName, p.personalEmail, p.workEmail, p.mobile, p.employeeNumber, p.title, p.department, (storeById(p.storeId) || {}).name]
    .filter(Boolean).join(' ').toLowerCase();
}

async function list() { return getStore().list('people', PK); }
async function get(id) { return getStore().get('people', PK, id); }

async function save(p) {
  p.updatedAt = new Date().toISOString();
  p.search = searchText(p);
  return getStore().upsert('people', PK, p.id, p);
}

function validateNew(input) {
  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  if (!firstName || !lastName) throw new HttpError(400, 'First and last name are required.');
  if (input.storeId && !storeById(input.storeId)) throw new HttpError(400, 'Unknown store.');
  return { firstName, lastName };
}

async function create(input, actor) {
  const { firstName, lastName } = validateNew(input);
  const now = new Date().toISOString();
  const p = {
    id: newId('P'), firstName, lastName,
    preferredName: String(input.preferredName || '').trim(),
    personalEmail: String(input.personalEmail || '').trim().toLowerCase(),
    mobile: normMobile(input.mobile),
    storeId: input.storeId || '', department: input.department || '', title: input.title || '',
    managerUpn: String(input.managerUpn || '').toLowerCase(), managerName: input.managerName || '',
    employeeNumber: String(input.employeeNumber || '').trim(), workEmail: String(input.workEmail || '').trim().toLowerCase(), entraId: input.entraId || '',
    status: input.status || 'applicant', hireDate: input.hireDate || '', lastDay: '', terminationType: '', rehireEligible: input.rehireEligible || '',
    previousEmployment: Array.isArray(input.previousEmployment) ? input.previousEmployment : [],
    requestIds: [], createdAt: now, createdBy: actor.upn, updatedAt: now, notes: String(input.notes || '')
  };
  return save(p);
}

// Duplicate detection for the "hire" wizard: same name, same mobile, or same personal email.
function matches(p, probe) {
  const name = `${probe.firstName || ''} ${probe.lastName || ''}`.trim().toLowerCase();
  const reasons = [];
  if (name && fullName(p).toLowerCase() === name) reasons.push('same name');
  const m = normMobile(probe.mobile);
  if (m && p.mobile && p.mobile === m) reasons.push('same mobile number');
  const e = String(probe.personalEmail || '').trim().toLowerCase();
  if (e && p.personalEmail && p.personalEmail === e) reasons.push('same personal email');
  return reasons;
}

async function findDuplicates(probe) {
  const all = await list();
  return all.map(p => ({ person: p, reasons: matches(p, probe) })).filter(x => x.reasons.length);
}

// Apply a request outcome to the person record.
async function applyOutcome(person, patch) {
  Object.assign(person, patch);
  return save(person);
}

// Public view: HR-only fields removed for managers and IT.
function redact(p, caller) {
  if (!p) return p;
  if (caller.can('hr')) return p;
  const copy = Object.assign({}, p);
  delete copy.rehireEligible; delete copy.rehireNotes; delete copy.terminationType; delete copy.notes;
  return copy;
}

module.exports = { list, get, create, save, findDuplicates, applyOutcome, redact, normMobile, storeById, storeByName, fullName, PK };
