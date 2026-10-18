/* Fills in the client name, logo and contacts from the anonymous health endpoint. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
    if (!h || !h.client) return;
    if (h.branding && h.branding.logo) document.getElementById('logo').src = h.branding.logo;
    document.getElementById('logo').alt = h.client;
    document.getElementById('who').textContent = 'This portal is open to hiring managers, HR and IT at ' + h.client + ' by invitation.';
    var ask = [];
    if (h.contacts && h.contacts.hr) ask.push('HR (<a href="mailto:' + esc(h.contacts.hr) + '">' + esc(h.contacts.hr) + '</a>)');
    if (h.contacts && h.contacts.helpdesk) ask.push('the support desk (<a href="mailto:' + esc(h.contacts.helpdesk) + '">' + esc(h.contacts.helpdesk) + '</a>)');
    if (ask.length) document.getElementById('ask').innerHTML = 'Ask ' + ask.join(' or ') + ' to add your account. Once added, sign out and back in.';
  }).catch(function () {});
})();
