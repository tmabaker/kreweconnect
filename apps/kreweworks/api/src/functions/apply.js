'use strict';
// Candidate-facing endpoints. Anonymous by design: the only secret is the invite token in the URL.
// A token maps to exactly one hire request, expires, and stops accepting input once the packet is submitted.
const { app } = require('@azure/functions');
const { route, ok, json, readJson, HttpError } = require('../lib/http');
const workflow = require('../lib/workflow');
const people = require('../lib/people');
const packet = require('../lib/packet');
const notify = require('../lib/notify');
const config = require('../lib/config');
const { getStore } = require('../lib/store');

async function findByToken(token) {
  const t = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) throw new HttpError(404, 'This link is not valid.');
  const all = await workflow.listAll();
  const r = all.find(x => x.type === 'hire' && x.hire && x.hire.packet && x.hire.packet.invite && x.hire.packet.invite.token === t);
  if (!r) throw new HttpError(404, 'This link is not valid. Ask your hiring manager for a new one.');
  return r;
}

app.http('apply-get', { methods: ['GET'], authLevel: 'anonymous', route: 'apply/{token}', handler: route(async (request) => {
  const r = await findByToken(request.params.token);
  const person = await people.get(r.personId);
  return ok(packet.publicView(r, person));
}, { anonymous: true }) });

app.http('apply-submit', { methods: ['POST'], authLevel: 'anonymous', route: 'apply/{token}', handler: route(async (request, context) => {
  const r = await findByToken(request.params.token);
  const body = await readJson(request);
  const meta = { ip: request.headers.get('x-forwarded-for') || '', userAgent: request.headers.get('user-agent') || '' };
  const saved = await workflow.submitPacket(r, body, meta);
  const person = await people.get(saved.personId);
  // keep the registry in step with what the candidate typed (name, contact), never the encrypted fields
  const v = saved.hire.packet.submission.values;
  if (person) await people.applyOutcome(person, { firstName: v.firstName || person.firstName, lastName: v.lastName || person.lastName, personalEmail: v.email || person.personalEmail, mobile: people.normMobile(v.phone) || person.mobile });
  const notification = await notify.send(saved, 'packet_submitted', person, { upn: 'candidate', name: 'Candidate' }, context);
  return ok({ submitted: true, submittedAt: saved.hire.packet.submission.submittedAt, afterSubmit: packet.def.afterSubmit, notified: !!(notification && notification.sent) });
}, { anonymous: true }) });

// Blank or prefilled printable packet definition for a signed-in manager (no token needed).
app.http('packet-definition', { methods: ['GET'], authLevel: 'anonymous', route: 'packet/definition', handler: route(async () => ok({ definition: packet.def })) });

// HR view of a submitted packet. reveal=1 decrypts the identifiers and writes a timeline entry.
app.http('packet-view', { methods: ['GET'], authLevel: 'anonymous', route: 'requests/{id}/packet', handler: route(async (request, context, caller) => {
  const r = await workflow.get(request.params.id);
  if (!r || !workflow.visibleTo(r, caller)) throw new HttpError(404, 'Request not found.');
  const person = await people.get(r.personId);
  const reveal = request.query.get('reveal') === '1';
  if (reveal && !caller.can('hr')) throw new HttpError(403, 'Only Human Resources can view identifiers.');
  const sub = r.hire && r.hire.packet ? r.hire.packet.submission : null;
  if (reveal && sub && !sub.purgedAt) await workflow.addEvent(r, caller, 'pii_revealed', 'Viewed the candidate identifiers (SSN, date of birth, license).', { hrOnly: true });
  const status = packet.inviteStatus(r);
  const link = r.hire.packet.invite && status === 'active' ? `${config.baseUrl}/apply.html?t=${r.hire.packet.invite.token}` : '';
  return ok({ definition: packet.def, status, link, invite: r.hire.packet.invite ? { createdAt: r.hire.packet.invite.createdAt, expiresAt: r.hire.packet.invite.expiresAt, sentAt: r.hire.packet.invite.sentAt, sentTo: r.hire.packet.invite.sentTo, candidateEmail: r.hire.packet.invite.candidateEmail } : null,
    submission: packet.viewSubmission(sub, caller, reveal), managerSection: caller.can('manager') ? r.hire.managerSection : {}, coleCall: r.hire.packet.coleCall, screening: r.hire.screening,
    header: packet.publicView(r, person).header, canReveal: caller.can('hr') && !!sub && !sub.purgedAt });
}) });
