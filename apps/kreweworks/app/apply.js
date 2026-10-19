/* Candidate pre-employment packet. Three modes:
   fill  : /apply.html?t=<token>   candidate completes and submits (anonymous)
   blank : /apply.html?print=blank&name=&position=&store=&manager=   printable blank packet for a manager
   view  : /apply.html?view=<requestId>[&reveal=1]   signed-in review and print of a submitted packet */
(function () {
  'use strict';
  var root = document.getElementById('root');
  var q = new URLSearchParams(location.search);
  var mode = q.get('t') ? 'fill' : (q.get('view') ? 'view' : 'blank');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(d) { if (!d) return ''; var x = new Date(d.length === 10 ? d + 'T12:00:00' : d); return isNaN(x) ? d : x.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function api(method, path, body) { return fetch('/api/' + path, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) { var e = new Error(b.error || ('HTTP ' + r.status)); e.details = b.details; e.status = r.status; throw e; } return b; }); }); }

  var brand = { name: '', logo: '/assets/kreweworks-logo.svg' };
  fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) { if (h && h.client) { brand.name = h.client; if (h.branding && h.branding.logo) brand.logo = h.branding.logo; document.querySelectorAll('.packet-head img').forEach(function (i) { i.src = brand.logo; i.alt = brand.name; }); document.title = brand.name + ' Pre-Employment Packet'; } }).catch(function () {});
  function head(h, title, sub) { return '<div class="packet-head"><img src="' + esc(brand.logo) + '" alt="' + esc(brand.name) + '"><div><h1>' + esc(title) + '</h1><div class="sub">' + esc(sub) + '</div></div></div>'; }
  function headerBlock(h) { return '<table class="kv">' + [['Candidate', h.candidateName], ['Position', h.position], ['Location', h.store], ['Department', h.department], ['Hiring manager', h.managerName]].filter(function (x) { return x[1]; }).map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>'; }

  // ---------- form rendering ----------
  function fieldHtml(f, value, readonly) {
    var id = 'f_' + f.key; var v = value == null ? '' : value; var req = f.required ? ' <span class="req">*</span>' : '';
    if (readonly) { if (f.type === 'yesno') { var yn = v || {}; return '<div class="field"><label>' + esc(f.label) + '</label><div class="pv">' + esc(yn.answer ? yn.answer.toUpperCase() : '') + (yn.detail ? '. ' + esc(yn.detail) : '') + '</div></div>'; } return '<div class="field"><label>' + esc(f.label) + '</label><div class="pv">' + (v ? esc(v) : '<span class="line"></span>') + '</div></div>'; }
    if (f.type === 'yesno') return '<div class="field"><label>' + esc(f.label) + req + '</label><div class="yn"><label><input type="radio" name="' + id + '" value="yes"> Yes</label><label><input type="radio" name="' + id + '" value="no"> No</label></div>' + (f.detail ? '<input type="text" id="' + id + '_detail" placeholder="' + esc(f.detail) + '">' : '') + '</div>';
    if (f.type === 'textarea') return '<div class="field"><label for="' + id + '">' + esc(f.label) + req + '</label><textarea id="' + id + '" placeholder="' + esc(f.placeholder || '') + '"></textarea></div>';
    var type = { ssn: 'text', month: 'month', date: 'date', tel: 'tel', email: 'email' }[f.type] || 'text';
    var extra = f.type === 'ssn' ? ' inputmode="numeric" autocomplete="off" placeholder="___-__-____" maxlength="11"' : (f.type === 'tel' ? ' autocomplete="tel"' : '');
    return '<div class="field"><label for="' + id + '">' + esc(f.label) + req + '</label><input type="' + type + '" id="' + id + '" value="' + esc(v) + '"' + extra + '>' + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
  }
  function signatureHtml(key, title, readonly, sig) {
    if (readonly) return '<div class="sig"><strong>' + esc(title) + '</strong><div class="row"><div class="col"><label>Signature (typed name)</label><div class="pv">' + (sig && sig.name ? esc(sig.name) : '<span class="line"></span>') + '</div></div><div class="col"><label>Date</label><div class="pv">' + (sig && sig.at ? esc(fmt(sig.at)) : '<span class="line" style="min-width:140px"></span>') + '</div></div></div></div>';
    return '<div class="sig"><label class="check"><input type="checkbox" id="sig_' + key + '_agreed"> I have read and agree to the statement above, and I intend my typed name to serve as my signature.</label><div class="row"><div class="col field"><label for="sig_' + key + '_name">Type your full legal name as your signature <span class="req">*</span></label><input type="text" id="sig_' + key + '_name" autocomplete="name"></div><div class="col field"><label>Date</label><input type="text" value="' + esc(new Date().toLocaleDateString('en-US')) + '" readonly></div></div></div>';
  }
  function sectionHtml(s, d, readonly, sub) {
    var html = '<section class="sheet card"><h2>' + esc(s.title) + '</h2>';
    if (s.notice) html += '<div class="legal">' + esc(s.notice) + '</div>';
    if (s.fields) html += '<div class="grid-2">' + s.fields.map(function (f) { var v = sub ? sub.values[f.key] : (f.prefill && d.header ? ({ position: d.header.position, store: d.header.store })[f.prefill] : ''); return fieldHtml(f, v, readonly); }).join('') + '</div>';
    if (s.repeat) {
      html += '<div id="employers">';
      var rows = sub && sub.employers && sub.employers.length ? sub.employers : [{}, {}, {}];
      rows.forEach(function (row, i) { html += empRow(s.repeat, i, row, readonly); });
      html += '</div>' + (readonly ? '' : '<button type="button" class="btn btn-sm no-print" id="addEmp">+ Add another employer</button>');
    }
    if (s.consent) html += '<div class="legal">' + esc(s.consent) + '</div>' + signatureHtml(s.signature, s.title, readonly, sub && sub.signatures[s.signature]);
    if (s.consents) s.consents.forEach(function (c) { html += '<h3>' + esc(c.title) + '</h3><div class="legal">' + esc(c.text) + '</div>' + signatureHtml(c.key, c.title, readonly, sub && sub.signatures[c.key]); });
    return html + '</section>';
  }
  function empRow(rep, i, row, readonly) { return '<div class="emp-row" data-i="' + i + '"><div class="grid-3">' + rep.fields.map(function (f) { return readonly ? '<div class="field"><label>' + esc(f.label) + '</label><div class="pv">' + (row[f.key] ? esc(row[f.key]) : '<span class="line" style="min-width:120px"></span>') + '</div></div>' : '<div class="field"><label>' + esc(f.label) + (f.required && i === 0 ? ' <span class="req">*</span>' : '') + '</label><input type="' + (f.type === 'month' ? 'month' : 'text') + '" data-emp="' + f.key + '" value="' + esc(row[f.key] || '') + '"></div>'; }).join('') + '</div></div>'; }

  function renderForm(d, readonly, sub) {
    var def = d.definition;
    var html = head(d.header, def.title, def.version) + (readonly ? '' : '<p class="muted">' + esc(def.intro) + '</p>') + headerBlock(d.header);
    if (!readonly && d.expiresAt) html += '<div class="progress">This link works until ' + esc(fmt(d.expiresAt.slice(0, 10))) + '. Your answers are not saved until you submit.</div>';
    html += '<form id="packetForm">' + def.sections.map(function (s) { return sectionHtml(s, d, readonly, sub); }).join('');
    if (!readonly) html += '<div id="errors"></div><div class="sticky-actions"><button class="btn btn-primary" type="submit" id="submitBtn">Submit my packet</button></div>';
    html += '</form>';
    root.innerHTML = html;
    if (readonly) return;
    var rep = def.sections.find(function (s) { return s.repeat; }).repeat;
    document.getElementById('addEmp').addEventListener('click', function () { var c = document.getElementById('employers'); var n = c.children.length; if (n >= rep.max) return; var w = document.createElement('div'); w.innerHTML = empRow(rep, n, {}, false); c.appendChild(w.firstChild); });
    var ssn = document.getElementById('f_ssn'); if (ssn) ssn.addEventListener('input', function () { var dgt = ssn.value.replace(/\D/g, '').slice(0, 9); ssn.value = dgt.length > 5 ? dgt.slice(0, 3) + '-' + dgt.slice(3, 5) + '-' + dgt.slice(5) : (dgt.length > 3 ? dgt.slice(0, 3) + '-' + dgt.slice(3) : dgt); });
    document.getElementById('packetForm').addEventListener('submit', function (e) { e.preventDefault(); submit(def); });
  }
  function readForm(def) {
    var body = { signatures: {}, employers: [] };
    def.sections.forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        if (f.type === 'yesno') { var r = document.querySelector('input[name="f_' + f.key + '"]:checked'); var dt = document.getElementById('f_' + f.key + '_detail'); body[f.key] = { answer: r ? r.value : '', detail: dt ? dt.value : '' }; }
        else { var el = document.getElementById('f_' + f.key); body[f.key] = el ? el.value : ''; }
      });
      if (s.signature) body.signatures[s.signature] = { name: document.getElementById('sig_' + s.signature + '_name').value, agreed: document.getElementById('sig_' + s.signature + '_agreed').checked };
      (s.consents || []).forEach(function (c) { body.signatures[c.key] = { name: document.getElementById('sig_' + c.key + '_name').value, agreed: document.getElementById('sig_' + c.key + '_agreed').checked }; });
    });
    document.querySelectorAll('#employers .emp-row').forEach(function (row) { var o = {}; row.querySelectorAll('[data-emp]').forEach(function (i) { o[i.dataset.emp] = i.value; }); body.employers.push(o); });
    return body;
  }
  function submit(def) {
    var btn = document.getElementById('submitBtn'); btn.disabled = true; btn.textContent = 'Submitting…';
    document.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
    var body = readForm(def);
    var missing = [];
    def.sections.forEach(function (s) { (s.fields || []).forEach(function (f) { if (!f.required) return; var v = body[f.key]; var empty = f.type === 'yesno' ? !v.answer : !v; if (empty) { missing.push(f.label); var el = document.getElementById('f_' + f.key) || document.querySelector('input[name="f_' + f.key + '"]'); if (el) (el.closest('.field') || el).classList.add('invalid'); } }); });
    Object.keys(body.signatures).forEach(function (k) { var s = body.signatures[k]; if (!s.name || !s.agreed) { missing.push('Signature: ' + k.replace(/Signature$/, '')); var el = document.getElementById('sig_' + k + '_name'); if (el) el.closest('.sig').classList.add('invalid'); } });
    if (missing.length) { showErrors(missing); btn.disabled = false; btn.textContent = 'Submit my packet'; return; }
    api('POST', 'apply/' + encodeURIComponent(q.get('t')), body).then(function (res) {
      root.innerHTML = head({}, res.afterSubmit.title, 'Submitted ' + fmt(res.submittedAt)) + '<div class="done"><h1>Thank you</h1><p>Your packet was received on ' + esc(fmt(res.submittedAt)) + '. Here is what happens next:</p><ol style="text-align:left;max-width:560px;margin:14px auto">' + res.afterSubmit.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol><p class="muted small">You can close this page. Your answers cannot be changed online; tell your hiring manager if something needs correcting.</p></div>';
      window.scrollTo(0, 0);
    }).catch(function (e) { showErrors(e.details && e.details.length ? e.details : [e.message]); btn.disabled = false; btn.textContent = 'Submit my packet'; });
  }
  function showErrors(list) { var box = document.getElementById('errors'); box.innerHTML = '<div class="err-list"><strong>Please complete the following:</strong><ul style="margin:6px 0 0 18px">' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'; box.scrollIntoView({ behavior: 'smooth' }); }

  // ---------- modes ----------
  if (mode === 'fill') {
    api('GET', 'apply/' + encodeURIComponent(q.get('t'))).then(function (d) {
      if (d.status === 'submitted') { root.innerHTML = head(d.header, d.definition.title, '') + '<div class="done"><h1>Already submitted</h1><p>This packet was submitted on ' + esc(fmt(d.submittedAt)) + '. Contact your hiring manager if anything needs to change.</p></div>'; return; }
      if (d.status !== 'active') { root.innerHTML = head(d.header, d.definition.title, '') + '<div class="done"><h1>This link has expired</h1><p>Ask your hiring manager to send a new one.</p></div>'; return; }
      renderForm(d, false, null);
    }).catch(function (e) { root.innerHTML = head({}, 'Pre-Employment Packet', '') + '<div class="alert danger">' + esc(e.message) + '</div>'; });
  } else if (mode === 'view') {
    var id = q.get('view'); var reveal = q.get('reveal') === '1';
    api('GET', 'requests/' + encodeURIComponent(id) + '/packet' + (reveal ? '?reveal=1' : '')).then(function (d) {
      var def = d.definition; var sub = d.submission;
      var hdr = head(d.header, def.title, sub ? 'Submitted ' + fmt(sub.submittedAt) + (sub.revealed ? ' (identifiers revealed)' : ' (identifiers masked)') : 'Not submitted yet');
      var top = '<div class="no-print actions" style="margin-bottom:12px"><a class="btn" href="/#/requests/' + esc(id) + '">Back to request</a><button class="btn btn-primary" onclick="window.print()">Print</button>' + (d.canReveal && !reveal ? '<a class="btn btn-danger" href="/apply.html?view=' + esc(id) + '&reveal=1">Reveal identifiers (logged)</a>' : '') + '</div>';
      if (!sub) { root.innerHTML = hdr + top + '<div class="alert info">The candidate has not submitted the online packet. Print a blank packet from the request page if they prefer paper.</div>'; return; }
      renderForm({ definition: def, header: d.header }, true, sub);
      root.insertAdjacentHTML('afterbegin', top);
      // Manager and HR sheets
      var ms = def.managerSection; var m = d.managerSection || {};
      var mhtml = '<section class="sheet card"><h2>' + esc(ms.title) + '</h2><div class="grid-3">' + ms.fields.map(function (f) { var v = m[f.key]; return '<div class="field"><label>' + esc(f.label) + '</label><div class="pv">' + (v ? esc(v) : '<span class="line" style="min-width:120px"></span>') + '</div></div>'; }).join('') + '</div><p>Approved: ' + (m.approvedName ? esc(m.approvedName) + ', ' + esc(fmt(m.approvedAt)) : '<span class="line"></span>') + '</p>' +
        '<h3>To be completed by Al Perret or Human Resources</h3><div class="grid-3">' + ['Drug test', 'Background', 'MVR'].map(function (l, i) { var k = ['drug', 'background', 'mvr'][i]; var v = (d.screening || {})[k]; return '<div class="field"><label>' + l + '</label><div class="pv">' + (v && v !== 'pending' ? esc(v === 'clear' ? 'Clear' : 'Needs attention') : '<span class="line" style="min-width:120px"></span>') + '</div></div>'; }).join('') + '</div></section>';
      var bs = def.backgroundScreen; var cc = d.coleCall || {};
      mhtml += '<section class="sheet card"><h2>' + esc(bs.title) + '</h2><p>' + esc(bs.instruction) + '</p><div class="grid-3"><div class="field"><label>Manager\'s name</label><div class="pv">' + (cc.managerName ? esc(cc.managerName) : '<span class="line"></span>') + '</div></div><div class="field"><label>Date and time called</label><div class="pv">' + (cc.calledAt ? esc(new Date(cc.calledAt).toLocaleString('en-US')) : '<span class="line"></span>') + '</div></div></div></section>';
      var ma = def.medicalAuthorization; var title = d.header.position || '';
      mhtml += '<section class="sheet card"><h2>' + esc(ma.title) + '</h2><table class="kv"><tr><td>Reason for test</td><td>' + esc(ma.reason) + '</td></tr><tr><td>Company name</td><td>' + esc(ma.company) + '</td></tr><tr><td>Location</td><td>' + esc(d.header.store) + '</td></tr><tr><td>Department</td><td>' + esc(d.header.department) + '</td></tr><tr><td>Position</td><td>' + esc(title) + '</td></tr><tr><td>Employee name</td><td>' + esc(d.header.candidateName) + '</td></tr><tr><td>Social Security number</td><td>' + esc(sub.values.ssn || '') + '</td></tr><tr><td>Date</td><td>' + esc(fmt(sub.submittedAt)) + '</td></tr></table><h3>Authorized tests</h3>' + ma.tests.map(function (t) { var on = t.always || (t.titles || []).some(function (x) { return title.toLowerCase().indexOf(x.toLowerCase()) >= 0; }); return '<div>[' + (on ? 'X' : ' ') + '] <strong>' + esc(t.label) + '</strong>' + (t.note ? ' <span class="muted">' + esc(t.note) + '</span>' : '') + '</div>'; }).join('') + '<p style="margin-top:12px">Authorizing name: <span class="line"></span> &nbsp; Signature: <span class="line"></span></p><p class="muted small">' + esc(ma.questions) + '</p></section>';
      document.getElementById('packetForm').insertAdjacentHTML('afterend', mhtml);
    }).catch(function (e) { root.innerHTML = '<div class="alert danger">' + esc(e.message) + '</div>'; });
  } else {
    api('GET', 'packet/definition').then(function (d) {
      var header = { candidateName: q.get('name') || '', position: q.get('position') || '', store: q.get('store') || '', department: q.get('department') || '', managerName: q.get('manager') || '' };
      renderForm({ definition: d.definition, header: header }, true, null);
      root.insertAdjacentHTML('afterbegin', '<div class="no-print actions" style="margin-bottom:12px"><a class="btn" href="/">Back</a><button class="btn btn-primary" onclick="window.print()">Print blank packet</button></div>');
      var ms = d.definition.managerSection;
      document.getElementById('packetForm').insertAdjacentHTML('afterend', '<section class="sheet card"><h2>' + esc(ms.title) + '</h2><div class="grid-3">' + ms.fields.map(function (f) { return '<div class="field"><label>' + esc(f.label) + '</label><div class="pv"><span class="line" style="min-width:140px"></span></div></div>'; }).join('') + '</div><p>Approved: <span class="line"></span> Signature of Manager &nbsp; <span class="line"></span> Printed Name of Manager</p><h3>To be completed by Al Perret or Human Resources</h3><p>Drug test <span class="line" style="min-width:120px"></span> &nbsp; Background <span class="line" style="min-width:120px"></span> &nbsp; MVR <span class="line" style="min-width:120px"></span></p></section>' +
        '<section class="sheet card"><h2>' + esc(d.definition.backgroundScreen.title) + '</h2><p>' + esc(d.definition.backgroundScreen.instruction) + '</p><p>Manager\'s name <span class="line"></span><br>Time called <span class="line"></span><br>Date called <span class="line"></span></p></section>');
      if (q.get('autoprint') === '1') setTimeout(function () { window.print(); }, 400);
    });
  }
})();
