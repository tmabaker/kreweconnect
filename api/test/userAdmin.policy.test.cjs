const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePassword,
  normalizeE164,
  validateApprovedPassword,
  validateManagerIdentity,
} = require('../dist/src/lib/userAdmin.js');

test('generated passwords satisfy the approved 10-character policy', () => {
  for (let i = 0; i < 100; i += 1) {
    const password = generatePassword();
    assert.equal(password.length, 10);
    assert.doesNotThrow(() => validateApprovedPassword(password));
    assert.match(password, /[a-zA-Z]/);
    assert.match(password, /[2-9]/);
    assert.match(password, /[?!@#$%&]/);
    assert.doesNotMatch(password, /[IlO01]/);
  }
});

test('invalid password shapes fail closed', () => {
  assert.throws(() => validateApprovedPassword('Abcdef2!'), /exactly 10/);
  assert.throws(() => validateApprovedPassword('Abcdefgh2*'), /exactly 10/);
});

test('phone values normalize to E.164 and invalid local values fail', () => {
  assert.equal(normalizeE164('(225) 490-7649'), '+12254907649');
  assert.equal(normalizeE164('+44 20 7946 0958'), '+442079460958');
  assert.throws(() => normalizeE164('490-7649'), /E\.164/);
});

test('manager must be a unique directory identity', () => {
  assert.equal(validateManagerIdentity('manager@geauxautomotive.com'), 'manager@geauxautomotive.com');
  assert.equal(validateManagerIdentity('d5fe2f90-0be4-4d02-a378-f085aeb8f413'), 'd5fe2f90-0be4-4d02-a378-f085aeb8f413');
  assert.throws(() => validateManagerIdentity('Jane Manager'), /display name/);
});
