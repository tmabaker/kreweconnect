'use strict';
// The three buckets (hire, change, termination), their stages, and which role may take which action.
// Each action: to = next stage (null keeps the stage), roles = who may act, requires = payload fields that must be present.
// "Owner" of a stage is who the dashboard shows it to as work waiting on them.

const TERMINAL = ['closed', 'not_approved', 'withdrawn', 'declined', 'cancelled'];

const HIRE = {
  label: 'New hire',
  stages: {
    packet_pending: { label: 'Pre-employment packet in progress', owner: 'manager', step: 1,
      help: 'The candidate completes the application, background, driving record and drug screen consents. Mark the packet as sent to HR once HR has it.',
      actions: {
        packet_invite: { label: 'Send the candidate a link to the packet', to: null, roles: ['manager'] },
        manager_section: { label: 'Manager section (pay, hours, uniforms)', to: null, roles: ['manager'] },
        packet_sent: { label: 'Paper packet sent to HR', to: 'packet_sent', roles: ['manager'], requires: [] }
      } },
    packet_sent: { label: 'Packet with HR', owner: 'hr', step: 2,
      help: 'HR confirms the packet arrived and starts the background check, driving record and drug screen.',
      actions: {
        acknowledge: { label: 'Packet received, screening started', to: 'screening', roles: ['hr'] },
        manager_section: { label: 'Manager section (pay, hours, uniforms)', to: null, roles: ['manager'] },
        cole_called: { label: 'Record the background screen call', to: null, roles: ['manager'] },
        packet_reopen: { label: 'Reopen the online packet for the candidate', to: 'packet_pending', roles: ['hr'], requires: ['note'] }
      } },
    screening: { label: 'HR screening', owner: 'hr', step: 3,
      help: 'HR records each result as it returns, then approves or declines the hire.',
      actions: {
        record_screening: { label: 'Record screening results', to: null, roles: ['hr'] },
        manager_section: { label: 'Manager section (pay, hours, uniforms)', to: null, roles: ['manager'] },
        cole_called: { label: 'Record the background screen call', to: null, roles: ['manager'] },
        approve: { label: 'Approved for hire', to: 'approved', roles: ['hr'] },
        decline: { label: 'Not approved for hire', to: 'not_approved', roles: ['hr'] }
      } },
    approved: { label: 'Approved. Awaiting offer and start date', owner: 'manager', step: 4,
      help: 'The hiring manager extends the offer. Record the accepted start date and complete the IT checklist.',
      actions: {
        offer_accepted: { label: 'Offer accepted, set start date', to: 'offer_accepted', roles: ['manager'], requires: ['startDate'] },
        offer_declined: { label: 'Offer declined', to: 'withdrawn', roles: ['manager'] },
        submit_checklist: { label: 'Save IT checklist', to: null, roles: ['manager'] }
      } },
    offer_accepted: { label: 'Start date set. IT checklist due', owner: 'manager', step: 5,
      help: 'Complete the IT checklist (desk, endpoint, phone extension, applications, equipment). HR cannot send the New Hire Notice without it.',
      actions: {
        submit_checklist: { label: 'Submit IT checklist', to: 'checklist_complete', roles: ['manager'] },
        update_start: { label: 'Change start date', to: null, roles: ['manager'], requires: ['startDate'] }
      } },
    checklist_complete: { label: 'Ready for HR New Hire Notice', owner: 'hr', step: 6,
      help: 'HR assigns the employee number and sends the New Hire Notice. The portal emails IT (which opens the support ticket) with the full checklist attached.',
      actions: {
        send_notice: { label: 'Send New Hire Notice to IT', to: 'it_queue', roles: ['hr'], requires: ['employeeNumber'] },
        submit_checklist: { label: 'Update IT checklist', to: null, roles: ['manager'] },
        update_start: { label: 'Change start date', to: null, roles: ['manager'], requires: ['startDate'] }
      } },
    it_queue: { label: 'IT queue', owner: 'it', step: 7,
      help: 'IT validates the request, prepares the account, applications and device.',
      actions: {
        it_start: { label: 'IT work started', to: 'it_in_progress', roles: ['it'] },
        it_complete: { label: 'IT setup complete', to: 'it_complete', roles: ['it'] },
        it_return: { label: 'Return to manager (information missing)', to: 'offer_accepted', roles: ['it'], requires: ['note'] }
      } },
    it_in_progress: { label: 'IT setup in progress', owner: 'it', step: 7,
      help: 'Account created, licensed, grouped, applications requested, device prepared, temporary password delivered to the employee and the manager by the approved channels.',
      actions: {
        it_update: { label: 'Update IT progress', to: null, roles: ['it'] },
        it_complete: { label: 'IT setup complete', to: 'it_complete', roles: ['it'] },
        it_return: { label: 'Return to manager (information missing)', to: 'offer_accepted', roles: ['it'], requires: ['note'] }
      } },
    it_complete: { label: 'Ready for day one', owner: 'manager', step: 8,
      help: 'The manager schedules the first login appointment. On the start date, mark the employee as started.',
      actions: {
        started: { label: 'Employee started', to: 'started', roles: ['manager', 'hr'] },
        no_show: { label: 'Did not start', to: 'withdrawn', roles: ['manager', 'hr'] }
      } },
    started: { label: 'Started. Day-one tasks', owner: 'hr', step: 9,
      help: 'HR works the day-one list: payroll onboarding in {hrSystem}, paperwork from the manager, the welcome notice.',
      actions: {
        dayone_update: { label: 'Update day-one tasks', to: null, roles: ['hr', 'manager'] },
        close: { label: 'Onboarding complete', to: 'closed', roles: ['hr'] }
      } },
    closed: { label: 'Onboarding complete', owner: null, step: 10, actions: {} },
    not_approved: { label: 'Not approved for hire', owner: null, step: 10, actions: {} },
    withdrawn: { label: 'Withdrawn', owner: null, step: 10, actions: {} }
  }
};

const CHANGE = {
  label: 'Employee change',
  stages: {
    submitted: { label: 'Submitted to HR', owner: 'hr', step: 1,
      help: 'HR reviews the change (transfer, title, department, manager, workspace, access), updates {hrSystem} and any system HR owns, then releases it to IT.',
      actions: {
        hr_approve: { label: 'Approved, send to IT', to: 'it_queue', roles: ['hr'] },
        hr_decline: { label: 'Declined', to: 'declined', roles: ['hr'], requires: ['note'] },
        edit: { label: 'Edit request', to: null, roles: ['manager'] }
      } },
    it_queue: { label: 'IT queue', owner: 'it', step: 2, help: 'IT applies the changes: Microsoft 365 attributes and groups, line-of-business applications, device and extension.',
      actions: {
        it_start: { label: 'IT work started', to: 'it_in_progress', roles: ['it'] },
        it_complete: { label: 'Changes applied', to: 'it_complete', roles: ['it'] },
        it_return: { label: 'Return to HR (clarification needed)', to: 'submitted', roles: ['it'], requires: ['note'] }
      } },
    it_in_progress: { label: 'IT applying changes', owner: 'it', step: 2,
      actions: {
        it_update: { label: 'Update IT progress', to: null, roles: ['it'] },
        it_complete: { label: 'Changes applied', to: 'it_complete', roles: ['it'] },
        it_return: { label: 'Return to HR (clarification needed)', to: 'submitted', roles: ['it'], requires: ['note'] }
      } },
    it_complete: { label: 'Applied. Awaiting confirmation', owner: 'manager', step: 3, help: 'The manager confirms the employee has what they need.',
      actions: {
        close: { label: 'Confirmed, close', to: 'closed', roles: ['manager', 'hr'] },
        reopen: { label: 'Something is missing, reopen for IT', to: 'it_queue', roles: ['manager', 'hr'], requires: ['note'] }
      } },
    closed: { label: 'Complete', owner: null, step: 4, actions: {} },
    declined: { label: 'Declined', owner: null, step: 4, actions: {} },
    withdrawn: { label: 'Withdrawn', owner: null, step: 4, actions: {} }
  }
};

const TERMINATION = {
  label: 'Termination',
  stages: {
    submitted: { label: 'Submitted', owner: 'hr', step: 1,
      help: 'HR records the departure, final payroll and benefits. IT may act immediately on the access end date and time; involuntary departures are flagged urgent.',
      actions: {
        hr_processed: { label: 'HR processed', to: 'hr_processed', roles: ['hr'] },
        it_start: { label: 'IT work started', to: 'it_in_progress', roles: ['it'] },
        edit: { label: 'Edit request', to: null, roles: ['manager'] }
      } },
    hr_processed: { label: 'HR processed. IT queue', owner: 'it', step: 2,
      actions: {
        it_start: { label: 'IT work started', to: 'it_in_progress', roles: ['it'] },
        it_complete: { label: 'Access removed, device recovered', to: 'it_complete', roles: ['it'] }
      } },
    it_in_progress: { label: 'IT removing access', owner: 'it', step: 2,
      actions: {
        it_update: { label: 'Update IT progress', to: null, roles: ['it'] },
        it_complete: { label: 'Access removed, device recovered', to: 'it_complete', roles: ['it'] },
        hr_processed: { label: 'HR processed', to: null, roles: ['hr'] }
      } },
    it_complete: { label: 'IT complete', owner: 'hr', step: 3, help: 'HR closes once final pay, benefits paperwork and the {hrSystem} record are done.',
      actions: {
        hr_processed: { label: 'HR processed', to: null, roles: ['hr'] },
        close: { label: 'Close', to: 'closed', roles: ['hr'] }
      } },
    closed: { label: 'Complete', owner: null, step: 4, actions: {} },
    withdrawn: { label: 'Withdrawn', owner: null, step: 4, actions: {} }
  }
};

const TYPES = { hire: HIRE, change: CHANGE, termination: TERMINATION };

// Client wording: {hrSystem}, {location} and {locations} come from the profile vocabulary, and
// profile.workflowHelp may replace any stage's help text ("hire.started": "...").
(function applyProfileWording() {
  const profile = require('./profile');
  const vocab = profile.vocab || {};
  const fill = (t) => String(t).replace(/\{(\w+)\}/g, (m, k) => (vocab[k] !== undefined ? vocab[k] : m));
  // Online packet actions exist only when the profile defines a packet (and its optional parts).
  const pk = profile.packet || null;
  const vendor = pk && pk.backgroundScreen && pk.backgroundScreen.vendor;
  for (const st of Object.values(HIRE.stages)) {
    const acts = st.actions || {};
    if (!pk) { delete acts.packet_invite; delete acts.packet_reopen; }
    if (!pk || !pk.managerSection) delete acts.manager_section;
    if (!vendor) delete acts.cole_called; else if (acts.cole_called) acts.cole_called.label = `Record the ${vendor} call`;
    if (!pk && acts.packet_sent) acts.packet_sent.label = 'Packet sent to HR';
  }
  for (const [type, def] of Object.entries(TYPES)) {
    for (const [stage, s] of Object.entries(def.stages)) {
      const override = (profile.workflowHelp || {})[`${type}.${stage}`];
      if (override) s.help = override;
      if (s.help) s.help = fill(s.help);
    }
  }
})();

// Person status derived from workflow progress.
const PERSON_STATUS = {
  applicant: 'Applicant', not_approved: 'Not approved for hire', hired: 'Hired, pending start', active: 'Active employee',
  changing: 'Active employee (change in progress)', terminating: 'Termination in progress', terminated: 'Terminated', withdrawn: 'Withdrawn'
};

// Fields only HR and admins may see.
const HR_ONLY_FIELDS = {
  hire: ['screening.notes', 'decision.reason'],
  termination: ['reasonNotes', 'rehireEligible', 'rehireNotes'],
  change: []
};

function stageDef(type, stage) { const t = TYPES[type]; return t && t.stages[stage]; }
function isTerminal(stage) { return TERMINAL.includes(stage); }
function actionDef(type, stage, action) { const s = stageDef(type, stage); return s && s.actions && s.actions[action]; }

// Actions every non-terminal request allows regardless of stage.
const COMMON_ACTIONS = {
  set_confidential: { label: 'Change confidentiality', to: null, roles: ['hr'], types: ['hire'] },
  withdraw: { label: 'Withdraw request', to: 'withdrawn', roles: ['manager', 'hr'], requires: ['note'] },
  reassign_manager: { label: 'Change hiring manager', to: null, roles: ['hr'], requires: ['managerUpn'] }
};

function commonActionsFor(type) {
  const profile = require('./profile');
  return Object.fromEntries(Object.entries(COMMON_ACTIONS).filter(([key, a]) => (!a.types || a.types.includes(type)) && (key !== 'set_confidential' || profile.features.confidentialHires)));
}

module.exports = { commonActionsFor, TYPES, HIRE, CHANGE, TERMINATION, TERMINAL, PERSON_STATUS, HR_ONLY_FIELDS, COMMON_ACTIONS, stageDef, isTerminal, actionDef };
