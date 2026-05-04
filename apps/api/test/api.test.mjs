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
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ headers: req.headers, body });
    const status = options.statuses ? options.statuses[count % options.statuses.length] : 200;
    count += 1;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: status >= 200 && status < 300, model: body.model, received: true, usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
