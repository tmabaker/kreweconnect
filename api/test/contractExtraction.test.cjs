// The extraction request: locked lists become schema enums, and the answer is
// parsed from the structured output. The Claude client is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const Anthropic = require('@anthropic-ai/sdk');

const { extractionSchema, extractContractFields } = require('../dist/src/lib/contractExtraction.js');

const picklist = { locations: ['FH Baton Rouge', 'FH New Orleans'], departments: [] };

test('schema locks category, tags, and the tenant lists', () => {
  const schema = extractionSchema(picklist);
  assert.ok(schema.properties.agreementCategory.enum.includes('Lease'));
  assert.ok(!schema.properties.agreementCategory.enum.includes('Gym'));
  assert.deepEqual(schema.properties.location.anyOf[0].enum, picklist.locations);
  assert.deepEqual(schema.properties.department, { type: 'null' });
  assert.ok(schema.properties.tags.items.enum.includes('Security'));
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
  assert.equal(schema.additionalProperties, false);
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
      content: [{ type: 'text', text: JSON.stringify({ title: 'Lease', location: 'FH New Orleans' }) }],
    };
  };
  try {
    const out = await extractContractFields(Buffer.from('%PDF-1.4'), 'application/pdf', picklist, null);
    assert.equal(out.fields.location, 'FH New Orleans');
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
