import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../src/server.mjs';

test('POST /api/jobs creates a completed synthetic run with artifacts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', apiKey: 'secret-key', model: 'demo-model', mode: 'text', concurrency: 2, durationSeconds: 2 }),
    });
    assert.equal(response.status, 201);
    const json = await response.json();
    assert.equal(json.data.status, 'completed');
    assert.equal(json.data.summary.totalRequests, 4);
    assert.equal(json.data.artifacts.length, 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/jobs supports live HTTP probe execution', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const upstream = await startJsonUpstream();
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: upstream.baseUrl, apiKey: 'live-secret', model: 'live-model', mode: 'text', concurrency: 1, durationSeconds: 1, executionMode: 'live', retainFullBodies: true }),
    });
    assert.equal(response.status, 201);
    const json = await response.json();
    assert.equal(json.data.status, 'completed');
    assert.equal(json.data.response.statusCode, 200);
    assert.equal(json.data.response.body.model, 'live-model');
    assert.equal(upstream.requests.length, 1);
    assert.equal(upstream.requests[0].headers.authorization, 'Bearer live-secret');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await upstream.close();
  }
});

test('POST /api/jobs runs live probes for concurrency multiplied by duration', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const upstream = await startJsonUpstream();
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: upstream.baseUrl, apiKey: 'live-secret', model: 'live-model', mode: 'text', concurrency: 3, durationSeconds: 2, executionMode: 'live' }),
    });
    assert.equal(response.status, 201);
    const json = await response.json();
    assert.equal(json.data.status, 'completed');
    assert.equal(json.data.summary.totalRequests, 6);
    assert.equal(json.data.summary.successCount, 6);
    assert.equal(upstream.requests.length, 6);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await upstream.close();
  }
});

test('POST /api/jobs records rich live benchmark metrics from real samples', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const upstream = await startJsonUpstream({ statuses: [200, 429, 200, 429] });
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: upstream.baseUrl, apiKey: 'live-secret', model: 'live-model', mode: 'text', concurrency: 2, durationSeconds: 2, executionMode: 'live' }),
    });
    assert.equal(response.status, 201);
    const json = await response.json();
    assert.equal(json.data.summary.totalRequests, 4);
    assert.equal(json.data.summary.successCount, 2);
    assert.equal(json.data.summary.rateLimitedCount, 2);
    assert.equal(json.data.summary.throughput.successRpm > 0, true);
    assert.equal(json.data.summary.throughput.overallRps > 0, true);
    assert.equal(json.data.summary.latencyMs.avg > 0, true);
    assert.equal(json.data.summary.latencyMs.p90 >= json.data.summary.latencyMs.p50, true);
    assert.equal(json.data.summary.latencyMs.p99 >= json.data.summary.latencyMs.p90, true);
    assert.equal(json.data.summary.responseBytes.avg > 0, true);
    assert.equal(json.data.summary.responseBytes.p90 >= json.data.summary.responseBytes.p50, true);
    assert.equal(json.data.summary.errors.status_429, 2);
    assert.equal(json.data.summary.concurrency.max, 2);
    assert.equal(json.data.summary.concurrency.avg > 0, true);
    assert.equal(json.data.summary.ttfb.avg > 0, true);
    assert.equal(json.data.summary.queueLatency.avg >= 0, true);

    const artifactResponse = await fetch(`http://127.0.0.1:${port}/api/jobs/${json.data.runId}/artifacts/response.json`);
    const artifact = await artifactResponse.json();
    assert.equal(artifact.samples.length, 4);
    assert.equal(artifact.samples[0].responseBytes > 0, true);
    assert.equal(artifact.samples[0].ttfbMs > 0, true);
    assert.equal(artifact.samples[0].activeRequests >= 1, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await upstream.close();
  }
});

test('POST /api/jobs stores displayName from custom and parameter history naming metadata', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const customResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', model: 'demo-model', mode: 'text', concurrency: 1, durationSeconds: 1, historyNameMode: 'custom', historyName: '  Nightly smoke  ' }),
    });
    assert.equal(customResponse.status, 201);
    const custom = await customResponse.json();
    assert.equal(custom.data.displayName, 'Nightly smoke');

    const parameterResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', model: 'demo-model', mode: 'image', endpointPreset: 'openai-image-generation', concurrency: 3, durationSeconds: 2, historyNameMode: 'parameters' }),
    });
    assert.equal(parameterResponse.status, 201);
    const parameter = await parameterResponse.json();
    assert.match(parameter.data.displayName, /image/);
    assert.match(parameter.data.displayName, /demo-model/);
    assert.match(parameter.data.displayName, /c3/);

    const jobs = await (await fetch(`http://127.0.0.1:${port}/api/jobs`)).json();
    assert.equal(jobs.data[0].displayName, parameter.data.displayName);
    assert.equal(jobs.data[1].displayName, 'Nightly smoke');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/jobs uses exact default and sorted-parameter history names', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const defaultResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', model: 'demo-model', mode: 'text', concurrency: 1, durationSeconds: 1 }),
    });
    assert.equal(defaultResponse.status, 201);
    const created = await defaultResponse.json();
    assert.match(created.data.displayName, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} 文本 测试demo-model$/);

    const parameterResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', model: 'demo-model', mode: 'image', endpointPreset: 'openai-image-generation', concurrency: 3, durationSeconds: 2, executionMode: 'live', historyNameMode: 'parameters', historyNameFields: ['model', 'mode', 'concurrency'] }),
    });
    assert.equal(parameterResponse.status, 201);
    const parameter = await parameterResponse.json();
    assert.equal(parameter.data.displayName, '并发数=3 / 模型=demo-model / 测试模式=图像');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('question bank API supports create, update, import, and delete lifecycle', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/question-banks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Concurrent QA bank', items: [{ type: 'text', prompt: 'Say OK' }, { type: 'image-generation', prompt: 'Generate a cat poster', imageUrl: 'https://example.com/cat.png' }] }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.data.name, 'Concurrent QA bank');
    assert.equal(created.data.items[1].type, 'image-generation');

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/question-banks/${created.data.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated bank', items: [{ type: 'text', prompt: 'Updated prompt' }] }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.data.name, 'Updated bank');
    assert.equal(updated.data.items[0].prompt, 'Updated prompt');

    const importResponse = await fetch(`http://127.0.0.1:${port}/api/question-banks/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ banks: [{ name: 'Imported bank', items: [{ type: 'image-generation', prompt: 'Generate product photo' }] }] }),
    });
    assert.equal(importResponse.status, 201);
    const imported = await importResponse.json();
    assert.equal(imported.data.length, 1);
    assert.equal(imported.data[0].name, 'Imported bank');

    const list = await (await fetch(`http://127.0.0.1:${port}/api/question-banks`)).json();
    assert.deepEqual(list.data.map((bank) => bank.name), ['Imported bank', 'Updated bank']);

    const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/question-banks/${created.data.id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    const afterDelete = await (await fetch(`http://127.0.0.1:${port}/api/question-banks`)).json();
    assert.deepEqual(afterDelete.data.map((bank) => bank.name), ['Imported bank']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/jobs uses selected question bank prompts in request artifacts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const textResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', model: 'demo-model', mode: 'text', concurrency: 1, durationSeconds: 1, questionBank: [{ type: 'text', prompt: 'Explain NewAPI in one sentence.' }] }),
    });
    const textJob = await textResponse.json();
    const textArtifact = await (await fetch(`http://127.0.0.1:${port}/api/jobs/${textJob.data.runId}/artifacts/request.json`)).json();
    assert.equal(textArtifact.body.messages[0].content, 'Explain NewAPI in one sentence.');

    const imageResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', model: 'demo-model', mode: 'image', endpointPreset: 'openai-image-generation', concurrency: 1, durationSeconds: 1, questionBank: [{ type: 'image-generation', prompt: 'Generate a clean product photo.' }] }),
    });
    const imageJob = await imageResponse.json();
    const imageArtifact = await (await fetch(`http://127.0.0.1:${port}/api/jobs/${imageJob.data.runId}/artifacts/request.json`)).json();
    assert.equal(imageArtifact.body.prompt, 'Generate a clean product photo.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/jobs records failed live probe error samples and target report details', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const upstreamMessage = 'upstream exploded while processing chat completion';
  const upstream = await startJsonUpstream({ statuses: [500], responseBody: { error: { message: upstreamMessage } } });
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: upstream.baseUrl, apiKey: 'live-secret', model: 'live-model', mode: 'text', concurrency: 1, durationSeconds: 1, executionMode: 'live' }),
    });

    assert.equal(response.status, 201);
    const json = await response.json();
    assert.equal(json.data.status, 'failed');

    const responseArtifact = await (await fetch(`http://127.0.0.1:${port}/api/jobs/${json.data.runId}/artifacts/response.json`)).json();
    assert.equal(responseArtifact.samples.length, 1);
    assert.equal(responseArtifact.samples[0].errorType, 'status_500');
    assert.match(responseArtifact.samples[0].errorMessage, new RegExp(upstreamMessage));
    assert.match(responseArtifact.samples[0].bodyPreview, new RegExp(upstreamMessage));
    assert.equal(responseArtifact.samples[0].body, undefined);

    const reportArtifact = await (await fetch(`http://127.0.0.1:${port}/api/jobs/${json.data.runId}/artifacts/report.json`)).json();
    assert.deepEqual(reportArtifact.target, {
      endpoint: '/v1/chat/completions',
      method: 'POST',
      finalUrl: `${upstream.baseUrl}/v1/chat/completions`,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await upstream.close();
  }
});

test('POST /api/models fetches model IDs from /v1/models with bearer auth', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const upstream = await startJsonUpstream({ modelsResponse: { data: [{ id: 'alpha' }, { id: 'beta' }] } });
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: upstream.baseUrl, apiKey: 'secret-key' }),
    });
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.deepEqual(json, { success: true, data: [{ id: 'alpha', source: '/v1/models' }, { id: 'beta', source: '/v1/models' }] });
    assert.equal(upstream.requests.length, 1);
    assert.equal(upstream.requests[0].method, 'GET');
    assert.equal(upstream.requests[0].path, '/v1/models');
    assert.equal(upstream.requests[0].headers.authorization, 'Bearer secret-key');
    assert.equal(upstream.requests[0].headers['content-type'], undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await upstream.close();
  }
});

test('POST /api/models fetches Gemini-style model IDs from /v1beta/models by defaulting endpoint', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const upstream = await startJsonUpstream({ modelsResponse: { models: [{ name: 'models/gamma' }, { name: 'delta' }] } });
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: upstream.baseUrl, endpoint: '/v1beta/models' }),
    });
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.deepEqual(json, { success: true, data: [{ id: 'gamma', source: '/v1beta/models' }, { id: 'delta', source: '/v1beta/models' }] });
    assert.equal(upstream.requests.length, 1);
    assert.equal(upstream.requests[0].method, 'GET');
    assert.equal(upstream.requests[0].path, '/v1beta/models');
    assert.equal(upstream.requests[0].headers.authorization, undefined);
    assert.equal(upstream.requests[0].headers['content-type'], undefined);
    assert.equal(upstream.requests[0].body, '');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await upstream.close();
  }
});

test('GET /api/jobs/:runId/artifacts/:name returns stored artifact JSON', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', apiKey: 'secret-key', model: 'demo-model', mode: 'text', concurrency: 1, durationSeconds: 1 }),
    });
    const created = await createResponse.json();

    const artifactResponse = await fetch(`http://127.0.0.1:${port}/api/jobs/${created.data.runId}/artifacts/request.json`);
    assert.equal(artifactResponse.status, 200);
    assert.match(artifactResponse.headers.get('content-type'), /application\/json/);
    const artifact = await artifactResponse.json();
    assert.equal(artifact.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(artifact.headers.Authorization, '[redacted]');
    assert.equal(artifact.body.model, 'demo-model');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/schedules creates a sampling schedule and immediately runs one job', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/schedules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'daily sample', intervalSeconds: 3600, input: { baseUrl: 'https://api.example.com', apiKey: 'secret-key', model: 'sample-model', mode: 'text', concurrency: 1, durationSeconds: 1 } }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.data.name, 'daily sample');
    assert.equal(created.data.intervalSeconds, 3600);
    assert.equal(created.data.history.length, 1);
    assert.equal(created.data.lastRunId, created.data.history[0].runId);
    assert.match(created.data.history[0].startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(created.data.history[0].completedAt, /^\d{4}-\d{2}-\d{2}T/);

    const jobsResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`);
    const jobs = await jobsResponse.json();
    assert.equal(jobs.data[0].runId, created.data.lastRunId);
    assert.equal(jobs.data[0].input.sampling.strategy, 'scheduled');

    const schedulesResponse = await fetch(`http://127.0.0.1:${port}/api/schedules`);
    const schedules = await schedulesResponse.json();
    assert.equal(schedules.data[0].scheduleId, created.data.scheduleId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/schedules stores cron schedules without intervalSeconds', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/schedules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'cron sample', cron: '*/10 * * * *', input: { baseUrl: 'https://api.example.com', model: 'sample-model', mode: 'text', concurrency: 1, durationSeconds: 1 } }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.data.cron, '*/10 * * * *');
    assert.equal(created.data.intervalSeconds, undefined);
    assert.match(created.data.nextRunAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET and POST /api/config/storage persist JSON config with masked secret', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const savedResponse = await fetch(`http://127.0.0.1:${port}/api/config/storage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 's3', bucket: 'bucket-a', endpoint: 'https://storage.example.com', region: 'auto', accessKeyId: 'access-id', secretAccessKey: 'super-secret-key', retentionDays: 14 }),
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal(saved.data.secretAccessKey, 'supe**********ey');
    assert.equal(JSON.stringify(saved).includes('super-secret-key'), false);

    const loaded = await (await fetch(`http://127.0.0.1:${port}/api/config/storage`)).json();
    assert.equal(loaded.data.secretAccessKey, 'supe**********ey');
    assert.equal(loaded.data.retentionDays, 14);
    assert.equal(JSON.stringify(loaded).includes('super-secret-key'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET and POST /api/config/notifications persist JSON notification template', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const savedResponse = await fetch(`http://127.0.0.1:${port}/api/config/notifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, channel: 'webhook', webhookUrl: 'https://hooks.example.com/test', template: { title: 'Job {{displayName}}', body: '{{status}}' } }),
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.deepEqual(saved.data.template, { title: 'Job {{displayName}}', body: '{{status}}' });

    const loaded = await (await fetch(`http://127.0.0.1:${port}/api/config/notifications`)).json();
    assert.equal(loaded.data.enabled, true);
    assert.equal(loaded.data.channel, 'webhook');
    assert.deepEqual(loaded.data.template, { title: 'Job {{displayName}}', body: '{{status}}' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('OPTIONS preflight allows JSON API requests from static frontends', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/schedules`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://127.0.0.1:8795',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8795');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
    assert.match(response.headers.get('access-control-allow-headers'), /content-type/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function startJsonUpstream(options = {}) {
  const http = await import('node:http');
  const requests = [];
  let count = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const body = bodyText ? JSON.parse(bodyText) : null;
    requests.push({ method: req.method, path: req.url, headers: req.headers, body: bodyText, json: body });
    const status = options.statuses ? options.statuses[count % options.statuses.length] : 200;
    count += 1;
    res.writeHead(status, { 'content-type': 'application/json' });
    if (options.modelsResponse) {
      res.end(JSON.stringify(options.modelsResponse));
      return;
    }
    const model = body && typeof body === 'object' ? body.model : null;
    res.end(JSON.stringify(options.responseBody || { ok: status >= 200 && status < 300, model, received: true, usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
