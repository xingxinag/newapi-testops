import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklist, redactHeaders, scoreFromChecklist, validateJobInput } from '../src/contracts.mjs';

test('validateJobInput normalizes a text test request', () => {
  const input = validateJobInput({ baseUrl: 'https://api.example.com/', model: 'gpt-test', mode: 'text', concurrency: 2, durationSeconds: 3 });
  assert.equal(input.baseUrl, 'https://api.example.com');
  assert.equal(input.endpoint, '/v1/chat/completions');
  assert.equal(input.concurrency, 2);
});

test('validateJobInput rejects unsupported mode', () => {
  assert.throws(() => validateJobInput({ baseUrl: 'x', model: 'm', mode: 'video' }), /mode must be one of/);
});

test('redactHeaders removes secret-bearing headers', () => {
  assert.deepEqual(redactHeaders({ Authorization: 'Bearer abc', 'Content-Type': 'application/json' }), {
    Authorization: '[redacted]',
    'Content-Type': 'application/json',
  });
});

test('scoreFromChecklist maps relayAPI style checks to a 100 point score', () => {
  const checks = buildChecklist({ statusCode: 200, bodyText: '{"model":"demo","content":"ok"}', latencyMs: 80, model: 'demo' });
  assert.equal(scoreFromChecklist(checks), 100);
});
