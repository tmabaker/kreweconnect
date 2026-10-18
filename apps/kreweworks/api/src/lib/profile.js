'use strict';
// The client profile: everything that differs between one KreweWorks client and the next
// (locations, departments, titles, applications, packet and screening items, HR system, wording).
//
// Client profiles hold client data and NEVER live in this public repository. A deployment
// supplies one in this order:
//   1. KREWEWORKS_PROFILE_PATH   absolute path to a profile JSON file
//   2. src/profiles/active.json  written into the package by the private deploy workflow (gitignored)
//   3. src/profiles/demo.json    the fictional demo client used for local development and tests
const fs = require('fs');
const path = require('path');

const DEMO = path.join(__dirname, '..', 'profiles', 'demo.json');
const ACTIVE = path.join(__dirname, '..', 'profiles', 'active.json');

const DEFAULT_TERMINATION = {
  hrChecks: [
    { key: 'finalPayroll', label: 'Final paycheck and any commission settlement' },
    { key: 'benefitsPaperwork', label: 'Benefits continuation paperwork' },
    { key: 'hrSystemInactive', label: 'Marked inactive in the HR and payroll system' }
  ],
  itChecks: [
    { key: 'signInBlocked', label: 'Sign-in blocked' },
    { key: 'sessionsRevoked', label: 'Sessions and MFA methods revoked' },
    { key: 'groupsRemoved', label: 'Removed from groups and distribution lists' },
    { key: 'mailForwarded', label: 'Mailbox delegated or forwarded' },
    { key: 'vendorsDisabled', label: 'Line-of-business and vendor accounts disabled' },
    { key: 'deviceRecovered', label: 'Device recovered' },
    { key: 'licenseReclaimed', label: 'License reclaimed' }
  ]
};

function resolvePath() {
  if (process.env.KREWEWORKS_PROFILE_PATH) return process.env.KREWEWORKS_PROFILE_PATH;
  if (fs.existsSync(ACTIVE)) return ACTIVE;
  return DEMO;
}

const REQUIRED = ['client', 'stores', 'departments', 'jobTitles', 'applications', 'equipment', 'packetItems', 'screeningItems', 'dayOneItems', 'terminationTypes', 'changeTypes', 'noticeStandards'];

function normalize(raw, source) {
  for (const k of REQUIRED) if (raw[k] === undefined) throw new Error(`KreweWorks profile ${source} is missing "${k}".`);
  const p = Object.assign({}, raw);
  p.source = source;
  p.vocab = Object.assign({ location: 'Location', locations: 'Locations', hrSystem: 'the HR system', portalName: 'Employee Portal' }, raw.vocab || {});
  p.branding = Object.assign({ logo: '/assets/kreweworks-logo.svg', primary: '#0b2a4a', accent: '#c9a227', subtitle: '' }, raw.branding || {});
  p.mail = Object.assign({ itCc: [] }, raw.mail || {});
  p.deploy = Object.assign({}, raw.deploy || {});
  p.tenants = Object.assign({ allowed: [] }, raw.tenants || {});
  p.termination = Object.assign({}, DEFAULT_TERMINATION, raw.termination || {});
  p.features = Object.assign({ confidentialHires: true }, raw.features || {});
  p.workflowHelp = raw.workflowHelp || {};
  p.accessProfiles = raw.accessProfiles || { groups: {} };
  p.itPartner = raw.itPartner || null;
  p.techtools = raw.techtools || null;
  return p;
}

let cached = null;
function load() {
  if (cached) return cached;
  const file = resolvePath();
  cached = normalize(JSON.parse(fs.readFileSync(file, 'utf8')), path.basename(file));
  return cached;
}

// Tests swap profiles in place; everything requires this module and reads through the getter.
function use(raw) { cached = raw ? normalize(raw, 'inline') : null; return load(); }

module.exports = new Proxy({}, {
  get(_, key) {
    if (key === 'use') return use;
    if (key === 'load') return load;
    if (key === 'DEFAULT_TERMINATION') return DEFAULT_TERMINATION;
    return load()[key];
  }
});
