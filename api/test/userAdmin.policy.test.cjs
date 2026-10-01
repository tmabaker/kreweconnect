const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  generatePassword,
  normalizeE164,
  validateApprovedPassword,
  validateManagerIdentity,
  normalizeEndpointName,
} = require('../dist/src/lib/userAdmin.js');

test('generated passwords satisfy the approved 10-character policy', () => {
  for (let i = 0; i < 100; i += 1) {
    const password = generatePassword();
    assert.equal(password.length, 10);
    assert.doesNotThrow(() => validateApprovedPassword(password));
    assert.match(password, /[a-zA-Z]/);
    assert.match(password, /[1-9]/);
    assert.match(password, /[?!@#$%&]/);
    assert.doesNotMatch(password, /[IlO0]/);
  }
});

test('approved passwords permit 8 to 10 characters and fail closed outside the contract', () => {
  assert.doesNotThrow(() => validateApprovedPassword('Abcdef1!'));
  assert.doesNotThrow(() => validateApprovedPassword('Abcdefg1!'));
  assert.doesNotThrow(() => validateApprovedPassword('Abcdefgh1!'));
  assert.throws(() => validateApprovedPassword('Abcde1!'), /8 to 10/);
  assert.throws(() => validateApprovedPassword('Abcdefghi1!'), /8 to 10/);
  assert.throws(() => validateApprovedPassword('Abcdefgh1*'), /8 to 10/);
  assert.throws(() => generatePassword(7), /between 8 and 10/);
  assert.throws(() => generatePassword(11), /between 8 and 10/);
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

test('Geaux endpoint names normalize and fail closed', () => {
  assert.equal(normalizeEndpointName('ga-btrc-pc2', true), 'GA-BTRC-PC2');
  assert.equal(normalizeEndpointName('', false), '');
  assert.throws(() => normalizeEndpointName('', true), /required/);
  assert.throws(() => normalizeEndpointName('bad endpoint', true), /3 to 15/);
  assert.throws(() => normalizeEndpointName('GA-BTRC-PC-TOO-LONG', true), /3 to 15/);
});

test('manager-only updates support both assignment and explicit clearing', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'userAdmin.ts'), 'utf8');
  assert.match(source, /hasOwnProperty\.call\(input, "managerId"\)/);
  assert.match(source, /input\.managerId === null \|\| input\.managerId === ""/);
  assert.match(source, /"DELETE", `\/users\/\$\{encodeURIComponent\(userId\)\}\/manager\/\$ref`/);
  assert.match(source, /"PUT", `\/users\/\$\{encodeURIComponent\(userId\)\}\/manager\/\$ref`/);
});

test('Geaux creation treats MFA registration as a credential-delivery gate', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'userAdmin.ts'), 'utf8');
  assert.match(source, /authentication\/phoneMethods/);
  assert.match(source, /phoneType:\s*"mobile"/);
  assert.match(source, /deliveryReady:\s*boolean/);
  assert.doesNotMatch(source, /password:\s*deliveryReady \? password : undefined/);
  assert.match(source, /deliverGeauxCredentials/);
  assert.match(source, /credentialDelivery\.complete/);
  assert.match(source, /phoneLast4/);
});

test('credential delivery executes CallRail before manager mail and returns metadata only', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'credentialDelivery.ts'), 'utf8');
  const text = source.indexOf('sendCallRailPassword(input.mobilePhone');
  const mail = source.indexOf('sendManagerCredentialEmail(', text);
  assert.ok(text > -1 && mail > text);
  assert.match(source, /DELIVERY_ATTEMPTS = 10/);
  assert.match(source, /submitLifecycleFailureAlert/);
  assert.match(source, /component: "callRail"/);
  assert.match(source, /component: "managerEmail"/);
  assert.match(source, /destinationLast4/);
  assert.match(source, /messageId/);
  assert.doesNotMatch(source, /password:\s*input\.password/);
  assert.match(source, /Employee delivery must succeed first/);
});

test('manager mail uses the send-only app and verifies final delivery with the tenant Graph app', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'credentialDelivery.ts'), 'utf8');
  assert.match(source, /getMailSendToken/);
  assert.match(source, /geauxMailClientId/);
  assert.match(source, /\/sendMail/);
  assert.match(source, /mailFolders\/inbox\/messages/);
  assert.match(source, /geauxManagerMailTriggerHeader/);
  assert.match(source, /geauxManagerMailAppliedHeader/);
  assert.match(source, /Outlook encryption marker/);
  assert.match(source, /encryptionVerified: true/);
  assert.match(source, /Manager mail was accepted by Graph but was not verified/);
  assert.match(source, /messageId: delivered\.id/);
});

test('MFA retry endpoint returns only nonsecret phone metadata', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'functions', 'userAdmin.ts'), 'utf8');
  assert.match(source, /route:\s*"tenants\/\{tenantId\}\/users\/\{userId\}\/mfaPhone"/);
  assert.match(source, /phoneLast4:\s*method\.phoneNumber\.slice\(-4\)/);
  assert.doesNotMatch(source, /jsonBody:\s*\{[^}]*phoneNumber:/s);
});

test('Geaux creation requires and pre-resolves a direct manager before account creation', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'userAdmin.ts'), 'utf8');
  const managerGate = source.indexOf('A direct manager must be selected before creating a Geaux Automotive user.');
  const managerLookup = source.indexOf('manager = await fetchUserById(tenantId, managerId)');
  const accountCreate = source.indexOf('"POST", "/users", body');
  assert.ok(managerGate > -1);
  assert.ok(managerLookup > managerGate);
  assert.ok(accountCreate > managerLookup);
  assert.match(source, /email: manager\.mail \|\| manager\.userPrincipalName/);
});

test('Geaux creation and modification persist Endpoint Name in extensionAttribute1', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'userAdmin.ts'), 'utf8');
  assert.ok(source.includes("normalizeEndpointName(input.endpointName, true)"));
  assert.ok(source.includes("body.onPremisesExtensionAttributes = { extensionAttribute1: endpointName }"));
  assert.ok(source.includes("hasOwnProperty.call(input, \"endpointName\")"));
  assert.ok(source.includes("extensionAttribute1: normalizeEndpointName(input.endpointName) || null"));
});
