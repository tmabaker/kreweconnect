// The extraction request: locked lists become schema enums, and the answer is
// parsed from the structured output. The Claude client is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const Anthropic = require('@anthropic-ai/sdk');

const { extractionSchema, extractContractFields, emptyToNull } = require('../dist/src/lib/contractExtraction.js');

const picklist = { locations: ['FH Baton Rouge', 'FH New Orleans'], departments: [] };

test('schema locks category, tags, and the tenant lists', () => {
  const schema = extractionSchema(picklist);
  assert.ok(schema.properties.agreementCategory.enum.includes('Lease'));
  assert.ok(!schema.properties.agreementCategory.enum.includes('Gym'));
  assert.deepEqual(schema.properties.location.enum, ['', ...picklist.locations]);
  assert.deepEqual(schema.properties.department.enum, ['']);
  assert.ok(schema.properties.tags.items.enum.includes('Security'));
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
  assert.equal(schema.additionalProperties, false);
});

// The API rejects a schema with more than 16 union-typed parameters
// ("Schemas contains too many parameters with union types"); every upload
// failed on that before this limit was respected.
test('schema stays within the structured-output union limit', () => {
  let unions = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.anyOf) || Array.isArray(node.type)) unions++;
    Object.values(node).forEach(walk);
  };
  walk(extractionSchema({ locations: ['A'], departments: ['B'] }));
  assert.ok(unions <= 16, `${unions} union-typed parameters`);
});

test('empty answers become null, lists drop blanks', () => {
  assert.deepEqual(
    emptyToNull({ endDate: '', title: 'Lease', totalValue: null, tags: ['', 'Security'], contacts: [{ name: '', role: 'Support' }] }),
    { endDate: null, title: 'Lease', totalValue: null, tags: ['Security'], contacts: [{ name: null, role: 'Support' }] }
  );
});

test('a request carries the document, the schema, and the fallback setting', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let sent;
  const original = Anthropic.default.Beta.Messages.prototype.create;
  Anthropic.default.Beta.Messages.prototype.create = async function (body) {
    sent = body;
    return {
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({ title: 'Lease', location: 'FH New Orleans', endDate: '' }) }],
    };
  };
  try {
    const out = await extractContractFields(Buffer.from('%PDF-1.4'), 'application/pdf', picklist, null);
    assert.equal(out.fields.location, 'FH New Orleans');
    assert.equal(out.fields.endDate, null);
    assert.equal(sent.model, 'claude-opus-5-5');
    assert.equal(sent.fallbacks, 'default');
    assert.deepEqual(sent.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(sent.output_config.format.type, 'json_schema');
    assert.equal(sent.messages[0].content[0].type, 'document');
    assert.equal(sent.messages[0].content[0].source.media_type, 'application/pdf');
    assert.match(sent.system, /FH Baton Rouge; FH New Orleans/);
  } finally {
    Anthropic.default.Beta.Messages.prototype.create = original;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('review questions are capped at what a save accepts', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const original = Anthropic.default.Beta.Messages.prototype.create;
  const many = Array.from({ length: 30 }, (_, i) => `Question ${i + 1}?`);
  Anthropic.default.Beta.Messages.prototype.create = async () => ({
    model: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 'Lease', reviewQuestions: many }) }],
  });
  try {
    const out = await extractContractFields(Buffer.from('x'), 'text/plain', picklist, null);
    assert.equal(out.fields.reviewQuestions.length, 20);
    assert.equal(out.fields.reviewQuestions[0], 'Question 1?');
  } finally {
    Anthropic.default.Beta.Messages.prototype.create = original;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('a refusal becomes a readable error, not a crash', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const original = Anthropic.default.Beta.Messages.prototype.create;
  Anthropic.default.Beta.Messages.prototype.create = async () => ({ model: 'm', stop_reason: 'refusal', content: [] });
  try {
    await assert.rejects(
      extractContractFields(Buffer.from('x'), 'text/plain', picklist, null),
      /could not be read automatically/
    );
  } finally {
    Anthropic.default.Beta.Messages.prototype.create = original;
    delete process.env.ANTHROPIC_API_KEY;
  }
});
