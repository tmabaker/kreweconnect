'use strict';
// The online pre-employment packet: invite tokens, candidate submissions, HR-only values, print models.
const crypto = require('crypto');
const { HttpError } = require('./http');
const pii = require('./pii');
const data = require('./profile');
// The packet definition lives in the client profile (profile.packet). Without one, the online packet is off.
const def = data.packet || null;

const INVITE_DAYS = parseInt(process.env.PORTAL_PACKET_INVITE_DAYS || '21', 10);
const clean = (s, max) => String(s == null ? '' : s).trim().slice(0, max || 500);
const nowIso = () => new Date().toISOString();

function allFields() {
  const out = [];
  for (const s of (def ? def.sections : [])) {
    for (const f of s.fields || []) out.push(Object.assign({ section: s.key }, f));
  }
  return out;
}
const FIELDS = allFields();
const PII_KEYS = FIELDS.filter(f => f.pii).map(f => f.key);
const SIGNATURES = [].concat(...(def ? def.sections : []).map(s => s.signature ? [{ key: s.signature, title: s.title }] : (s.consents || []).map(c => ({ key: c.key, title: c.title }))));

function newToken() { return crypto.randomBytes(24).toString('base64url'); }

// Manager (or HR) creates or refreshes the candidate link.
function createInvite(r, actor, opts) {
  if (!def) throw new HttpError(409, 'This portal has no online packet. Use the paper packet.');
  const packet = r.hire.packet;
  packet.invite = {
    token: newToken(), createdAt: nowIso(), createdBy: actor.upn,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000).toISOString(),
    candidateEmail: clean((opts && opts.candidateEmail) || '', 120).toLowerCase(), sentAt: '', sentTo: ''
  };
  return packet.invite;
}

function inviteStatus(r) {
  const p = (r.hire && r.hire.packet) || {};
  if (p.submission && p.submission.submittedAt) return 'submitted';
  if (!p.invite || !p.invite.token) return 'none';
  if (new Date(p.invite.expiresAt).getTime() < Date.now()) return 'expired';
  return 'active';
}

// Public (anonymous) view: what the candidate page needs. Never includes anything but the request's own header data.
function publicView(r, person) {
  const store = data.stores.find(s => s.id === r.storeId) || {};
  const status = inviteStatus(r);
  return {
    status, definition: def,
    header: { candidateName: person ? `${person.firstName} ${person.lastName}`.trim() : '', position: r.title || '', store: store.name || '', storeShort: store.short || '', department: r.department || '', managerName: r.managerName || '', helpdesk: data.client.helpdesk, hr: data.client.hr },
    expiresAt: r.hire.packet.invite ? r.hire.packet.invite.expiresAt : '',
    submittedAt: r.hire.packet.submission ? r.hire.packet.submission.submittedAt : ''
  };
}

function bool(v) { return v === true || v === 'true' || v === 'yes' || v === 'on'; }

// Validate and store a candidate submission. PII fields are encrypted before anything is written.
function normalizeSubmission(body, meta) {
  const values = {}; const errors = [];
  for (const f of FIELDS) {
    let v = body[f.key];
    if (f.type === 'yesno') {
      const yn = v && typeof v === 'object' ? v : { answer: v, detail: body[f.key + 'Detail'] };
      const ans = ['yes', 'no'].includes(String(yn.answer || '').toLowerCase()) ? String(yn.answer).toLowerCase() : '';
      if (f.required && !ans) errors.push(f.label);
      values[f.key] = { answer: ans, detail: clean(yn.detail, 1000) };
      continue;
    }
    v = clean(v, f.type === 'textarea' ? 2000 : 200);
    if (f.type === 'choice' && v && !(f.options || []).includes(v)) v = '';
    if (f.required && !v) errors.push(f.label);
    if (f.type === 'ssn') { const digits = v.replace(/\D/g, ''); if (v && digits.length !== 9) errors.push('Social Security number must be 9 digits'); v = digits ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : ''; }
    if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push('Email must be valid');
    if (f.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push(`${f.label} must be a date`);
    values[f.key] = f.pii ? (v ? pii.encrypt(v) : '') : v;
  }
  // repeated employers, when the packet has an employment history section
  const empSection = def.sections.find(s => s.repeat);
  let employers = [];
  if (empSection) {
    const emp = empSection.repeat;
    const rows = Array.isArray(body.employers) ? body.employers : [];
    employers = rows.map(row => { const o = {}; for (const f of emp.fields) o[f.key] = clean(row && row[f.key], 200); return o; }).filter(o => Object.values(o).some(Boolean)).slice(0, emp.max);
    if (employers.length < emp.min) errors.push('List at least one previous employer (or "not applicable")');
  }
  // signatures: typed name + agreement checkbox
  const signatures = {};
  for (const s of SIGNATURES) {
    const sig = (body.signatures || {})[s.key] || {};
    const name = clean(sig.name, 120); const agreed = bool(sig.agreed);
    if (!name || !agreed) errors.push(`Signature required: ${s.title}`);
    signatures[s.key] = { name, agreed, at: nowIso() };
  }
  if (errors.length) throw new HttpError(400, 'Please complete the highlighted items.', errors);
  return { values, employers, signatures, submittedAt: nowIso(), ip: clean(meta && meta.ip, 64), userAgent: clean(meta && meta.userAgent, 200), version: def.version };
}

// Role-aware view of a submission. HR with reveal=true gets decrypted PII; everyone else gets masks.
function viewSubmission(sub, caller, reveal) {
  if (!sub) return null;
  const canSee = caller && caller.can('hr');
  const values = Object.assign({}, sub.values);
  for (const f of FIELDS) {
    if (!f.pii) continue;
    const raw = values[f.key];
    if (!raw) continue;
    if (canSee && reveal) { try { values[f.key] = pii.decrypt(raw); } catch (e) { values[f.key] = '(cannot decrypt: key changed)'; } }
    else values[f.key] = pii.mask(f.type === 'ssn' ? 'ssn' : (f.type === 'date' ? 'date' : 'other'), f.type === 'ssn' ? safeLast4(raw) : raw);
  }
  return Object.assign({}, sub, { values, revealed: !!(canSee && reveal) });
}
function safeLast4(raw) { try { return pii.decrypt(raw); } catch (e) { return ''; } }

// Remove encrypted PII once the request reaches a terminal stage (the HR and payroll system holds the record of truth from day one).
function purge(r) {
  const sub = r.hire && r.hire.packet && r.hire.packet.submission;
  if (!sub || sub.purgedAt) return false;
  for (const k of PII_KEYS) if (sub.values && sub.values[k]) sub.values[k] = '';
  sub.purgedAt = nowIso();
  return true;
}

module.exports = { enabled: !!def, def, FIELDS, PII_KEYS, SIGNATURES, createInvite, inviteStatus, publicView, normalizeSubmission, viewSubmission, purge, INVITE_DAYS };
