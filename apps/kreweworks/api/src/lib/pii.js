'use strict';
// Field-level encryption for the handful of values the packet must collect for the background check,
// MVR and drug screen (SSN, date of birth, driver's license number). AES-256-GCM with a key from
// PORTAL_PII_KEY (base64, 32 bytes). Values are stored as "enc:v1:<iv>:<tag>:<ciphertext>" in base64.
// Only HR and admins may decrypt, and every reveal is written to the request timeline.
const crypto = require('crypto');

function key() {
  const raw = process.env.PORTAL_PII_KEY || '';
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('PORTAL_PII_KEY must be 32 bytes, base64 encoded.');
  return buf;
}
function configured() { return !!key(); }

function encrypt(plain) {
  const k = key();
  if (!k) throw new Error('PII encryption is not configured (PORTAL_PII_KEY).');
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}
function decrypt(value) {
  if (!value) return '';
  if (!String(value).startsWith('enc:v1:')) return String(value);
  const k = key();
  if (!k) throw new Error('PII encryption is not configured (PORTAL_PII_KEY).');
  const [, , iv, tag, ct] = String(value).split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
// What everyone except HR sees.
function mask(kind, value) {
  if (!value) return '';
  if (kind === 'ssn') return '***-**-' + (String(value).replace(/\D/g, '').slice(-4) || '****');
  if (kind === 'date') return 'on file';
  return 'on file';
}
module.exports = { configured, encrypt, decrypt, mask };
