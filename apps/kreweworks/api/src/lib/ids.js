'use strict';
const crypto = require('crypto');
// Short, sortable, human-friendly ids: <prefix>-<yyyymmdd>-<6 chars>
function newId(prefix) {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rnd = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `${prefix}-${ymd}-${rnd}`;
}
function eventKey() {
  // Sortable row key: ISO timestamp + random suffix so same-millisecond events never collide.
  return `${new Date().toISOString()}-${crypto.randomBytes(2).toString('hex')}`;
}
module.exports = { newId, eventKey };
