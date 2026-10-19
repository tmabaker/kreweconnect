/* KreweWorks employee lifecycle portal: single-page app over the /api Functions. No build step.
   Client wording, branding and checklists come from /api/config (the deployment's client profile). */
(function () {
  'use strict';
  var state = { me: null, cfg: null, dirCache: {} };
  var $main = document.getElementById('main');

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(d) { if (!d) return ''; var x = new Date(d.length === 10 ? d + 'T12:00:00' : d); return isNaN(x) ? d : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function fmtWhen(d) { if (!d) return ''; var x = new Date(d); return isNaN(x) ? d : x.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function ago(d) { if (!d) return ''; var ms = Date.now() - new Date(d).getTime(); var m = Math.round(ms / 60000); if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 36) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; }
  function toast(msg, isErr) { var t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'toast'; }, isErr ? 6000 : 3200); }
  function V(k) { return (state.cfg && state.cfg.vocab && state.cfg.vocab[k]) || ({ location: 'Location', locations: 'Locations', hrSystem: 'the HR system' }[k]); }
  function vlow(k) { return V(k).toLowerCase(); }
  function store(id) { return (state.cfg && state.cfg.stores.find(function (s) { return s.id === id; })) || null; }
  function storeName(id) { var s = store(id); return s ? s.name : (id || ''); }
  function stageLabel(type, stage) { var w = state.cfg && state.cfg.workflow[type]; return (w && w.stages[stage] && w.stages[stage].label) || stage; }
  function stageOwner(type, stage) { var w = state.cfg && state.cfg.workflow[type]; return (w && w.stages[stage] && w.stages[stage].owner) || ''; }
  function statusLabel(s) { return (state.cfg && state.cfg.personStatus[s]) || s; }
  function can(role) { var r = state.me && state.me.role; if (!r) return false; if (r === 'admin') return true; if (role === 'manager') return ['manager', 'hr'].indexOf(r) >= 0; return r === role; }
  function opt(list, selected, labelKey, valueKey) { return list.map(function (x) { var v = valueKey ? x[valueKey] : x, l = labelKey ? x[labelKey] : x; return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }
  function val(id) { var el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; }
  function badgeType(t) { return '<span class="badge ' + t + '">' + ({ hire: 'Hire', change: 'Change', termination: 'Termination' }[t] || t) + '</span>'; }
  function badgeOwner(o) { return o ? '<span class="badge owner-' + o + '">' + ({ manager: 'Manager', hr: 'HR', it: 'IT' }[o]) + '</span>' : '<span class="badge neutral">Done</span>'; }
  function personStatusBadge(s) { var cls = { active: 'ok', hired: 'ok', applicant: 'neutral', changing: 'warn', terminating: 'danger', terminated: 'danger', not_approved: 'danger', withdrawn: 'neutral' }[s] || 'neutral'; return '<span class="badge ' + cls + '">' + esc(statusLabel(s)) + '</span>'; }

  function api(method, path, body) {
    return fetch('/api/' + path, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(location.pathname + location.hash); throw new Error('Sign in required'); }
        var ct = r.headers.get('content-type') || '';
        return (ct.indexOf('json') >= 0 ? r.json() : r.text()).then(function (b) { if (!r.ok) { var e = new Error((b && b.error) || ('HTTP ' + r.status)); e.status = r.status; e.body = b; throw e; } return b; });
      });
  }

  // ---------- router ----------
  var routes = [
    [/^#\/?$/, home], [/^#\/requests\/?$/, requestsList], [/^#\/requests\/([^/]+)$/, requestDetail],
    [/^#\/people\/?$/, peopleList], [/^#\/people\/([^/]+)$/, personDetail],
    [/^#\/hire\/new$/, hireNew], [/^#\/change\/new$/, changeNew], [/^#\/terminate\/new$/, terminateNew], [/^#\/admin$/, admin]
  ];
  function navigate() {
    var h = location.hash || '#/';
    var qi = h.indexOf('?'); var query = {}; if (qi >= 0) { new URLSearchParams(h.slice(qi + 1)).forEach(function (v, k) { query[k] = v; }); h = h.slice(0, qi); }
    document.querySelectorAll('.topnav a').forEach(function (a) { a.classList.toggle('active', h === '#/' ? a.dataset.nav === 'home' : h.indexOf('#/' + a.dataset.nav) === 0); });
    document.getElementById('newMenu').hidden = true;
    for (var i = 0; i < routes.length; i++) { var m = h.match(routes[i][0]); if (m) { $main.innerHTML = '<div class="loading">Loading…</div>'; window.scrollTo(0, 0); Promise.resolve(routes[i][1](m[1], query)).catch(renderError); return; } }
    $main.innerHTML = '<div class="card"><h1>Page not found</h1><p><a href="#/">Back to home</a></p></div>';
  }
  function renderError(err) { console.error(err); $main.innerHTML = '<div class="alert danger"><strong>Something went wrong.</strong> ' + esc(err.message || err) + '</div><p><a href="#/">Back to home</a></p>'; }

  // ---------- boot ----------
  function applyBranding(cfg) {
    var b = cfg.branding || {}, c = cfg.client || {}, v = cfg.vocab || {};
    var root = document.documentElement.style;
    if (b.primary) root.setProperty('--brand', b.primary);
    if (b.primaryDark) root.setProperty('--brand-dark', b.primaryDark);
    if (b.accent) root.setProperty('--accent', b.accent);
    var title = (c.name ? c.name + ' ' : '') + (v.portalName || 'Employee Portal');
    document.title = title;
    var logo = document.getElementById('brandLogo'); if (b.logo) logo.src = b.logo; logo.alt = c.name || '';
    document.getElementById('brandName').textContent = v.portalName || 'Employee Portal';
    document.getElementById('brandSub').textContent = b.subtitle || c.name || '';
    document.getElementById('footName').textContent = title;
    var hd = c.helpdesk || {};
    if (hd.email) document.getElementById('footHelp').innerHTML = 'Help: <a href="mailto:' + esc(hd.email) + '">' + esc(hd.email) + '</a>' + (hd.phone ? ' · ' + esc(hd.phone) : '');
    document.getElementById('footOps').textContent = 'Powered by KreweWorks' + (c.operatedBy ? ' · Operated by ' + c.operatedBy + (c.name ? ' for ' + c.name : '') : '');
  }

  function boot() {
    api('GET', 'me').then(function (me) {
      state.me = me;
      document.getElementById('userName').textContent = me.name || me.upn;
      document.getElementById('userRole').textContent = me.role ? ({ manager: 'Hiring manager', hr: 'Human Resources', it: 'IT support', admin: 'Administrator' }[me.role]) : 'No access';
      if (!me.hasAccess) { location.replace('/no-access.html'); return; }
      document.querySelectorAll('[data-roles]').forEach(function (a) { a.style.display = a.dataset.roles.split(',').some(can) ? '' : 'none'; });
      return api('GET', 'config').then(function (cfg) { state.cfg = cfg; applyBranding(cfg); navigate(); });
    }).catch(renderError);
    window.addEventListener('hashchange', navigate);
    var nb = document.getElementById('newBtn'), nm = document.getElementById('newMenu');
    nb.addEventListener('click', function (e) { e.stopPropagation(); nm.hidden = !nm.hidden; nb.setAttribute('aria-expanded', String(!nm.hidden)); });
    document.addEventListener('click', function () { nm.hidden = true; });
  }

  // ---------- shared renderers ----------
  function requestTable(rows, emptyText) {
    if (!rows.length) return '<div class="empty">' + esc(emptyText || 'Nothing here.') + '</div>';
    return '<table class="list"><thead><tr><th>Request</th><th>Person</th><th>' + esc(V('location')) + '</th><th>Stage</th><th>Waiting on</th><th>Key date</th><th>Updated</th></tr></thead><tbody>' + rows.map(function (r) {
      var key = r.type === 'hire' ? (r.startDate ? 'Starts ' + fmtDate(r.startDate) : 'Start date not set') : r.type === 'termination' ? 'Last day ' + fmtDate(r.lastDay) : 'Effective ' + fmtDate(r.effectiveDate);
      return '<tr class="click" data-href="#/requests/' + esc(r.id) + '"><td>' + badgeType(r.type) + (r.priority === 'urgent' ? ' <span class="badge danger">Urgent</span>' : '') + (r.confidential ? ' <span class="badge warn">Confidential</span>' : '') + (r.isRehire ? ' <span class="badge warn">Rehire</span>' : '') + '<div class="dim">' + esc(r.id) + '</div></td><td><strong>' + esc(r.personName) + '</strong><div class="dim">' + esc(r.title) + '</div></td><td>' + esc(storeName(r.storeId)) + '</td><td>' + esc(r.stageLabel) + '</td><td>' + badgeOwner(r.owner) + '</td><td>' + esc(key) + '</td><td class="dim">' + esc(ago(r.updatedAt)) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function bindRowLinks() { $main.querySelectorAll('tr[data-href]').forEach(function (tr) { tr.addEventListener('click', function () { location.hash = tr.dataset.href; }); }); }
  function stepper(type, stage) {
    var w = state.cfg.workflow[type]; var stages = Object.keys(w.stages).map(function (k) { return Object.assign({ key: k }, w.stages[k]); }).filter(function (s) { return s.owner; });
    var cur = w.stages[stage] || { step: 99 };
    var seen = {};
    return '<div class="stepper">' + stages.filter(function (s) { if (seen[s.step]) return false; seen[s.step] = 1; return true; }).map(function (s) {
      var cls = s.step < cur.step ? 'done' : (s.key === stage || s.step === cur.step ? 'current' : '');
      return '<div class="step ' + cls + '"><span class="k">' + esc({ manager: 'Manager', hr: 'HR', it: 'IT' }[s.owner]) + '</span>' + esc(s.label) + '</div>';
    }).join('') + '</div>';
  }

  // Autocomplete over the client directory (manager and employee pickers).
  function directoryPicker(id, label, required, placeholder, onPick, initialName, initialUpn) {
    return '<div class="field suggest"><label for="' + id + '">' + esc(label) + (required ? ' <span class="req">*</span>' : '') + '</label><input type="search" id="' + id + '" autocomplete="off" placeholder="' + esc(placeholder || 'Type a name…') + '" value="' + esc(initialName || '') + '"><input type="hidden" id="' + id + 'Upn" value="' + esc(initialUpn || '') + '"><input type="hidden" id="' + id + 'Name" value="' + esc(initialName || '') + '"><div class="suggest-list" id="' + id + 'List" hidden></div><div class="hint" id="' + id + 'Hint">' + (state.cfg.directoryAvailable ? 'Searches the company directory.' : 'Directory lookup is not configured. Type the email address.') + '</div></div>';
  }
  function bindDirectoryPicker(id, onPick) {
    var input = document.getElementById(id), list = document.getElementById(id + 'List'), upn = document.getElementById(id + 'Upn'), name = document.getElementById(id + 'Name'); var timer;
    input.addEventListener('input', function () {
      upn.value = ''; name.value = input.value;
      if (!state.cfg.directoryAvailable) { if (/@/.test(input.value)) { upn.value = input.value.trim().toLowerCase(); } return; }
      clearTimeout(timer); var q = input.value.trim(); if (q.length < 2) { list.hidden = true; return; }
      timer = setTimeout(function () {
        api('GET', 'directory/users?q=' + encodeURIComponent(q) + '&limit=12').then(function (r) {
          list.innerHTML = r.value.map(function (u, i) { return '<div data-i="' + i + '">' + esc(u.displayName) + '<small>' + esc([u.jobTitle, u.companyName].filter(Boolean).join(' · ')) + ' · ' + esc(u.mail) + '</small></div>'; }).join('') || '<div class="dim">No matches</div>';
          list.hidden = false;
          list.querySelectorAll('div[data-i]').forEach(function (d) { d.addEventListener('mousedown', function () { var u = r.value[d.dataset.i]; input.value = u.displayName; upn.value = u.mail || u.upn; name.value = u.displayName; list.hidden = true; if (onPick) onPick(u); }); });
        }).catch(function () { list.hidden = true; });
      }, 220);
    });
    input.addEventListener('blur', function () { setTimeout(function () { list.hidden = true; }, 150); });
  }

  // Picker over the portal's own people registry, with directory import as fallback.
  function personPicker(id, label) {
    return '<div class="field suggest"><label for="' + id + '">' + esc(label) + ' <span class="req">*</span></label><input type="search" id="' + id + '" autocomplete="off" placeholder="Search by name, email, mobile or employee number…"><input type="hidden" id="' + id + 'Id"><div class="suggest-list" id="' + id + 'List" hidden></div><div class="hint">Employees already tracked here appear first. Anyone else can be pulled in from the company directory.</div></div><div id="' + id + 'Card"></div>';
  }
  function bindPersonPicker(id, onPick) {
    var input = document.getElementById(id), list = document.getElementById(id + 'List'), hid = document.getElementById(id + 'Id'), card = document.getElementById(id + 'Card'); var timer;
    function choose(p) { hid.value = p.id; input.value = p.firstName + ' ' + p.lastName; list.hidden = true; card.innerHTML = '<div class="alert info"><strong>' + esc(p.firstName + ' ' + p.lastName) + '</strong> ' + personStatusBadge(p.status) + '<br><span class="small">' + esc([p.title, p.department, storeName(p.storeId)].filter(Boolean).join(' · ')) + (p.workEmail ? ' · ' + esc(p.workEmail) : '') + (p.managerName ? ' · reports to ' + esc(p.managerName) : '') + '</span></div>'; if (onPick) onPick(p); }
    input.addEventListener('input', function () {
      hid.value = ''; card.innerHTML = ''; clearTimeout(timer); var q = input.value.trim(); if (q.length < 2) { list.hidden = true; return; }
      timer = setTimeout(function () {
        Promise.all([api('GET', 'people?q=' + encodeURIComponent(q)), state.cfg.directoryAvailable ? api('GET', 'directory/users?q=' + encodeURIComponent(q) + '&limit=8').catch(function () { return { value: [] }; }) : Promise.resolve({ value: [] })]).then(function (res) {
            var ppl = res[0].value.slice(0, 8), dir = res[1].value.filter(function (u) { return !ppl.some(function (p) { return p.workEmail === (u.mail || u.upn); }); });
            list.innerHTML = ppl.map(function (p, i) { return '<div data-p="' + i + '">' + esc(p.firstName + ' ' + p.lastName) + ' <span class="badge neutral">' + esc(statusLabel(p.status)) + '</span><small>' + esc([p.title, storeName(p.storeId), p.workEmail].filter(Boolean).join(' · ')) + '</small></div>'; }).join('') +
              dir.map(function (u, i) { return '<div data-d="' + i + '">' + esc(u.displayName) + ' <span class="badge">Directory</span><small>' + esc([u.jobTitle, u.companyName, u.mail].filter(Boolean).join(' · ')) + '</small></div>'; }).join('') || '<div class="dim">No matches</div>';
            list.hidden = false;
            list.querySelectorAll('div[data-p]').forEach(function (d) { d.addEventListener('mousedown', function () { choose(ppl[d.dataset.p]); }); });
            list.querySelectorAll('div[data-d]').forEach(function (d) { d.addEventListener('mousedown', function () { var u = dir[d.dataset.d]; input.value = 'Importing ' + u.displayName + '…'; api('POST', 'people/import', { upn: u.mail || u.upn }).then(function (r) { choose(r.person); }).catch(function (e) { toast(e.message, true); input.value = ''; }); }); });
          });
      }, 220);
    });
    input.addEventListener('blur', function () { setTimeout(function () { list.hidden = true; }, 150); });
  }

  // ---------- views ----------
  function home() {
    return api('GET', 'dashboard').then(function (d) {
      var c = d.counts; var role = state.me.role;
      $main.innerHTML =
        '<div class="page-head"><div><h1>Welcome, ' + esc((state.me.name || '').split(' ')[0]) + '</h1><p class="muted">' + ({ manager: 'Start a hire, change or termination and follow it through HR and IT.', hr: 'Your queue shows packets to screen, approvals to make and New Hire Notices to send.', it: 'Your queue shows accounts to build, changes to apply and access to remove.', admin: 'Everything across HR, IT and the stores.' }[role]) + '</p></div>' +
        '<div class="actions"><a class="btn btn-primary" href="#/hire/new">Hire</a><a class="btn" href="#/change/new">Change</a><a class="btn btn-danger" href="#/terminate/new">Terminate</a></div></div>' +
        '<div class="stats"><a class="stat" href="#/requests?scope=queue"><div class="n">' + c.queue + '</div><div class="l">Waiting on ' + ({ manager: 'you', hr: 'HR', it: 'IT', admin: 'anyone' }[role]) + '</div></a><a class="stat" href="#/requests?type=hire"><div class="n">' + c.hire + '</div><div class="l">Open hires</div></a><a class="stat" href="#/requests?type=change"><div class="n">' + c.change + '</div><div class="l">Open changes</div></a><a class="stat" href="#/requests?type=termination"><div class="n">' + c.termination + '</div><div class="l">Open terminations</div></a><a class="stat warn" href="#/requests?type=hire"><div class="n">' + c.startingSoon + '</div><div class="l">Starting within 7 days</div></a><a class="stat ' + (c.late ? 'danger' : '') + '" href="#/requests"><div class="n">' + c.late + '</div><div class="l">Past due</div></a></div>' +
        (d.late.length ? '<div class="card"><div class="card-head"><h2>Past due</h2><span class="dim">Start date or last day has passed and the work is not finished.</span></div>' + requestTable(d.late) + '</div>' : '') +
        '<div class="card"><div class="card-head"><h2>Waiting on ' + ({ manager: 'you', hr: 'HR', it: 'IT', admin: 'someone' }[role]) + '</h2><a class="small" href="#/requests?scope=queue">See all</a></div>' + requestTable(d.queue, 'Nothing is waiting on you right now.') + '</div>' +
        (d.startingSoon.length ? '<div class="card"><div class="card-head"><h2>Starting within 7 days</h2></div>' + requestTable(d.startingSoon) + '</div>' : '') +
        (role === 'manager' ? '<div class="card"><div class="card-head"><h2>My requests</h2><a class="small" href="#/requests?scope=mine">See all</a></div>' + requestTable(d.mine, 'You have no open requests. Use "New request" to start one.') + '</div>' : '<div class="card"><div class="card-head"><h2>Recent activity</h2><a class="small" href="#/requests">All requests</a></div>' + requestTable(d.recent, 'No requests yet.') + '</div>');
      bindRowLinks();
    });
  }

  function requestsList(_, q) {
    q = q || {}; var type = q.type || '', state_ = q.state || 'open', scope = q.scope || 'all', storeId = q.storeId || '';
    var qs = 'requests?type=' + type + '&state=' + state_ + '&scope=' + scope + '&storeId=' + encodeURIComponent(storeId);
    return api('GET', qs).then(function (r) {
      $main.innerHTML = '<div class="page-head"><div><h1>Requests</h1><p class="muted">' + r.count + ' shown</p></div><div class="actions">' + (can('hr') ? '<a class="btn btn-sm" href="/api/export/requests.csv">Export CSV</a>' : '') + '</div></div>' +
        '<div class="card"><div class="row"><div class="field col"><label>Type</label><select id="fType"><option value="">All</option>' + opt([['hire', 'Hire'], ['change', 'Change'], ['termination', 'Termination']].map(function (x) { return { v: x[0], l: x[1] }; }), type, 'l', 'v') + '</select></div><div class="field col"><label>State</label><select id="fState">' + opt([{ v: 'open', l: 'Open' }, { v: 'closed', l: 'Closed' }, { v: 'all', l: 'All' }], state_, 'l', 'v') + '</select></div><div class="field col"><label>Scope</label><select id="fScope">' + opt([{ v: 'all', l: 'Everything I can see' }, { v: 'queue', l: 'Waiting on my role' }, { v: 'mine', l: 'Created by me or my reports' }], scope, 'l', 'v') + '</select></div><div class="field col"><label>' + esc(V('location')) + '</label><select id="fStore"><option value="">All ' + esc(vlow('locations')) + '</option>' + opt(state.cfg.stores, storeId, 'name', 'id') + '</select></div></div>' + requestTable(r.value, 'No requests match these filters.') + '</div>';
      bindRowLinks();
      ['fType', 'fState', 'fScope', 'fStore'].forEach(function (id) { document.getElementById(id).addEventListener('change', function () { location.hash = '#/requests?type=' + val('fType') + '&state=' + val('fState') + '&scope=' + val('fScope') + '&storeId=' + encodeURIComponent(val('fStore')); }); });
    });
  }

  function peopleList(_, q) {
    q = q || {};
    return api('GET', 'people?q=' + encodeURIComponent(q.q || '') + '&status=' + (q.status || '')).then(function (r) {
      $main.innerHTML = '<div class="page-head"><div><h1>People</h1><p class="muted">Everyone who has moved through this portal: applicants, hires, active staff and departures. ' + r.count + ' shown.</p></div><div class="actions">' + (can('hr') ? '<a class="btn btn-sm" href="/api/export/people.csv">Export CSV</a>' : '') + '</div></div>' +
        '<div class="card"><div class="row"><div class="field col" style="flex:2"><label>Search</label><input type="search" id="pq" placeholder="Name, email, mobile, employee number…" value="' + esc(q.q || '') + '"></div><div class="field col"><label>Status</label><select id="pStatus"><option value="">All</option>' + opt(Object.keys(state.cfg.personStatus).map(function (k) { return { v: k, l: state.cfg.personStatus[k] }; }), q.status || '', 'l', 'v') + '</select></div></div>' +
        (r.value.length ? '<table class="list"><thead><tr><th>Name</th><th>Status</th><th>' + esc(V('location')) + '</th><th>Title</th><th>Work email</th><th>Mobile</th><th>Updated</th></tr></thead><tbody>' + r.value.map(function (p) { return '<tr class="click" data-href="#/people/' + esc(p.id) + '"><td><strong>' + esc(p.firstName + ' ' + p.lastName) + '</strong>' + (p.preferredName ? ' <span class="dim">(' + esc(p.preferredName) + ')</span>' : '') + (p.rehireEligible === 'no' ? ' <span class="badge danger">No rehire</span>' : '') + '</td><td>' + personStatusBadge(p.status) + '</td><td>' + esc(storeName(p.storeId)) + '</td><td>' + esc(p.title) + '</td><td>' + esc(p.workEmail) + '</td><td>' + esc(p.mobile) + '</td><td class="dim">' + esc(ago(p.updatedAt)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">No one matches. New hires appear here as soon as a hire request is started; existing staff are added the first time a change or termination is filed for them.</div>') + '</div>';
      bindRowLinks();
      var t; document.getElementById('pq').addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { location.hash = '#/people?q=' + encodeURIComponent(val('pq')) + '&status=' + val('pStatus'); }, 350); });
      document.getElementById('pStatus').addEventListener('change', function () { location.hash = '#/people?q=' + encodeURIComponent(val('pq')) + '&status=' + val('pStatus'); });
    });
  }

  function personDetail(id) {
    return api('GET', 'people/' + encodeURIComponent(id)).then(function (r) {
      var p = r.person;
      var prev = (p.previousEmployment || []).map(function (e) { return '<li>' + esc(statusLabel(e.status)) + (e.storeId ? ' at ' + esc(storeName(e.storeId)) : '') + (e.title ? ' as ' + esc(e.title) : '') + (e.hireDate ? ', hired ' + fmtDate(e.hireDate) : '') + (e.lastDay ? ', last day ' + fmtDate(e.lastDay) : '') + (e.rehireEligible ? ', rehire: ' + esc(e.rehireEligible) : '') + '</li>'; }).join('');
      $main.innerHTML = '<div class="page-head"><div><h1>' + esc(p.firstName + ' ' + p.lastName) + ' ' + personStatusBadge(p.status) + '</h1><p class="muted">' + esc([p.title, p.department, storeName(p.storeId)].filter(Boolean).join(' · ')) + '</p></div><div class="actions">' +
        (['active', 'changing'].indexOf(p.status) >= 0 ? '<a class="btn" href="#/change/new?person=' + esc(p.id) + '">Change</a><a class="btn btn-danger" href="#/terminate/new?person=' + esc(p.id) + '">Terminate</a>' : '') +
        (['terminated', 'not_approved', 'withdrawn'].indexOf(p.status) >= 0 ? '<a class="btn btn-primary" href="#/hire/new?person=' + esc(p.id) + '">Rehire / reapply</a>' : '') + '</div></div>' +
        (p.rehireEligible === 'no' ? '<div class="alert danger"><strong>HR marked this person as not eligible for rehire.</strong> ' + esc(p.rehireNotes || '') + '</div>' : (p.rehireEligible === 'review' && p.status === 'terminated' ? '<div class="alert warn">Rehire eligibility needs HR review before any new hire request.</div>' : '')) +
        '<div class="row"><div class="col card"><h2>Details</h2><table class="kv">' + [['Preferred name', p.preferredName], ['Work email', p.workEmail], ['Personal email', p.personalEmail], ['Mobile', p.mobile], ['Employee number', p.employeeNumber], ['Direct manager', p.managerName ? p.managerName + ' (' + p.managerUpn + ')' : p.managerUpn], ['Hire date', fmtDate(p.hireDate)], ['Last day', fmtDate(p.lastDay)], can('hr') ? ['Departure type', p.terminationType] : null, can('hr') ? ['Rehire eligible', p.rehireEligible] : null, can('hr') ? ['HR notes', p.notes] : null].filter(function (x) { return x && x[1]; }).map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>' + (prev ? '<h3>Previous employment on file</h3><ul>' + prev + '</ul>' : '') + (can('hr') ? '<p class="small" style="margin-top:12px"><a href="#" id="editPerson">Edit details (HR)</a></p>' : '') + '</div>' +
        '<div class="col card"><h2>History</h2>' + (r.requests.length ? '<table class="list"><thead><tr><th>Request</th><th>Stage</th><th>Date</th></tr></thead><tbody>' + r.requests.map(function (q) { return '<tr class="click" data-href="#/requests/' + esc(q.id) + '"><td>' + badgeType(q.type) + ' <span class="dim">' + esc(q.id) + '</span></td><td>' + esc(q.stageLabel) + '</td><td>' + esc(fmtDate(q.startDate || q.lastDay || q.effectiveDate || q.createdAt)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">No requests yet.</div>') + '</div></div>';
      bindRowLinks();
      var ep = document.getElementById('editPerson'); if (ep) ep.addEventListener('click', function (e) { e.preventDefault(); editPersonForm(p); });
    });
  }
  function editPersonForm(p) {
    var html = '<div class="card"><h2>Edit ' + esc(p.firstName + ' ' + p.lastName) + '</h2><div class="grid-2">' + [['firstName', 'First name'], ['lastName', 'Last name'], ['preferredName', 'Preferred name'], ['personalEmail', 'Personal email'], ['mobile', 'Mobile'], ['employeeNumber', 'Employee number'], ['workEmail', 'Work email']].map(function (f) { return '<div class="field"><label>' + f[1] + '</label><input type="text" id="e_' + f[0] + '" value="' + esc(p[f[0]] || '') + '"></div>'; }).join('') +
      '<div class="field"><label>Rehire eligible</label><select id="e_rehireEligible">' + opt([{ v: '', l: 'Not set' }, { v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }, { v: 'review', l: 'Needs review' }], p.rehireEligible || '', 'l', 'v') + '</select></div></div><div class="field"><label>HR notes (HR only)</label><textarea id="e_notes">' + esc(p.notes || '') + '</textarea></div><div class="field"><label>Rehire notes (HR only)</label><textarea id="e_rehireNotes">' + esc(p.rehireNotes || '') + '</textarea></div><div class="actions"><button class="btn btn-primary" id="saveP">Save</button><button class="btn" id="cancelP">Cancel</button></div></div>';
    var wrap = document.createElement('div'); wrap.innerHTML = html; $main.prepend(wrap);
    document.getElementById('cancelP').addEventListener('click', function () { wrap.remove(); });
    document.getElementById('saveP').addEventListener('click', function () {
      var body = {}; ['firstName', 'lastName', 'preferredName', 'personalEmail', 'mobile', 'employeeNumber', 'workEmail', 'rehireEligible', 'notes', 'rehireNotes'].forEach(function (k) { body[k] = val('e_' + k); });
      api('PATCH', 'people/' + p.id, body).then(function () { toast('Saved'); navigate(); }).catch(function (e) { toast(e.message, true); });
    });
  }

  // ---------- new hire ----------
  function hireNew(_, q) {
    q = q || {};
    var pre = q.person ? api('GET', 'people/' + q.person).then(function (r) { return r.person; }).catch(function () { return null; }) : Promise.resolve(null);
    return pre.then(function (p) {
      var myStores = state.me.stores.indexOf('*') >= 0 ? state.cfg.stores : state.cfg.stores.filter(function (s) { return state.me.stores.indexOf(s.id) >= 0; });
      $main.innerHTML = '<div class="page-head"><div><h1>Hire an employee</h1><p class="muted">This starts the record HR, IT and you will share from application to day one. Nothing here replaces the paperwork in ' + esc(V('hrSystem')) + '; it routes the request and tracks the status.</p></div></div>' +
        (p ? '<div class="alert warn"><strong>Rehire or reapplication for ' + esc(p.firstName + ' ' + p.lastName) + '</strong> (' + esc(statusLabel(p.status)) + (p.rehireEligible ? ', rehire eligible: ' + esc(p.rehireEligible) : '') + '). The previous history stays on the record.' + (p.rehireEligible === 'no' ? ' <strong>HR has marked this person as not eligible for rehire. Talk to HR before proceeding.</strong>' : '') + '</div>' : '') +
        '<form id="hireForm" class="card"><input type="hidden" id="personId" value="' + esc(p ? p.id : '') + '">' +
        '<fieldset><legend>Candidate</legend><div class="grid-3"><div class="field"><label>First name <span class="req">*</span></label><input type="text" id="firstName" required value="' + esc(p ? p.firstName : '') + '"></div><div class="field"><label>Last name <span class="req">*</span></label><input type="text" id="lastName" required value="' + esc(p ? p.lastName : '') + '"></div><div class="field"><label>Preferred name <span class="opt">(optional)</span></label><input type="text" id="preferredName" value="' + esc(p ? p.preferredName : '') + '"></div><div class="field"><label>Mobile number <span class="req">*</span></label><input type="tel" id="mobile" required placeholder="(225) 555-0100" value="' + esc(p ? p.mobile : '') + '"><div class="hint">The temporary password is delivered by text message, so this is required.</div></div><div class="field"><label>Personal email <span class="opt">(optional)</span></label><input type="email" id="personalEmail" value="' + esc(p ? p.personalEmail : '') + '"></div></div><div id="dupBox"></div></fieldset>' +
        '<fieldset><legend>Position</legend><div class="grid-3"><div class="field"><label>' + esc(V('location')) + ' <span class="req">*</span></label><select id="storeId" required><option value="">Choose…</option>' + opt(myStores, p ? p.storeId : (myStores.length === 1 ? myStores[0].id : ''), 'name', 'id') + '</select></div><div class="field"><label>Department <span class="req">*</span></label><select id="department" required><option value="">Choose…</option>' + opt(state.cfg.departments, p ? p.department : '') + '</select></div><div class="field"><label>Job title <span class="req">*</span></label><select id="title" required><option value="">Choose…</option>' + opt(state.cfg.jobTitles, p ? p.title : '') + '</select></div></div>' + directoryPicker('manager', 'Direct manager', true, 'Who will this employee report to?', null, p ? p.managerName : '', p ? p.managerUpn : '') + '<div id="profileBox"></div><div class="grid-2"><div class="field"><label>Target start date <span class="opt">(if known)</span></label><input type="date" id="targetStartDate"></div><div class="field"><label>Priority</label><select id="priority"><option value="normal">Normal</option><option value="urgent">Urgent (explain in notes)</option></select></div>' + (state.cfg.features && state.cfg.features.confidentialHires ? '<div class="field"><label class="check" style="margin-top:28px"><input type="checkbox" id="confidential"> Confidential hire</label><div class="hint">Only HR, you and the hiring manager see it until it reaches IT.</div></div>' : '') + '</div></fieldset>' +
        '<fieldset><legend>Pre-employment packet</legend><p class="small muted">Check what the candidate has completed so far. You can update this later and mark the packet as sent to HR from the request page.</p><div class="checks">' + state.cfg.packetItems.map(function (i) { return '<label class="check"><input type="checkbox" id="pk_' + i.key + '"> ' + esc(i.label) + '</label>'; }).join('') + '</div><div class="field" style="margin-top:10px"><label>Notes for HR <span class="opt">(optional)</span></label><textarea id="notes" placeholder="Pay plan, schedule, anything HR should know."></textarea></div></fieldset>' +
        '<div class="sticky-actions"><a class="btn" href="#/">Cancel</a><button class="btn btn-primary" type="submit">Create hire request</button></div></form>';
      bindDirectoryPicker('manager');
      var dupT; function checkDups() { clearTimeout(dupT); dupT = setTimeout(function () { if (!val('firstName') || !val('lastName')) return; api('POST', 'people/duplicates', { firstName: val('firstName'), lastName: val('lastName'), mobile: val('mobile'), personalEmail: val('personalEmail') }).then(function (r) { var hits = r.value.filter(function (h) { return h.person.id !== val('personId'); }); document.getElementById('dupBox').innerHTML = hits.length ? '<div class="alert warn"><strong>Possible existing record' + (hits.length > 1 ? 's' : '') + ':</strong><ul style="margin:6px 0 0 18px">' + hits.map(function (h) { return '<li><a href="#/hire/new?person=' + esc(h.person.id) + '">' + esc(h.person.firstName + ' ' + h.person.lastName) + '</a> (' + esc(statusLabel(h.person.status)) + ', ' + esc(h.reasons.join(', ')) + ')' + (h.rehireWarning ? ' <strong>' + esc(h.rehireWarning) + '</strong>' : '') + ' <a class="small" href="#/people/' + esc(h.person.id) + '">view</a></li>'; }).join('') + '</ul><p class="small" style="margin:6px 0 0">If this is the same person, open their record to start a rehire so the history stays together.</p></div>' : ''; }).catch(function () {}); }, 400); }
      ['firstName', 'lastName', 'mobile', 'personalEmail'].forEach(function (id) { document.getElementById(id).addEventListener('input', checkDups); });
      function showProfile() { var t = val('title'); var g = null; Object.keys(state.cfg.accessProfiles).forEach(function (k) { if (state.cfg.accessProfiles[k].titles.indexOf(t) >= 0) g = state.cfg.accessProfiles[k]; }); var s = store(val('storeId')); document.getElementById('profileBox').innerHTML = g ? '<div class="alert info"><strong>Standard setup for ' + esc(t) + ':</strong> ' + esc(g.apps.map(function (a) { var ap = state.cfg.applications.find(function (x) { return x.key === a; }); return ap ? ap.label.replace(/ \(.*\)/, '') : a; }).join(', ')) + (s && s.oem && g.apps.indexOf('oem') >= 0 ? ' (' + esc(s.oem) + ')' : '') + '. Device: ' + esc(g.device) + '. License: ' + esc(g.license) + '. IT applies the standard role matrix; note only exceptions on the IT checklist.</div>' : ''; }
      document.getElementById('title').addEventListener('change', showProfile); document.getElementById('storeId').addEventListener('change', showProfile); showProfile();
      document.getElementById('hireForm').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!val('managerUpn')) { toast('Pick the direct manager from the directory.', true); return; }
        var body = { type: 'hire', confidential: val('confidential') === true, personId: val('personId'), firstName: val('firstName'), lastName: val('lastName'), preferredName: val('preferredName'), mobile: val('mobile'), personalEmail: val('personalEmail'), storeId: val('storeId'), department: val('department'), title: val('title'), managerUpn: val('managerUpn'), managerName: val('managerName'), targetStartDate: val('targetStartDate'), priority: val('priority'), notes: val('notes'), packetItems: {} };
        state.cfg.packetItems.forEach(function (i) { body.packetItems[i.key] = val('pk_' + i.key); });
        api('POST', 'requests', body).then(function (r) { toast('Hire request created'); location.hash = '#/requests/' + r.request.id; }).catch(function (err) { toast(err.message, true); });
      });
    });
  }

  // ---------- change ----------
  function changeNew(_, q) {
    q = q || {};
    $main.innerHTML = '<div class="page-head"><div><h1>Change an employee</h1><p class="muted">Transfers between ' + esc(vlow('locations')) + ', promotions and new positions, manager changes, desk or extension moves, and access changes. HR reviews first, then IT applies it.</p></div></div>' +
      '<form id="chForm" class="card">' + personPicker('person', 'Employee') +
      '<fieldset><legend>What is changing?</legend><div class="checks">' + state.cfg.changeTypes.map(function (c) { return '<label class="check"><input type="checkbox" class="ct" value="' + c.key + '"> ' + esc(c.label) + '</label>'; }).join('') + '</div></fieldset>' +
      '<fieldset><legend>New values</legend><p class="small muted">Fill in only what changes.</p><div class="grid-3"><div class="field"><label>New ' + esc(vlow('location')) + '</label><select id="toStore"><option value="">No change</option>' + opt(state.cfg.stores, '', 'name', 'id') + '</select></div><div class="field"><label>New department</label><select id="toDept"><option value="">No change</option>' + opt(state.cfg.departments, '') + '</select></div><div class="field"><label>New job title</label><select id="toTitle"><option value="">No change</option>' + opt(state.cfg.jobTitles, '') + '</select></div></div>' + directoryPicker('toManager', 'New direct manager', false, 'Only if the manager changes') + '<div class="grid-3"><div class="field"><label>New endpoint name</label><input type="text" id="toEndpoint" maxlength="15" placeholder="GA-XXXX-PC1"></div><div class="field"><label>New phone extension</label><input type="text" id="toExt"></div><div class="field"><label>New desk / work area</label><input type="text" id="toArea"></div></div><div class="grid-3"><div class="field"><label>New first name</label><input type="text" id="toFirst"></div><div class="field"><label>New last name</label><input type="text" id="toLast"></div><div class="field"><label>New preferred name</label><input type="text" id="toPref"></div></div></fieldset>' +
      '<fieldset><legend>Access and equipment</legend><div class="grid-2"><div class="field"><label>Access to add</label><textarea id="accessAdd" placeholder="Applications, shared folders or groups needed in the new role…"></textarea></div><div class="field"><label>Access to remove</label><textarea id="accessRemove"></textarea></div></div><div class="field"><label>Equipment moves or needs</label><textarea id="equipment" placeholder="Takes the laptop along; needs a second monitor…"></textarea></div><div class="grid-2"><div class="field"><label>Effective date <span class="req">*</span></label><input type="date" id="effectiveDate" required></div><div class="field"><label>Priority</label><select id="priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div></div><div class="field"><label>Reason / notes</label><textarea id="reason"></textarea></div></fieldset>' +
      '<div class="sticky-actions"><a class="btn" href="#/">Cancel</a><button class="btn btn-primary" type="submit">Submit change</button></div></form>';
    bindPersonPicker('person'); bindDirectoryPicker('toManager');
    if (q.person) api('GET', 'people/' + q.person).then(function (r) { var p = r.person; document.getElementById('person').value = p.firstName + ' ' + p.lastName; document.getElementById('personId').value = p.id; document.getElementById('personCard').innerHTML = '<div class="alert info"><strong>' + esc(p.firstName + ' ' + p.lastName) + '</strong> ' + personStatusBadge(p.status) + ' · ' + esc([p.title, storeName(p.storeId)].filter(Boolean).join(' · ')) + '</div>'; });
    document.getElementById('chForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var types = Array.prototype.map.call(document.querySelectorAll('.ct:checked'), function (c) { return c.value; });
      var body = { type: 'change', personId: val('personId'), changeTypes: types, effectiveDate: val('effectiveDate'), priority: val('priority'), to: { storeId: val('toStore'), department: val('toDept'), title: val('toTitle'), managerUpn: val('toManagerUpn'), managerName: val('toManagerName'), endpointName: val('toEndpoint'), extension: val('toExt'), workArea: val('toArea'), firstName: val('toFirst'), lastName: val('toLast'), preferredName: val('toPref') }, accessAdd: val('accessAdd'), accessRemove: val('accessRemove'), equipment: val('equipment'), reason: val('reason') };
      if (!body.personId) { toast('Pick the employee first.', true); return; }
      api('POST', 'requests', body).then(function (r) { toast('Change submitted to HR'); location.hash = '#/requests/' + r.request.id; }).catch(function (err) { toast(err.message, true); });
    });
  }

  // ---------- termination ----------
  function terminateNew(_, q) {
    q = q || {};
    $main.innerHTML = '<div class="page-head"><div><h1>Terminate an employee</h1><p class="muted">HR and IT are notified the moment you submit. Involuntary departures are flagged urgent so IT can block access at the time you set.</p></div></div>' +
      '<form id="tForm" class="card">' + personPicker('person', 'Employee') +
      '<fieldset><legend>Departure</legend><div class="grid-3"><div class="field"><label>Type <span class="req">*</span></label><select id="terminationType" required><option value="">Choose…</option>' + opt(state.cfg.terminationTypes, '', 'label', 'key') + '</select></div><div class="field"><label>Last day worked <span class="req">*</span></label><input type="date" id="lastDay" required></div><div class="field"><label>Access should end</label><input type="text" id="accessEndAt" placeholder="e.g. immediately, or 10/15 at 5:00 PM"><div class="hint">Leave blank for end of the last day. Involuntary defaults to immediately.</div></div></div>' +
      (can('hr') ? '<div class="grid-2"><div class="field"><label>Eligible for rehire (HR)</label><select id="rehireEligible"><option value="review">Needs review</option><option value="yes">Yes</option><option value="no">No</option></select></div></div><div class="field"><label>Reason notes (HR only, never shown to managers or IT)</label><textarea id="reasonNotes"></textarea></div>' : '') + '</fieldset>' +
      '<fieldset><legend>For IT</legend><div class="grid-2"><div class="field"><label>Device endpoint name</label><input type="text" id="deviceEndpointName" maxlength="15" placeholder="Shown bottom right of the screen"></div><div class="field"><label>Equipment to recover</label><input type="text" id="equipmentToRecover" placeholder="Laptop, phone, key fob, badge…"></div></div>' + directoryPicker('mailboxDelegate', 'Mailbox and files delegate', false, 'Who should receive their email and files?') + '<div class="grid-2"><div class="field"><label>Forward mail for (days)</label><input type="number" id="forwardDays" value="30" min="0" max="365"></div><div class="field"><label>Applications to deactivate</label>' + state.cfg.applications.filter(function (a) { return !a.always; }).map(function (a) { return '<label class="check small"><input type="checkbox" class="deact" value="' + esc(a.key) + '" checked> ' + esc(a.label) + '</label>'; }).join('') + '</div></div><div class="field"><label>Notes for HR and IT</label><textarea id="managerNotes" placeholder="Reassign open deals or ROs to…, customer handoff, anything else."></textarea></div></fieldset>' +
      '<div class="sticky-actions"><a class="btn" href="#/">Cancel</a><button class="btn btn-danger" type="submit">Submit termination</button></div></form>';
    bindPersonPicker('person'); bindDirectoryPicker('mailboxDelegate');
    if (q.person) api('GET', 'people/' + q.person).then(function (r) { var p = r.person; document.getElementById('person').value = p.firstName + ' ' + p.lastName; document.getElementById('personId').value = p.id; document.getElementById('personCard').innerHTML = '<div class="alert info"><strong>' + esc(p.firstName + ' ' + p.lastName) + '</strong> ' + personStatusBadge(p.status) + ' · ' + esc([p.title, storeName(p.storeId)].filter(Boolean).join(' · ')) + '</div>'; });
    document.getElementById('tForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var body = { type: 'termination', personId: val('personId'), terminationType: val('terminationType'), lastDay: val('lastDay'), accessEndAt: val('accessEndAt'), deviceEndpointName: val('deviceEndpointName'), equipmentToRecover: val('equipmentToRecover'), mailboxDelegate: val('mailboxDelegateUpn') || val('mailboxDelegate'), forwardDays: val('forwardDays'), deactivateApps: Array.prototype.slice.call(document.querySelectorAll('.deact:checked')).map(function (x) { return x.value; }), managerNotes: val('managerNotes'), rehireEligible: val('rehireEligible'), reasonNotes: val('reasonNotes') };
      if (!body.personId) { toast('Pick the employee first.', true); return; }
      if (!confirm('Submit the termination? HR and IT are notified immediately.')) return;
      api('POST', 'requests', body).then(function (r) { toast('Termination submitted'); location.hash = '#/requests/' + r.request.id; }).catch(function (err) { toast(err.message, true); });
    });
  }

  // ---------- request detail ----------
  function requestDetail(id) {
    return api('GET', 'requests/' + encodeURIComponent(id)).then(function (d) {
      var r = d.request, p = d.person || {};
      var head = '<div class="page-head"><div><h1>' + badgeType(r.type) + ' ' + esc(p.firstName + ' ' + p.lastName) + (r.priority === 'urgent' ? ' <span class="badge danger">Urgent</span>' : '') + (r.isRehire ? ' <span class="badge warn">Rehire</span>' : '') + (r.confidential ? ' <span class="badge warn">Confidential</span>' : '') + '</h1><p class="muted">' + esc([r.title, r.department, storeName(r.storeId)].filter(Boolean).join(' · ')) + ' · ' + esc(r.id) + ' · created ' + esc(fmtWhen(r.createdAt)) + ' by ' + esc(r.createdByName || r.createdBy) + '</p></div><div class="actions"><a class="btn btn-sm" href="#/people/' + esc(p.id) + '">Person record</a><button class="btn btn-sm" onclick="window.print()">Print</button></div></div>';
      var stageBox = '<div class="card"><div class="card-head"><div><span class="dim">Current stage</span><h2 style="margin:0">' + esc(d.stage.label) + ' ' + badgeOwner(d.stage.owner) + '</h2></div></div>' + stepper(r.type, r.stage) + (d.stage.help ? '<p class="small muted">' + esc(d.stage.help) + '</p>' : '') + '</div>';
      var details = r.type === 'hire' ? hireDetails(r, p, d) : r.type === 'change' ? changeDetails(r, p, d) : termDetails(r, p, d);
      var actionsBox = '<div class="card" id="actionsCard"><h2>Actions</h2>' + (d.actions.length ? '<div class="actions" id="actionBtns">' + d.actions.map(function (a) { return '<button class="btn ' + (/decline|withdraw|no_show|offer_declined|hr_decline/.test(a.key) ? 'btn-danger' : (/complete|approve|send_notice|close|started|offer_accepted|submit_checklist|packet_sent|acknowledge|hr_processed/.test(a.key) ? 'btn-primary' : '')) + '" data-action="' + esc(a.key) + '">' + esc(a.label) + '</button>'; }).join('') + '</div><div id="actionForm"></div>' : '<p class="muted">' + (d.stage.owner ? 'Nothing for your role at this stage. Waiting on ' + ({ manager: 'the hiring manager', hr: 'HR', it: 'IT' }[d.stage.owner]) + '.' : 'This request is closed.') + '</p>') + '</div>';
      var attach = '<div class="card"><h2>Attachments</h2>' + ((r.attachments || []).length ? '<ul>' + r.attachments.map(function (a, i) { return '<li><a href="/api/requests/' + esc(r.id) + '/attachments/' + i + '">' + esc(a.name) + '</a> <span class="dim">' + Math.round(a.size / 1024) + ' KB · ' + esc(a.uploadedBy) + (a.hrOnly ? ' · HR only' : '') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted small">No attachments. Keep sensitive paperwork (SSN, bank details) in ' + esc(V('hrSystem')) + '; attach only what the next person needs.</p>') + '<div class="actions"><input type="file" id="attFile" class="small">' + (can('hr') ? '<label class="check small"><input type="checkbox" id="attHrOnly"> HR only</label>' : '') + '<button class="btn btn-sm" id="attBtn">Upload</button></div></div>';
      var timeline = '<div class="card"><h2>Timeline</h2><ul class="timeline">' + d.events.slice().reverse().map(function (e) { return '<li class="' + (e.hrOnly ? 'hr-only' : '') + '"><div class="when">' + esc(fmtWhen(e.at)) + '<br><span class="who">' + esc(e.byName || e.by) + '</span></div><div><span class="badge neutral">' + esc(actionLabel(e.action)) + '</span>' + (e.toStage && e.fromStage !== e.toStage ? ' <span class="dim">→ ' + esc(stageLabel(r.type, e.toStage)) + '</span>' : '') + (e.hrOnly ? ' <span class="badge warn">HR only</span>' : '') + (e.note ? '<div class="note">' + esc(e.note) + '</div>' : '') + '</div></li>'; }).join('') + '</ul><div class="field" style="margin-top:12px"><label>Add a comment</label><textarea id="commentText" placeholder="Visible to everyone on this request' + (can('hr') ? ' unless marked HR only' : '') + '."></textarea></div><div class="actions">' + (can('hr') ? '<label class="check small"><input type="checkbox" id="commentHr"> HR only</label>' : '') + '<button class="btn btn-sm" id="commentBtn">Post comment</button></div></div>';
      $main.innerHTML = head + stageBox + '<div class="row"><div class="col" style="flex:3">' + details + attach + '</div><div class="col" style="flex:2">' + actionsBox + timeline + '</div></div>';
      $main.querySelectorAll('[data-action]').forEach(function (b) { b.addEventListener('click', function () { showActionForm(d, b.dataset.action); }); });
      var pc = document.getElementById('pkCopy'); if (pc) pc.addEventListener('click', function () { var i = document.getElementById('pkLink'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { toast('Link copied'); }, function () { document.execCommand('copy'); toast('Link copied'); }); });
      document.getElementById('commentBtn').addEventListener('click', function () { var t = val('commentText'); if (!t.trim()) return; api('POST', 'requests/' + r.id + '/comments', { text: t, hrOnly: val('commentHr') }).then(function () { toast('Comment posted'); navigate(); }).catch(function (e) { toast(e.message, true); }); });
      document.getElementById('attBtn').addEventListener('click', function () { var f = document.getElementById('attFile').files[0]; if (!f) { toast('Choose a file first', true); return; } if (f.size > 8 * 1024 * 1024) { toast('Files must be under 8 MB', true); return; } var rd = new FileReader(); rd.onload = function () { api('POST', 'requests/' + r.id + '/attachments', { name: f.name, contentType: f.type || 'application/octet-stream', dataBase64: rd.result.split(',')[1], hrOnly: val('attHrOnly') }).then(function () { toast('Uploaded'); navigate(); }).catch(function (e) { toast(e.message, true); }); }; rd.readAsDataURL(f); });
    });
  }
  function actionLabel(a) { return ({ created: 'Created', comment: 'Comment', attachment: 'Attachment', attachment_removed: 'Attachment removed', packet_sent: 'Packet sent to HR', acknowledge: 'Packet received', record_screening: 'Screening updated', approve: 'Approved for hire', decline: 'Not approved', offer_accepted: 'Offer accepted', offer_declined: 'Offer declined', update_start: 'Start date changed', submit_checklist: 'IT checklist', send_notice: 'New Hire Notice sent', it_start: 'IT started', it_update: 'IT update', it_complete: 'IT complete', it_return: 'Returned by IT', started: 'Employee started', no_show: 'Did not start', dayone_update: 'Day-one update', close: 'Closed', withdraw: 'Withdrawn', reassign_manager: 'Manager reassigned', hr_approve: 'HR approved', hr_decline: 'HR declined', edit: 'Edited', reopen: 'Reopened', hr_processed: 'HR processed' })[a] || a; }
  function kv(rows) { return '<table class="kv">' + rows.filter(function (x) { return x && x[1] !== undefined && x[1] !== '' && x[1] !== null; }).map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + (x[2] ? x[1] : esc(x[1])) + '</td></tr>'; }).join('') + '</table>'; }
  function yn(b) { return b ? '<span class="badge ok">Yes</span>' : '<span class="badge neutral">No</span>'; }
  function checklistView(c) {
    if (!c) return '<p class="muted">Not completed yet.</p>';
    var apps = state.cfg.applications.filter(function (a) { return c.applications && c.applications[a.key]; }).map(function (a) { return a.label; });
    var eq = state.cfg.equipment.filter(function (e) { return c.equipment && c.equipment[e.key] && c.equipment[e.key].needed; }).map(function (e) { return e.label + (c.equipment[e.key].atDesk ? ' (already at desk)' : ''); });
    var hw = { existing_on_site: 'Existing device on site: ' + (c.endpointName || 'endpoint name missing'), needs_purchase: 'Hardware purchase needed', shared_workstation: 'Shared workstation', none: 'No computer (mobile only)' }[c.hardware] || '';
    return kv([['Preferred display name', c.preferredDisplayName], ['Desk / work area', c.workArea], ['Hardware', hw], ['Phone extension', c.extension], ['Start time', c.startTime], ['Applications', apps.join(', ')], ['Other applications', c.otherApplications], ['Equipment', eq.join(', ') || 'None'], ['Printer', c.printerAssignment], ['Exceptions', c.applicationExceptions], ['Copy access from', c.copyAccessFrom], ['Notes', c.notes], ['Completed', fmtWhen(c.completedAt)]]);
  }
  function hireDetails(r, p, d) {
    var h = r.hire; var scr = state.cfg.screeningItems.map(function (s) { var v = h.screening[s.key]; return s.label + ': ' + ({ pending: 'pending', clear: 'clear', flag: 'needs attention' }[v] || v); }).join(' · ');
    var itLink = d.links.addUser && can('it') ? '<p><a class="btn btn-accent btn-sm" target="_blank" rel="noopener" href="' + esc(d.links.addUser) + '">Open in Tech Tools: Add User (prefilled)</a></p>' : '';
    var pk = d.packet || {}; var packetCard = '<div class="card" id="packetCard"><div class="card-head"><h2>Pre-employment packet</h2>' + (pk.status === 'submitted' ? '<span class="badge ok">Submitted ' + esc(fmtWhen(pk.submittedAt)) + '</span>' : pk.status === 'active' ? '<span class="badge warn">Link active until ' + esc(fmtDate(pk.expiresAt.slice(0, 10))) + '</span>' : pk.status === 'expired' ? '<span class="badge danger">Link expired</span>' : '<span class="badge neutral">Not started</span>') + '</div>' +
      (pk.status === 'submitted' ? '<p>The candidate completed the packet online' + (pk.purgedAt ? '. Identifiers were removed at close.' : ', with every consent signed.') + '</p><div class="actions"><a class="btn btn-primary btn-sm" href="/apply.html?view=' + esc(r.id) + '">View and print the completed packet</a>' + (can('hr') && !pk.purgedAt ? '<a class="btn btn-sm" href="/apply.html?view=' + esc(r.id) + '&reveal=1">View with identifiers (logged)</a>' : '') + '</div>' :
        '<p class="small muted">Give the candidate a personal link to complete the application and consents online, or print the blank packet. ' + (pk.status === 'active' ? (pk.sentTo ? 'Link emailed to ' + esc(pk.sentTo) + '.' : 'The link has not been emailed; copy it below and send it to the candidate.') : '') + '</p>' + (pk.link ? '<div class="field"><label>Candidate link</label><div class="row"><input type="text" id="pkLink" readonly value="' + esc(pk.link) + '" style="flex:3"><button class="btn btn-sm" id="pkCopy">Copy link</button></div></div>' : '') + '<div class="actions">' + (d.actions.some(function (a) { return a.key === 'packet_invite'; }) ? '<button class="btn btn-primary btn-sm" data-action="packet_invite">' + (pk.link ? (state.cfg.mailEnabled ? 'Resend or email the link' : 'Create a new link') : (state.cfg.mailEnabled ? 'Create link / email the candidate' : 'Create the candidate link')) + '</button>' : '') + '<a class="btn btn-sm" target="_blank" rel="noopener" href="/apply.html?print=blank&' + new URLSearchParams({ name: p.firstName + ' ' + p.lastName, position: r.title, store: storeName(r.storeId), department: r.department, manager: r.managerName || '' }).toString() + '">Print blank packet</a></div>') +
      '</div>';
    if (!state.cfg.packetEnabled) packetCard = '';
    return packetCard + '<div class="card"><h2>Candidate and position</h2>' + kv([['Name', p.firstName + ' ' + p.lastName], ['Preferred name', p.preferredName], ['Mobile', p.mobile], ['Personal email', p.personalEmail], [V('location'), storeName(r.storeId)], ['Department', r.department], ['Job title', r.title], ['Direct manager', (r.managerName ? r.managerName + ' (' + r.managerUpn + ')' : r.managerUpn)], ['Target start', fmtDate(r.targetStartDate)], ['Manager notes', r.managerNotes]]) + '</div>' +
      '<div class="card"><h2>HR</h2>' + kv([['Packet', state.cfg.packetItems.filter(function (i) { return h.packet.items[i.key]; }).map(function (i) { return i.label; }).join(', ') || 'Nothing marked yet'], ['Packet sent', h.packet.sentAt ? fmtWhen(h.packet.sentAt) + (h.packet.sentBy === 'candidate' ? ' (online)' : '') : ''], (state.cfg.packetVendor ? [state.cfg.packetVendor + ' called', h.packet.coleCall ? (h.packet.coleCall.managerName + ', ' + fmtWhen(h.packet.coleCall.calledAt)) : ''] : null), ['Manager section', h.managerSection && h.managerSection.approvedAt ? [h.managerSection.employmentType, h.managerSection.workHours, h.managerSection.workDays, can('manager') && h.managerSection.rateOfPay ? 'pay ' + h.managerSection.rateOfPay : '', h.managerSection.uniforms === 'yes' ? 'uniforms' : ''].filter(Boolean).join(' · ') : ''], ['Screening', scr], can('hr') ? ['Screening notes (HR only)', h.screening.notes] : null, ['Decision', h.decision.outcome ? h.decision.outcome.replace('_', ' ') + ' on ' + fmtWhen(h.decision.at) : ''], can('hr') ? ['Decision reason (HR only)', h.decision.reason] : null, ['Start date', h.startDate ? fmtDate(h.startDate) + (h.startTime ? ' at ' + h.startTime : '') : 'Not set'], ['Employee number', h.employeeNumber], ['New Hire Notice', h.notice.sentAt ? 'Sent ' + fmtWhen(h.notice.sentAt) : 'Not sent'], ['HR note to IT', h.notice.ticketNote]]) + '</div>' +
      '<div class="card"><h2>IT checklist (from the manager)</h2>' + checklistView(h.checklist) + '</div>' +
      '<div class="card"><h2>IT setup</h2>' + itLink + kv([['Work email', h.it.upn], ['License', h.it.license], ['Endpoint', h.it.endpointName], ['Extension', h.it.extension], ['Temporary password to employee', yn(h.it.credentialDelivered), true], ['Copy to manager', yn(h.it.managerCredentialDelivered), true], ['IT notes', h.it.notes], ['Completed', h.it.completedAt ? fmtWhen(h.it.completedAt) + ' by ' + h.it.completedBy : '']]) + '</div>' +
      (['it_complete', 'started', 'closed'].indexOf(r.stage) >= 0 ? '<div class="card"><h2>Day one</h2>' + kv(state.cfg.dayOneItems.map(function (i) { return [i.label, yn(h.dayOne[i.key]), true]; })) + '</div>' : '');
  }
  function changeDetails(r, p, d) {
    var c = r.change; var kinds = c.changeTypes.map(function (k) { var x = state.cfg.changeTypes.find(function (y) { return y.key === k; }); return x ? x.label : k; });
    var itLink = d.links.modifyUser && can('it') ? '<p><a class="btn btn-accent btn-sm" target="_blank" rel="noopener" href="' + esc(d.links.modifyUser) + '">Open in Tech Tools: Modify User</a></p>' : '';
    return '<div class="card"><h2>Change</h2>' + kv([['Employee', p.firstName + ' ' + p.lastName + (c.from.workEmail ? ' (' + c.from.workEmail + ')' : '')], ['Changes', kinds.join(', ')], ['Effective', fmtDate(c.effectiveDate)], [V('location'), c.to.storeId ? storeName(c.from.storeId) + ' → ' + storeName(c.to.storeId) : storeName(c.from.storeId)], ['Department', c.to.department ? (c.from.department || '') + ' → ' + c.to.department : c.from.department], ['Title', c.to.title ? (c.from.title || '') + ' → ' + c.to.title : c.from.title], ['Manager', c.to.managerUpn ? (c.from.managerName || c.from.managerUpn || '') + ' → ' + (c.to.managerName || c.to.managerUpn) : (c.from.managerName || c.from.managerUpn)], ['Name', (c.to.firstName || c.to.lastName) ? c.to.firstName + ' ' + c.to.lastName : ''], ['Preferred name', c.to.preferredName], ['Endpoint', c.to.endpointName], ['Extension', c.to.extension], ['Desk / area', c.to.workArea], ['Access to add', c.accessAdd], ['Access to remove', c.accessRemove], ['Equipment', c.equipment], ['Reason', c.reason], ['HR notes', c.hrNotes]]) + '</div>' +
      '<div class="card"><h2>IT</h2>' + itLink + kv([['Started', fmtWhen(c.it.startedAt)], ['Notes', c.it.notes], ['Completed', c.it.completedAt ? fmtWhen(c.it.completedAt) + ' by ' + c.it.completedBy : '']]) + '</div>';
  }
  function termDetails(r, p, d) {
    var t = r.termination; var type = (state.cfg.terminationTypes.find(function (x) { return x.key === t.terminationType; }) || {}).label;
    var itLink = d.links.removeUser && can('it') ? '<p><a class="btn btn-accent btn-sm" target="_blank" rel="noopener" href="' + esc(d.links.removeUser) + '">Open in Tech Tools: Remove or Remediate User</a></p>' : '';
    return '<div class="card"><h2>Departure</h2>' + kv([['Employee', p.firstName + ' ' + p.lastName + (p.workEmail ? ' (' + p.workEmail + ')' : '')], ['Type', type], ['Involuntary', yn(t.involuntary), true], ['Last day', fmtDate(t.lastDay)], ['Access ends', t.accessEndAt], can('hr') ? ['Rehire eligible (HR only)', t.rehireEligible] : null, can('hr') ? ['Reason notes (HR only)', t.reasonNotes] : null, ['Device', t.deviceEndpointName], ['Equipment to recover', t.equipmentToRecover], ['Mailbox delegate', t.mailboxDelegate], ['Forward mail', t.forwardDays ? t.forwardDays + ' days' : 'No'], ['Applications to deactivate', (t.deactivateApps || []).map(function (k) { var a = state.cfg.applications.find(function (x) { return x.key === k; }); return a ? a.label : k; }).join(', ') || 'None'], ['Manager notes', t.managerNotes]]) + '</div>' +
      '<div class="card"><h2>HR</h2>' + kv(state.cfg.termination.hrChecks.map(function (c) { return [c.label, yn(t.hr[c.key]), true]; }).concat([['Notes', t.hr.notes], ['Processed', t.hr.processedAt ? fmtWhen(t.hr.processedAt) + ' by ' + t.hr.processedBy : '']])) + '</div>' +
      '<div class="card"><h2>IT offboarding</h2>' + itLink + kv(state.cfg.termination.itChecks.map(function (c) { return [c.label, yn(t.it[c.key]), true]; }).concat([['Notes', t.it.notes], ['Completed', t.it.completedAt ? fmtWhen(t.it.completedAt) + ' by ' + t.it.completedBy : '']])) + '</div>';
  }

  // Per-action input forms.
  function showActionForm(d, action) {
    var r = d.request, box = document.getElementById('actionForm'); var h = r.hire || {}, t = r.termination || {}, c = r.change || {};
    var f = ''; var noteField = function (label, required) { return '<div class="field"><label>' + esc(label || 'Note') + (required ? ' <span class="req">*</span>' : ' <span class="opt">(optional)</span>') + '</label><textarea id="a_note"></textarea></div>'; };
    var checks = function (items, values) { return '<div class="checks">' + items.map(function (i) { return '<label class="check"><input type="checkbox" id="a_' + i.key + '"' + (values && values[i.key] ? ' checked' : '') + '> ' + esc(i.label) + '</label>'; }).join('') + '</div>'; };
    switch (action) {
      case 'packet_invite': f = '<p class="small muted">Creates a personal link for the candidate (valid ' + (21) + ' days). Email it from the portal, or copy it and text it yourself.</p><div class="grid-2"><div class="field"><label>Candidate email</label><input type="email" id="a_candidateEmail" value="' + esc((d.packet && d.packet.sentTo) || d.person.personalEmail || '') + '"></div>' + (state.cfg.mailEnabled ? '<div class="field"><label class="check" style="margin-top:28px"><input type="checkbox" id="a_sendEmail" checked> Email the link to the candidate now</label></div></div>' : '<div class="field"><p class="small" style="margin-top:28px"><strong>Portal email is off.</strong> The link is not emailed. Copy it from the packet card and send it to the candidate yourself.</p></div></div>'); break;
      case 'packet_reopen': f = '<div class="alert warn">Reopening discards the submitted packet and sends the candidate a fresh link.</div>' + noteField('Why', true); break;
      case 'manager_section': { var ms = (r.hire && r.hire.managerSection) || {}; f = '<p class="small muted">The manager\'s part of the Pre-employment Form. Pay is visible to you and HR only.</p><div class="grid-3"><div class="field"><label>Rate of pay (draw)</label><input type="text" id="a_rateOfPay" value="' + esc(ms.rateOfPay || '') + '"></div><div class="field"><label>Full-time or part-time</label><select id="a_employmentType">' + opt([{ v: '', l: 'Choose' }, { v: 'Full-time', l: 'Full-time' }, { v: 'Part-time', l: 'Part-time' }], ms.employmentType || '', 'l', 'v') + '</select></div><div class="field"><label>Department(s) to be charged</label><input type="text" id="a_departmentsCharged" value="' + esc(ms.departmentsCharged || r.department || '') + '"></div><div class="field"><label>Work hours</label><input type="text" id="a_workHours" value="' + esc(ms.workHours || '') + '" placeholder="8:00 to 5:00"></div><div class="field"><label>Work days</label><input type="text" id="a_workDays" value="' + esc(ms.workDays || '') + '" placeholder="Monday to Friday, every other Saturday"></div></div><label class="check"><input type="checkbox" id="a_uniforms"' + (ms.uniforms === 'yes' ? ' checked' : '') + '> Uniforms</label><label class="check"><input type="checkbox" id="a_lunchDeductions"' + (ms.lunchDeductions === 'yes' ? ' checked' : '') + '> Automatic lunch deductions</label>'; break; }
      case 'cole_called': f = '<p class="small muted">The candidate calls ' + esc(state.cfg.packetVendor || 'the screening provider') + (state.cfg.packetVendorPhone ? ' at ' + esc(state.cfg.packetVendorPhone) : '') + ' for the background check. Record when it happened.</p><div class="grid-2"><div class="field"><label>Manager\'s name given</label><input type="text" id="a_managerName" value="' + esc(state.me.name) + '"></div><div class="field"><label>Date and time called</label><input type="datetime-local" id="a_calledAt"></div></div><div class="field"><label>Note</label><input type="text" id="a_coleNote"></div>'; break;
      case 'packet_sent': f = '<p class="small muted">Use this when HR received a paper packet. Confirm what is in it.</p>' + checks(state.cfg.packetItems, h.packet && h.packet.items) + noteField(); break;
      case 'record_screening': f = '<div class="grid-3">' + state.cfg.screeningItems.map(function (s) { return '<div class="field"><label>' + esc(s.label) + '</label><select id="a_' + s.key + '">' + opt([{ v: 'pending', l: 'Pending' }, { v: 'clear', l: 'Clear' }, { v: 'flag', l: 'Needs attention' }], h.screening[s.key], 'l', 'v') + '</select></div>'; }).join('') + '</div><div class="field"><label>Screening notes (HR only)</label><textarea id="a_notes">' + esc(h.screening.notes || '') + '</textarea></div>'; break;
      case 'approve': case 'decline': f = '<div class="field"><label>Reason (HR only) <span class="opt">(optional)</span></label><textarea id="a_reason"></textarea></div>' + (action === 'decline' ? '<div class="alert warn">The manager is notified that the candidate is not approved. The reason stays with HR.</div>' : ''); break;
      case 'offer_accepted': case 'update_start': f = '<div class="grid-2"><div class="field"><label>Start date <span class="req">*</span></label><input type="date" id="a_startDate" value="' + esc(h.startDate || r.targetStartDate || '') + '"></div><div class="field"><label>Start time</label><input type="time" id="a_startTime" value="' + esc(h.startTime || '') + '"></div></div><div class="alert info small">Minimum notice to IT: ' + state.cfg.noticeStandards.map(function (n) { return esc(n.type.toLowerCase()) + ': ' + esc(n.minimum.toLowerCase()); }).join('; ') + '.</div>' + noteField(); break;
      case 'submit_checklist': f = checklistForm(h.checklist, r); break;
      case 'send_notice': f = (!h.startDate || !h.checklist ? '<div class="alert warn">The start date and IT checklist must be in before the notice can go. Ask the manager to complete them.</div>' : '') + '<div class="grid-2"><div class="field"><label>Employee number <span class="req">*</span></label><input type="text" id="a_employeeNumber" value="' + esc(h.employeeNumber || '') + '"></div></div><div class="field"><label>Note to IT <span class="opt">(optional)</span></label><textarea id="a_ticketNote"></textarea></div><div class="alert info small">Emails the New Hire Notice (name, employee number, ' + esc(vlow('location')) + ', position, start date) with the IT checklist to ' + esc(state.cfg.client.helpdesk.email) + ', which opens the support ticket, copying the manager and HR.</div>'; break;
      case 'it_start': f = noteField(); break;
      case 'it_update': case 'it_complete':
        if (r.type === 'hire') f = '<div class="grid-2"><div class="field"><label>Work email (UPN)' + (action === 'it_complete' ? ' <span class="req">*</span>' : '') + '</label><input type="text" id="a_upn" value="' + esc(h.it.upn || '') + '" placeholder="flast@' + esc(state.cfg.client.primaryDomain || '') + '"></div><div class="field"><label>License</label><input type="text" id="a_license" value="' + esc(h.it.license || '') + '"></div><div class="field"><label>Endpoint</label><input type="text" id="a_endpointName" maxlength="15" value="' + esc(h.it.endpointName || (h.checklist && h.checklist.endpointName) || '') + '"></div><div class="field"><label>Extension</label><input type="text" id="a_extension" value="' + esc(h.it.extension || (h.checklist && h.checklist.extension) || '') + '"></div></div><label class="check"><input type="checkbox" id="a_credentialDelivered"' + (h.it.credentialDelivered ? ' checked' : '') + '> Temporary password delivered to the employee</label><label class="check"><input type="checkbox" id="a_managerCredentialDelivered"' + (h.it.managerCredentialDelivered ? ' checked' : '') + '> Copy delivered to the direct manager (encrypted)</label><div class="field" style="margin-top:10px"><label>IT notes</label><textarea id="a_notes">' + esc(h.it.notes || '') + '</textarea></div><div class="alert warn small">Never type a password into this portal.</div>';
        else if (r.type === 'termination') f = checks(state.cfg.termination.itChecks, t.it) + '<div class="field" style="margin-top:10px"><label>IT notes</label><textarea id="a_notes">' + esc(t.it.notes || '') + '</textarea></div>';
        else f = '<div class="field"><label>IT notes</label><textarea id="a_notes">' + esc(c.it.notes || '') + '</textarea></div>';
        break;
      case 'it_return': case 'hr_decline': case 'withdraw': case 'reopen': f = noteField('Explain why', true); break;
      case 'started': case 'dayone_update': f = '<p class="small muted">Tick what is done. HR can keep updating this until the request is closed.</p>' + checks(state.cfg.dayOneItems, h.dayOne) + noteField(); break;
      case 'hr_approve': f = '<div class="field"><label>Note to IT <span class="opt">(optional)</span></label><textarea id="a_notes"></textarea></div>'; break;
      case 'hr_processed': f = checks(state.cfg.termination.hrChecks, t.hr) + '<div class="grid-2"><div class="field"><label>Eligible for rehire (HR only)</label><select id="a_rehireEligible">' + opt([{ v: 'review', l: 'Needs review' }, { v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }], t.rehireEligible, 'l', 'v') + '</select></div></div><div class="field"><label>Reason notes (HR only)</label><textarea id="a_reasonNotes">' + esc(t.reasonNotes || '') + '</textarea></div><div class="field"><label>HR notes</label><textarea id="a_notes">' + esc(t.hr.notes || '') + '</textarea></div>'; break;
      case 'edit':
        if (r.type === 'termination') f = '<div class="grid-3"><div class="field"><label>Last day</label><input type="date" id="a_lastDay" value="' + esc(t.lastDay) + '"></div><div class="field"><label>Access ends</label><input type="text" id="a_accessEndAt" value="' + esc(t.accessEndAt) + '"></div><div class="field"><label>Equipment to recover</label><input type="text" id="a_equipmentToRecover" value="' + esc(t.equipmentToRecover) + '"></div></div><div class="field"><label>Mailbox delegate</label><input type="text" id="a_mailboxDelegate" value="' + esc(t.mailboxDelegate) + '"></div><div class="field"><label>Notes</label><textarea id="a_managerNotes">' + esc(t.managerNotes) + '</textarea></div>';
        else f = '<div class="grid-3"><div class="field"><label>Effective date</label><input type="date" id="a_effectiveDate" value="' + esc(c.effectiveDate) + '"></div><div class="field"><label>Endpoint</label><input type="text" id="a_to_endpointName" value="' + esc(c.to.endpointName) + '"></div><div class="field"><label>Extension</label><input type="text" id="a_to_extension" value="' + esc(c.to.extension) + '"></div></div><div class="grid-2"><div class="field"><label>Access to add</label><textarea id="a_accessAdd">' + esc(c.accessAdd) + '</textarea></div><div class="field"><label>Access to remove</label><textarea id="a_accessRemove">' + esc(c.accessRemove) + '</textarea></div></div><div class="field"><label>Equipment</label><textarea id="a_equipment">' + esc(c.equipment) + '</textarea></div><div class="field"><label>Reason</label><textarea id="a_reason">' + esc(c.reason) + '</textarea></div>';
        break;
      case 'set_confidential': f = '<label class="check"><input type="checkbox" id="a_confidential"' + (r.confidential ? ' checked' : '') + '> Confidential: only HR, the hiring manager and whoever filed it can see this hire until it reaches IT</label>'; break;
      case 'reassign_manager': f = directoryPicker('a_manager', 'New hiring manager', true, 'Search the directory'); break;
      default: f = noteField();
    }
    var label = (d.actions.find(function (a) { return a.key === action; }) || {}).label || action;
    box.innerHTML = '<div class="card" style="background:var(--surface2)"><h3 style="margin-top:0">' + esc(label) + '</h3>' + f + '<div class="actions" style="margin-top:8px"><button class="btn btn-primary" id="a_submit">' + esc(label) + '</button><button class="btn" id="a_cancel">Cancel</button></div></div>';
    if (action === 'reassign_manager') bindDirectoryPicker('a_manager');
    if (action === 'submit_checklist') bindChecklistForm();
    document.getElementById('a_cancel').addEventListener('click', function () { box.innerHTML = ''; });
    document.getElementById('a_submit').addEventListener('click', function () {
      var payload = {};
      box.querySelectorAll('[id^="a_"]').forEach(function (el) { if (el.id === 'a_submit' || el.id === 'a_cancel') return; var k = el.id.slice(2); payload[k] = el.type === 'checkbox' ? el.checked : el.value; });
      if (action === 'packet_sent') { payload.packetItems = {}; state.cfg.packetItems.forEach(function (i) { payload.packetItems[i.key] = !!payload[i.key]; }); }
      if (action === 'submit_checklist') payload = { checklist: readChecklistForm() };
      if (action === 'reassign_manager') { payload.managerUpn = val('a_managerUpn'); payload.managerName = val('a_managerName'); }
      if (action === 'edit' && r.type === 'change') { payload.to = { endpointName: payload.to_endpointName, extension: payload.to_extension }; }
      if (/decline|withdraw|no_show|offer_declined/.test(action) && !confirm('Are you sure?')) return;
      document.getElementById('a_submit').disabled = true;
      api('POST', 'requests/' + r.id + '/actions/' + action, payload).then(function (res) { toast(res.notification && res.notification.sent ? 'Done. Notification sent to ' + res.notification.to.join(', ') : 'Done'); navigate(); }).catch(function (e) { toast(e.message, true); document.getElementById('a_submit').disabled = false; });
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // The digital New Hire Checklist (rev 09/26) plus the fields from the onboarding meeting guide.
  function checklistForm(c, r) {
    c = c || {}; var s = store(r.storeId); var g = null; Object.keys(state.cfg.accessProfiles).forEach(function (k) { if (state.cfg.accessProfiles[k].titles.indexOf(r.title) >= 0) g = state.cfg.accessProfiles[k]; });
    var std = g ? g.apps : ['office'];
    return '<p class="small muted">This replaces the paper New Hire Checklist. The standard applications for <strong>' + esc(r.title) + '</strong>' + (s ? ' at ' + esc(s.short) : '') + ' are pre-checked; adjust only for exceptions.</p>' +
      '<div class="grid-3"><div class="field"><label>Preferred display name</label><input type="text" id="c_preferredDisplayName" value="' + esc(c.preferredDisplayName || '') + '"></div><div class="field"><label>Desk / work area</label><input type="text" id="c_workArea" value="' + esc(c.workArea || '') + '" placeholder="Sales floor desk 3, service drive, parts counter…"></div><div class="field"><label>Start time on day one</label><input type="time" id="c_startTime" value="' + esc(c.startTime || '') + '"></div></div>' +
      '<label>Hardware <span class="req">*</span></label><div class="radio-cards">' + [['existing_on_site', 'Existing device on site', 'Enter its endpoint name (bottom right of the screen, or hover the NOIT logo in the tray)'], ['needs_purchase', 'Purchase needed', 'No suitable device on site. ' + esc(state.cfg.client.name) + ' approves, IT coordinates the order'], ['shared_workstation', 'Shared workstation', 'Shop terminal, sales floor or service drive shared PC'], ['none', 'No computer', 'Mobile phone only (porter, detailer, runner)']].map(function (x) { return '<label class="radio-card"><input type="radio" name="c_hardware" value="' + x[0] + '"' + (c.hardware === x[0] ? ' checked' : '') + '> <strong>' + x[1] + '</strong><span>' + x[2] + '</span></label>'; }).join('') + '</div>' +
      '<div class="grid-3" style="margin-top:12px"><div class="field"><label>Endpoint name</label><input type="text" id="c_endpointName" maxlength="15" value="' + esc(c.endpointName || '') + '" placeholder="GA-BTRC-PC2" style="text-transform:uppercase"></div><div class="field"><label>Phone extension</label><input type="text" id="c_extension" value="' + esc(c.extension || '') + '"></div><div class="field"><label>Copy access from <span class="opt">(same role teammate)</span></label><input type="text" id="c_copyAccessFrom" value="' + esc(c.copyAccessFrom || '') + '" placeholder="name@' + esc(state.cfg.client.primaryDomain || 'company.com') + '"></div></div>' +
      '<h3>Applications and portals</h3><div class="checks">' + state.cfg.applications.map(function (a) { var checked = c.applications ? !!c.applications[a.key] : (std.indexOf(a.key) >= 0 || (a.key === 'vita' && s && (s.extraApps || []).indexOf('Vita') >= 0 && (r.department === 'Service' || r.department === 'Parts'))); return '<label class="check"><input type="checkbox" id="c_app_' + a.key + '"' + (checked || a.always ? ' checked' : '') + (a.always ? ' disabled' : '') + '> ' + esc(a.label) + (a.key === 'oem' && s && s.oem ? ' <span class="dim">(' + esc(s.oem) + ')</span>' : '') + '</label>'; }).join('') + '</div><div class="field" style="margin-top:8px"><label>Other applications</label><input type="text" id="c_otherApplications" value="' + esc(c.otherApplications || '') + '"></div>' +
      '<h3>Equipment</h3><p class="small muted">Walk to the desk first. If it is already there, say so and IT will not order it.</p><table class="list"><thead><tr><th>Item</th><th>Needed</th><th>Already at desk</th></tr></thead><tbody>' + state.cfg.equipment.map(function (e) { var row = (c.equipment || {})[e.key] || {}; return '<tr><td>' + esc(e.label) + '</td><td><input type="checkbox" id="c_eq_' + e.key + '_needed"' + (row.needed ? ' checked' : '') + '></td><td><input type="checkbox" id="c_eq_' + e.key + '_atDesk"' + (row.atDesk ? ' checked' : '') + '></td></tr>'; }).join('') + '</tbody></table>' +
      '<div class="grid-2" style="margin-top:12px"><div class="field"><label>Printer assignment <span class="opt">(only if a specific printer is needed)</span></label><input type="text" id="c_printerAssignment" value="' + esc(c.printerAssignment || '') + '"></div><div class="field"><label>Application exceptions</label><input type="text" id="c_applicationExceptions" value="' + esc(c.applicationExceptions || '') + '" placeholder="Anything beyond the standard roles, groups and permissions for this title"></div></div><div class="field"><label>Notes for IT</label><textarea id="c_notes">' + esc(c.notes || '') + '</textarea></div>';
  }
  function bindChecklistForm() { }
  function readChecklistForm() {
    var out = { preferredDisplayName: val('c_preferredDisplayName'), workArea: val('c_workArea'), startTime: val('c_startTime'), hardware: (document.querySelector('input[name=c_hardware]:checked') || {}).value || '', endpointName: val('c_endpointName'), extension: val('c_extension'), copyAccessFrom: val('c_copyAccessFrom'), otherApplications: val('c_otherApplications'), printerAssignment: val('c_printerAssignment'), applicationExceptions: val('c_applicationExceptions'), notes: val('c_notes'), applications: {}, equipment: {} };
    state.cfg.applications.forEach(function (a) { out.applications[a.key] = val('c_app_' + a.key); });
    state.cfg.equipment.forEach(function (e) { out.equipment[e.key] = { needed: val('c_eq_' + e.key + '_needed'), atDesk: val('c_eq_' + e.key + '_atDesk') }; });
    return out;
  }

  // ---------- admin: access ----------
  function admin() {
    if (!can('hr') && !can('it')) { $main.innerHTML = '<div class="alert warn">Access management is for HR and IT.</div>'; return; }
    return api('GET', 'access').then(function (r) {
      var canEdit = can('hr');
      $main.innerHTML = '<div class="page-head"><div><h1>Who can use this portal</h1><p class="muted">Only people listed here can sign in. Hiring managers see their own ' + esc(vlow('locations')) + '; HR and IT see everything. Confidential hires stay with HR, the hiring manager and whoever filed them. ' + (can('admin') ? 'Administrators can grant any role.' : 'HR can add managers and HR staff; NOIT administrators grant IT and admin roles.') + '</p></div></div>' +
        (canEdit ? '<div class="card"><h2>Add or update someone</h2>' + directoryPicker('acc', 'Person', true, 'Search the company directory, or type an email address') + '<div class="grid-3"><div class="field"><label>Role</label><select id="accRole">' + opt([{ v: 'manager', l: 'Hiring manager' }, { v: 'hr', l: 'Human Resources' }].concat(can('admin') ? [{ v: 'it', l: 'IT support (NOIT)' }, { v: 'admin', l: 'Administrator' }] : []), 'manager', 'l', 'v') + '</select></div><div class="field" style="grid-column: span 2"><label>' + esc(V('locations')) + ' (managers only; leave empty for all)</label><select id="accStores" multiple size="6">' + opt(r.stores, '', 'name', 'id') + '</select><div class="hint">Hold Ctrl or Cmd to pick more than one ' + esc(vlow('location')) + '.</div></div></div><div class="actions"><button class="btn btn-primary" id="accSave">Save access</button></div></div>' : '') +
        '<div class="card"><h2>Current access</h2>' + (r.value.length ? '<table class="list"><thead><tr><th>Person</th><th>Role</th><th>' + esc(V('locations')) + '</th><th>Last seen</th><th></th></tr></thead><tbody>' + r.value.map(function (a) { return '<tr><td><strong>' + esc(a.displayName) + '</strong><div class="dim">' + esc(a.upn) + '</div></td><td><span class="badge">' + esc(a.role) + '</span>' + (a.active === false ? ' <span class="badge danger">Disabled</span>' : '') + '</td><td class="small">' + esc(a.stores.indexOf('*') >= 0 ? 'All ' + vlow('locations') : a.stores.map(storeName).join(', ')) + '</td><td class="dim">' + esc(a.lastSeenAt ? ago(a.lastSeenAt) : 'never') + '</td><td>' + (canEdit && a.upn !== state.me.upn ? '<button class="btn btn-sm btn-danger" data-remove="' + esc(a.upn) + '">Remove</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">Nobody has been added yet. Bootstrap administrators (from the app settings) always have access.</div>') + '</div>';
      if (canEdit) {
        bindDirectoryPicker('acc');
        document.getElementById('accSave').addEventListener('click', function () {
          var upn = val('accUpn') || val('acc'); if (!/@/.test(upn)) { toast('Pick a person or type an email address.', true); return; }
          var stores = Array.prototype.map.call(document.querySelectorAll('#accStores option:checked'), function (o) { return o.value; });
          api('PUT', 'access', { upn: upn, displayName: val('accName') || upn, role: val('accRole'), stores: stores }).then(function () { toast('Access saved. They may need to sign out and back in.'); navigate(); }).catch(function (e) { toast(e.message, true); });
        });
        $main.querySelectorAll('[data-remove]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('Remove access for ' + b.dataset.remove + '?')) return; api('DELETE', 'access/' + encodeURIComponent(b.dataset.remove)).then(function () { toast('Removed'); navigate(); }).catch(function (e) { toast(e.message, true); }); }); });
      }
    });
  }

  boot();
})();
