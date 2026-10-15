'use strict';
// health, roles (SWA rolesSource), me, config
const { app } = require('@azure/functions');
const { route, ok, json, readJson } = require('../lib/http');
const access = require('../lib/access');
const config = require('../lib/config');
const graph = require('../lib/graph');
const model = require('../lib/model');
const data = require('../lib/profile');

app.http('health', { methods: ['GET'], authLevel: 'anonymous', route: 'health', handler: route(async () => ok({ ok: true, product: 'KreweWorks', client: data.client.name, branding: { logo: data.branding.logo }, contacts: { hr: config.mail.hr, helpdesk: (data.client.helpdesk || {}).email || '' }, storage: config.storageConnection ? 'azure' : 'memory', graph: graph.configured(), mail: config.mail.enabled, time: new Date().toISOString() }), { anonymous: true }) });

// Static Web Apps posts the signed-in identity here right after login and stores the returned roles in the auth cookie.
app.http('roles', { methods: ['POST'], authLevel: 'anonymous', route: 'roles', handler: route(async (request, context) => {
  const body = await readJson(request);
  const roles = await access.rolesForLogin(body);
  context.log(`roles for ${body && body.userDetails}: ${roles.join(',') || '(none)'}`);
  return ok({ roles });
}, { anonymous: true }) });

app.http('me', { methods: ['GET'], authLevel: 'anonymous', route: 'me', handler: route(async (request, context) => {
  const caller = await access.resolveCaller(request);
  if (!caller) return json(401, { signedIn: false });
  return ok({ signedIn: true, upn: caller.upn, name: caller.name, role: caller.role, stores: caller.stores, tenantId: caller.tid, isBootstrapAdmin: caller.isBootstrapAdmin, hasAccess: !!caller.role });
}, { anonymous: true }) });

app.http('config', { methods: ['GET'], authLevel: 'anonymous', route: 'config', handler: route(async (request, context, caller) => {
  const stageMeta = {};
  for (const [type, def] of Object.entries(model.TYPES)) {
    stageMeta[type] = { label: def.label, stages: Object.fromEntries(Object.entries(def.stages).map(([k, s]) => [k, { label: s.label, owner: s.owner, step: s.step, help: s.help || '' }])) };
  }
  return ok({
    client: data.client, stores: data.stores, departments: data.departments, jobTitles: data.jobTitles,
    applications: data.applications, equipment: data.equipment, accessProfiles: data.accessProfiles.groups,
    packetItems: data.packetItems, screeningItems: data.screeningItems, dayOneItems: data.dayOneItems,
    terminationTypes: data.terminationTypes, changeTypes: data.changeTypes, noticeStandards: data.noticeStandards,
    workflow: stageMeta, personStatus: model.PERSON_STATUS, roles: access.ROLES,
    // Optional NOIT Tech Tools deep links for the IT lane, per client (profile.techtools: page names under techtoolsBase).
    techtools: data.techtools ? Object.assign({ base: config.techtoolsBase }, Object.fromEntries(Object.entries(data.techtools).map(([k, v]) => [k, `${config.techtoolsBase}/${v}`]))) : null,
    vocab: data.vocab, branding: data.branding, features: data.features, itPartner: data.itPartner,
    termination: { hrChecks: data.termination.hrChecks, itChecks: data.termination.itChecks },
    directoryAvailable: graph.configured(), mailEnabled: config.mail.enabled,
    me: { upn: caller.upn, name: caller.name, role: caller.role, stores: caller.stores }
  });
}) });
