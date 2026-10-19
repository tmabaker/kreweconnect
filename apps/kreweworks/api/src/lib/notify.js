'use strict';
// Email notifications at each hand-off. Sent as the portal mailbox through Graph (Taila Agent, Mail.Send).
// Never includes passwords, SSNs, screening detail or HR-only notes. Every mail links back to the request.
const config = require('./config');
const graph = require('./graph');
const model = require('./model');
const people = require('./people');
const data = require('./profile');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const link = (r) => `${config.baseUrl}/#/requests/${r.id}`;
const storeName = (id) => (people.storeById(id) || {}).name || id || '';
const fmtDate = (d) => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';

function row(label, value) { return value ? `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap">${esc(label)}</td><td style="padding:4px 0">${esc(value)}</td></tr>` : ''; }

function checklistHtml(c) {
  if (!c) return '<p>IT checklist not completed.</p>';
  const apps = data.applications.filter(a => c.applications && c.applications[a.key]).map(a => a.label);
  const eq = data.equipment.filter(e => c.equipment && c.equipment[e.key] && c.equipment[e.key].needed).map(e => `${e.label}${c.equipment[e.key].atDesk ? ' (already at desk)' : ''}`);
  const hw = { existing_on_site: `Existing device on site: ${c.endpointName || 'endpoint name missing'}`, needs_purchase: 'Hardware purchase needed', shared_workstation: 'Shared workstation (no dedicated device)', none: 'No computer (mobile only)' }[c.hardware] || '';
  return `<table>${row('Preferred display name', c.preferredDisplayName)}${row('Desk / work area', c.workArea)}${row('Hardware', hw)}${row('Phone extension', c.extension)}${row('Start time', c.startTime)}${row('Applications', apps.join(', '))}${row('Other applications', c.otherApplications)}${row('Equipment needed', eq.join(', ') || 'None')}${row('Printer assignment', c.printerAssignment)}${row('Application exceptions', c.applicationExceptions)}${row('Copy access from', c.copyAccessFrom)}${row('Notes', c.notes)}</table>`;
}

function personBlock(p, r) {
  return `<table>${row('Name', people.fullName(p))}${row('Preferred name', p.preferredName)}${row(data.vocab.location, storeName(r.storeId))}${row('Department', r.department)}${row('Job title', r.title)}${row('Direct manager', r.managerName ? `${r.managerName} (${r.managerUpn})` : r.managerUpn)}${row('Mobile', p.mobile)}${row('Employee number', p.employeeNumber || (r.hire && r.hire.employeeNumber))}</table>`;
}

function wrap(title, body, r, noButton) {
  const c = data.branding.primary;
  const button = noButton ? '' : `<p style="margin-top:18px"><a href="${link(r)}" style="background:${c};color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Open request ${esc(r.id)}</a></p>`;
  const foot = noButton ? `${esc(data.client.name)}. Please do not reply with personal identifiers by email; the secure form handles them.` : `${esc(data.client.name)} ${esc(data.vocab.portalName)}. Temporary passwords are never sent by email. Reply to this message to reach the support desk.`;
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;max-width:720px"><h2 style="color:${c};margin:0 0 8px">${esc(title)}</h2>${body}${button}<p style="color:#777;font-size:12px">${foot}</p></div>`;
}

// Decide recipients and content for a transition. Returns null when nothing should be sent.
function compose(r, action, person, actor) {
  const p = person || { firstName: '', lastName: '' };
  const name = people.fullName(p) || 'the employee';
  const mgr = r.managerUpn ? [r.managerUpn] : [];
  const creator = r.createdBy && r.createdBy !== r.managerUpn ? [r.createdBy] : [];
  const hr = [config.mail.hr];
  const it = [config.mail.it];
  const itCc = config.mail.itCc || [];
  const cred = Object.assign({ employee: 'Sent to the employee by text message', manager: 'Sent to the direct manager by encrypted email', firstLogin: 'once you receive the encrypted copy, send the first login calendar invitation to the employee, yourself and {it}. Title it "New Employee Onboarding". Do not put the password in the invitation.' }, data.credentialDelivery || {});
  const subjectBase = `${r.confidential ? '[Confidential] ' : ''}[${r.id}] ${name}, ${storeName(r.storeId)}`;

  if (r.type === 'hire') {
    switch (action) {
      case 'packet_invite': { const inv = r.hire.packet.invite || {}; if (!inv.sentTo) return null; const url = `${config.baseUrl}/apply.html?t=${inv.token}`;
        const pk = data.packet || {}; const what = pk.inviteSummary || 'contact details, employment history and the consents the position requires';
        return { to: [inv.sentTo], cc: [], subject: `Your ${data.client.name} pre-employment packet`, title: `Welcome from ${storeName(r.storeId)}`, noButton: true, body: `<p>Hello ${esc(p.firstName || '')},</p><p>${esc(r.managerName || 'Your hiring manager')} has asked you to complete the ${esc(data.client.name)} pre-employment packet online for the <b>${esc(r.title)}</b> position at <b>${esc(storeName(r.storeId))}</b>.</p><p><a href="${url}" style="background:${data.branding.primary};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open your packet</a></p><p>The link is personal to you and works until ${esc(fmtDate((inv.expiresAt || '').slice(0, 10)))}. It covers ${esc(what)}. Your Social Security number and date of birth are encrypted and seen only by Human Resources.</p><p>Questions? Contact ${esc(r.managerName || 'your hiring manager')}.</p>` }; }
      case 'packet_submitted': return { to: hr, cc: mgr.concat(creator), subject: `Packet submitted online: ${subjectBase}`, title: 'Pre-employment packet submitted', body: `<p><b>${esc(name)}</b> completed the online pre-employment packet for ${esc(r.title)} at ${esc(storeName(r.storeId))}. All consents are signed. HR can review it, print it for the screening providers${(data.packet && data.packet.backgroundScreen && data.packet.backgroundScreen.vendor) ? ` (${esc(data.packet.backgroundScreen.vendor)})` : ''}, and record the results on the request.</p>${personBlock(p, r)}` };
      case 'packet_sent': return { to: hr, cc: mgr, subject: `New hire packet submitted: ${subjectBase}`, title: 'A pre-employment packet is on its way to HR', body: `<p>${esc(actor.name)} marked the packet for <b>${esc(name)}</b> as sent to HR. Please acknowledge it in the portal to start screening.</p>${personBlock(p, r)}` };
      case 'approve': return { to: mgr.concat(creator), cc: hr, subject: `Approved for hire: ${subjectBase}`, title: 'Approved for hire', body: `<p><b>${esc(name)}</b> is approved for hire. Next steps for the hiring manager:</p><ol><li>Extend the offer and record the accepted start date in the portal.</li><li>Complete the IT checklist (desk, endpoint name, extension, applications, equipment).</li></ol><p>HR sends the New Hire Notice to IT as soon as both are done. Minimum notice: ${esc(data.noticeStandards[0].minimum.toLowerCase())} for an account with an existing device, ${esc(data.noticeStandards[1].minimum.toLowerCase())} when equipment or custom applications are needed.</p>${personBlock(p, r)}` };
      case 'decline': return { to: mgr.concat(creator), cc: hr, subject: `Not approved for hire: ${subjectBase}`, title: 'Not approved for hire', body: `<p>HR has marked <b>${esc(name)}</b> as not approved for hire. Contact HR with any questions.</p>` };
      case 'offer_accepted': return { to: hr, cc: mgr, subject: `Start date set (${r.hire.startDate}): ${subjectBase}`, title: 'Offer accepted, start date set', body: `<p><b>${esc(name)}</b> starts on <b>${esc(fmtDate(r.hire.startDate))}</b>${r.hire.startTime ? ` at ${esc(r.hire.startTime)}` : ''}.</p><p>IT checklist: ${r.stage === 'checklist_complete' ? 'complete. HR can send the New Hire Notice.' : 'still due from the hiring manager.'}</p>${personBlock(p, r)}` };
      case 'submit_checklist': return r.stage === 'checklist_complete' ? { to: hr, cc: mgr, subject: `Ready for New Hire Notice: ${subjectBase}`, title: 'IT checklist complete', body: `<p>The IT checklist for <b>${esc(name)}</b> is complete and the start date is ${esc(fmtDate(r.hire.startDate))}. HR can assign the employee number and send the New Hire Notice to IT.</p>${checklistHtml(r.hire.checklist)}` } : null;
      case 'send_notice': return { to: it, cc: mgr.concat(hr, itCc), subject: `New Hire Notice: ${name} starts ${r.hire.startDate} at ${storeName(r.storeId)} (${r.id})`, title: 'New Hire Notice', body: `<p>HR has issued the New Hire Notice. Start date <b>${esc(fmtDate(r.hire.startDate))}</b>${r.hire.startTime ? ` at ${esc(r.hire.startTime)}` : ''}.</p>${personBlock(p, r)}<h3 style="margin:14px 0 6px">IT checklist</h3>${checklistHtml(r.hire.checklist)}${r.hire.notice.ticketNote ? `<p><b>HR note:</b> ${esc(r.hire.notice.ticketNote)}</p>` : ''}<p>IT: open the request to mark it in progress and record the work email, license, endpoint and credential delivery.</p>` };
      case 'it_return': return { to: mgr.concat(creator), cc: hr, subject: `Information needed: ${subjectBase}`, title: 'IT needs more information', body: `<p>IT returned the request for <b>${esc(name)}</b>: ${esc(r.hire.it.returnedNote || '')}</p><p>Update the IT checklist in the portal and resubmit.</p>` };
      case 'it_complete': return { to: mgr.concat(hr), cc: creator, subject: `Ready for day one: ${subjectBase}`, title: 'Account and equipment are ready', body: `<p>IT has completed setup for <b>${esc(name)}</b>.</p><table>${row('Work email', r.hire.it.upn)}${row('License', r.hire.it.license)}${row('Endpoint', r.hire.it.endpointName)}${row('Extension', r.hire.it.extension)}${row('Temporary password', r.hire.it.credentialDelivered ? cred.employee : 'Pending')}${row('Manager copy', r.hire.it.managerCredentialDelivered ? cred.manager : 'Pending')}</table><p><b>Direct manager:</b> ${esc(cred.firstLogin).replace('{it}', esc(config.mail.it))}</p>` };
      case 'started': return { to: hr, cc: mgr, subject: `Started today: ${subjectBase}`, title: 'Employee started', body: `<p><b>${esc(name)}</b> has started. HR day-one tasks (payroll onboarding in ${esc(data.vocab.hrSystem)}, paperwork, welcome notice) are tracked on the request.</p>` };
      case 'withdraw': case 'offer_declined': case 'no_show': return { to: hr.concat(mgr), cc: it, subject: `Withdrawn: ${subjectBase}`, title: 'Hire withdrawn', body: `<p>The hire request for <b>${esc(name)}</b> was withdrawn by ${esc(actor.name)}. ${r.stage === 'withdrawn' && r.hire.notice.sentAt ? 'IT: cancel any account or equipment work in progress.' : ''}</p>` };
      default: return null;
    }
  }
  if (r.type === 'change') {
    const c = r.change;
    const kinds = c.changeTypes.map(k => (data.changeTypes.find(x => x.key === k) || {}).label || k).join(', ');
    const detail = `<table>${row('Changes', kinds)}${row('Effective', fmtDate(c.effectiveDate))}${c.to.storeId ? row(`To ${data.vocab.location.toLowerCase()}`, storeName(c.to.storeId)) : ''}${row('To department', c.to.department)}${row('To title', c.to.title)}${row('To manager', c.to.managerName || c.to.managerUpn)}${row('Endpoint', c.to.endpointName)}${row('Extension', c.to.extension)}${row('Desk / area', c.to.workArea)}${row('Access to add', c.accessAdd)}${row('Access to remove', c.accessRemove)}${row('Equipment', c.equipment)}${row('Reason', c.reason)}</table>`;
    switch (action) {
      case 'created': return { to: hr, cc: mgr.concat(creator), subject: `Employee change submitted: ${subjectBase}`, title: 'Employee change request', body: `<p>${esc(actor.name)} submitted a change for <b>${esc(name)}</b>.</p>${detail}` };
      case 'hr_approve': return { to: it, cc: hr.concat(mgr, itCc), subject: `Employee change for IT: ${name} (${r.id})`, title: 'Employee change approved by HR', body: `<p>Apply the following for <b>${esc(name)}</b> (${esc(r.change.from.workEmail || '')}).</p>${detail}${c.hrNotes ? `<p><b>HR note:</b> ${esc(c.hrNotes)}</p>` : ''}` };
      case 'hr_decline': return { to: mgr.concat(creator), cc: hr, subject: `Change declined: ${subjectBase}`, title: 'Change declined by HR', body: `<p>${esc(c.hrNotes || '')}</p>` };
      case 'it_return': return { to: hr, cc: mgr, subject: `Clarification needed: ${subjectBase}`, title: 'IT needs clarification', body: `<p>${esc(c.it.notes || '')}</p>` };
      case 'it_complete': return { to: mgr.concat(creator), cc: hr, subject: `Change applied: ${subjectBase}`, title: 'Change applied', body: `<p>IT has applied the change for <b>${esc(name)}</b>. Confirm in the portal once the employee has what they need.</p>${detail}${c.it.notes ? `<p><b>IT note:</b> ${esc(c.it.notes)}</p>` : ''}` };
      case 'reopen': return { to: it, cc: hr, subject: `Reopened: ${subjectBase}`, title: 'Change reopened', body: `<p>${esc(actor.name)} reopened the change for <b>${esc(name)}</b>.</p>` };
      default: return null;
    }
  }
  if (r.type === 'termination') {
    const t = r.termination;
    const urgent = t.involuntary ? 'URGENT: ' : '';
    const detail = `<table>${row('Last day', fmtDate(t.lastDay))}${row('Access ends', t.accessEndAt)}${row('Type', (data.terminationTypes.find(x => x.key === t.terminationType) || {}).label)}${row('Work email', (person && person.workEmail) || '')}${row('Device', t.deviceEndpointName)}${row('Equipment to recover', t.equipmentToRecover)}${row('Mailbox delegate', t.mailboxDelegate)}${row('Forward mail for', t.forwardDays ? `${t.forwardDays} days` : '')}${row('Applications to deactivate', (t.deactivateApps || []).map(k => (data.applications.find(a => a.key === k) || {}).label || k).join(', '))}${row('Manager notes', t.managerNotes)}</table>`;
    switch (action) {
      case 'created': return { to: hr.concat(it), cc: mgr.concat(itCc), subject: `${urgent}Termination: ${subjectBase}`, title: `${urgent}Termination submitted`, body: `<p>${esc(actor.name)} submitted a termination for <b>${esc(name)}</b>.${t.involuntary ? ' <b>Involuntary: IT should block sign-in at the access end time, before the employee is informed where possible.</b>' : ''}</p>${detail}` };
      case 'it_complete': return { to: hr.concat(mgr), subject: `Access removed: ${subjectBase}`, title: 'IT offboarding complete', body: `<p>Access for <b>${esc(name)}</b> has been removed.</p><table>${data.termination.itChecks.map(c => row(c.label, t.it[c.key] ? 'Yes' : 'No')).join('')}</table>${t.it.notes ? `<p><b>IT note:</b> ${esc(t.it.notes)}</p>` : ''}` };
      case 'withdraw': return { to: hr.concat(it), cc: mgr, subject: `Termination withdrawn: ${subjectBase}`, title: 'Termination withdrawn', body: `<p>${esc(actor.name)} withdrew the termination for <b>${esc(name)}</b>. IT: stop any offboarding work in progress.</p>` };
      default: return null;
    }
  }
  return null;
}

async function send(r, action, person, actor, context) {
  let msg;
  try { msg = compose(r, action, person, actor); } catch (e) { if (context) context.warn('notify compose failed', e); return { sent: false, reason: 'compose failed' }; }
  if (!msg) return { sent: false, reason: 'no notification for this action' };
  const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean).map(s => s.toLowerCase())));
  const to = uniq(msg.to); const cc = uniq(msg.cc).filter(x => !to.includes(x));
  const summary = { to, cc, subject: msg.subject };
  if (!config.mail.enabled) { if (context) context.log('notify (disabled):', JSON.stringify(summary)); return Object.assign({ sent: false, reason: 'mail disabled' }, summary); }
  const message = {
    subject: msg.subject,
    body: { contentType: 'HTML', content: wrap(msg.title, msg.body, r, msg.noButton) },
    toRecipients: to.map(a => ({ emailAddress: { address: a } })),
    ccRecipients: cc.map(a => ({ emailAddress: { address: a } })),
    bccRecipients: config.mail.bcc.map(a => ({ emailAddress: { address: a } })),
    replyTo: [{ emailAddress: { address: config.mail.it } }]
  };
  try { await graph.sendMail(config.mail.from, message); return Object.assign({ sent: true }, summary); }
  catch (e) { if (context) context.error('notify send failed', e); return Object.assign({ sent: false, reason: e.message }, summary); }
}

module.exports = { compose, send, checklistHtml };
