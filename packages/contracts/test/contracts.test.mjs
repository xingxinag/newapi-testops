import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklist, ENDPOINT_PRESETS, redactHeaders, scoreFromChecklist, validateJobInput, validateNotificationConfig, validateScheduleInput, validateStorageConfig } from '../src/contracts.mjs';

test('validateJobInput normalizes a text test request', () => {
  const input = validateJobInput({ baseUrl: 'https://api.example.com/', model: 'gpt-test', mode: 'text', concurrency: 2, durationSeconds: 3 });
  assert.equal(input.baseUrl, 'https://api.example.com');
  assert.equal(input.endpoint, '/v1/chat/completions');
  assert.equal(input.concurrency, 2);
});

test('validateJobInput rejects models-list endpoint preset', () => {
  assert.throws(() => validateJobInput({
    baseUrl: 'https://api.example.com',
    model: 'gpt-test',
    mode: 'text',
    endpointPreset: 'models-list',
  }), /endpointPreset must be one of/);
});

test('validateJobInput preserves default endpoint compatibility for existing modes', () => {
  assert.equal(validateJobInput({ baseUrl: 'x', model: 'm', mode: 'image' }).endpoint, '/v1/images/generations');
  assert.equal(validateJobInput({ baseUrl: 'x', model: 'm', mode: 'aspect-ratio' }).endpoint, '/v1beta/models/{model}:generateContent');
});

test('validateJobInput rejects unsupported endpoint preset', () => {
  assert.throws(() => validateJobInput({ baseUrl: 'x', model: 'm', mode: 'text', endpointPreset: 'bad-preset' }), /endpointPreset must be one of/);
});

test('ENDPOINT_PRESETS exports the core endpoint preset names', () => {
  assert.deepEqual(ENDPOINT_PRESETS, [
    'openai-chat',
    'openai-responses',
    'claude-messages',
    'gemini-generate-content',
    'openai-image-generation',
  ]);
});

test('validateJobInput rejects unsupported mode', () => {
  assert.throws(() => validateJobInput({ baseUrl: 'x', model: 'm', mode: 'video' }), /mode must be one of/);
});

test('validateJobInput supports history naming access metadata and question bank image prompts', () => {
  const input = validateJobInput({
    baseUrl: 'https://api.example.com',
    model: 'gpt-test',
    mode: 'text',
    historyNameMode: 'custom',
    historyName: '  nightly smoke  ',
    accessScope: 'team',
    accessPassword: 'view-pass',
    accountId: 'account-1',
    teamId: 'team-1',
    questionBank: [
      { type: 'text', prompt: 'Say OK.' },
      { type: 'image', prompt: 'Describe this image.', imageUrl: 'https://example.com/cat.png' },
    ],
  });
  assert.equal(input.historyNameMode, 'custom');
  assert.equal(input.historyName, 'nightly smoke');
  assert.equal(input.accessScope, 'team');
  assert.equal(input.accessPassword, 'view-pass');
  assert.equal(input.accountId, 'account-1');
  assert.equal(input.teamId, 'team-1');
  assert.deepEqual(input.questionBank, [
    { type: 'text', prompt: 'Say OK.' },
    { type: 'image', prompt: 'Describe this image.', imageUrl: 'https://example.com/cat.png' },
  ]);
});

test('validateJobInput rejects invalid history naming access metadata and question bank entries', () => {
  assert.throws(() => validateJobInput({ baseUrl: 'x', model: 'm', mode: 'text', historyNameMode: 'custom', historyName: '   ' }), /historyName is required/);
  assert.throws(() => validateJobInput({ baseUrl: 'x', model: 'm', mode: 'text', historyNameMode: 'parameters', accessScope: 'org' }), /accessScope must be one of/);
  assert.throws(() => validateJobInput({ baseUrl: 'x', model: 'm', mode: 'text', questionBank: [{ type: 'image', prompt: 'Look' }] }), /imageUrl is required/);
});

test('validateScheduleInput supports cron while preserving intervalSeconds compatibility', () => {
  const interval = validateScheduleInput({ name: 'interval sample', intervalSeconds: 120, input: { baseUrl: 'x', model: 'm', mode: 'text' } });
  assert.equal(interval.intervalSeconds, 120);
  assert.equal(interval.cron, undefined);

  const cron = validateScheduleInput({ name: 'cron sample', cron: '*/5 * * * *', input: { baseUrl: 'x', model: 'm', mode: 'text' } });
  assert.equal(cron.cron, '*/5 * * * *');
  assert.equal(cron.intervalSeconds, undefined);
});

test('validateStorageConfig normalizes JSON-backed storage config and masks secrets', () => {
  const config = validateStorageConfig({
    provider: 'r2',
    bucket: ' test-bucket ',
    endpoint: ' https://storage.example.com ',
    region: 'auto',
    accessKeyId: 'access-id',
    secretAccessKey: 'super-secret-key',
    retentionDays: 30,
  });
  assert.equal(config.provider, 'r2');
  assert.equal(config.bucket, 'test-bucket');
  assert.equal(config.endpoint, 'https://storage.example.com');
  assert.equal(config.secretAccessKey, 'super-secret-key');
  assert.equal(config.retentionDays, 30);
  assert.equal(validateStorageConfig.mask(config).secretAccessKey, 'supe**********ey');
});

test('validateNotificationConfig normalizes JSON-backed notification config and template', () => {
  const config = validateNotificationConfig({
    enabled: true,
    channel: 'webhook',
    webhookUrl: ' https://hooks.example.com/test ',
    template: { title: ' {{displayName}} ', body: 'Job {{status}} finished' },
  });
  assert.equal(config.enabled, true);
  assert.equal(config.channel, 'webhook');
  assert.equal(config.webhookUrl, 'https://hooks.example.com/test');
  assert.deepEqual(config.template, { title: '{{displayName}}', body: 'Job {{status}} finished' });
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
