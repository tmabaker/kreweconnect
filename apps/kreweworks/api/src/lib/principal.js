'use strict';
// Parses the identity Azure Static Web Apps injects on every request (x-ms-client-principal)
// and the body SWA posts to the rolesSource function after login.
const config = require('./config');

const CLAIM = {
  tid: ['tid', 'http://schemas.microsoft.com/identity/claims/tenantid'],
  oid: ['oid', 'http://schemas.microsoft.com/identity/claims/objectidentifier'],
  upn: ['preferred_username', 'upn', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn', 'email', 'emails', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress', 'unique_name'],
  name: ['name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']
};

function claimValue(claims, keys) {
  for (const key of keys) {
    const hit = (claims || []).find(c => c && (c.typ === key || c.type === key));
    if (hit && hit.val) return String(hit.val);
  }
  return '';
}

function fromSwaPrincipal(p) {
  if (!p) return null;
  const claims = p.claims || [];
  const upn = (claimValue(claims, CLAIM.upn) || p.userDetails || '').toLowerCase();
  if (!upn) return null;
  return {
    upn,
    name: claimValue(claims, CLAIM.name) || p.userDetails || upn,
    tid: (claimValue(claims, CLAIM.tid) || '').toLowerCase(),
    oid: claimValue(claims, CLAIM.oid) || p.userId || '',
    identityProvider: p.identityProvider || 'aad',
    swaRoles: p.userRoles || []
  };
}

function fromRequest(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (header) {
    try {
      const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
      return fromSwaPrincipal(decoded);
    } catch (e) { return null; }
  }
  if (!config.isProduction && config.devPrincipal) {
    try {
      const d = JSON.parse(config.devPrincipal);
      return { upn: String(d.upn || '').toLowerCase(), name: d.name || d.upn, tid: String(d.tid || config.tenantId).toLowerCase(), oid: d.oid || 'dev', identityProvider: 'dev', swaRoles: [] };
    } catch (e) { return null; }
  }
  return null;
}

module.exports = { fromRequest, fromSwaPrincipal, claimValue };
