import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../src/server.mjs';

test('GET /api/jobs/:runId/export.csv returns a redacted summary CSV', async () => {
  const fixture = await createJobFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/jobs/${fixture.runId}/export.csv`);
    const csv = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(csv, /runId,status,score,method,endpoint,finalUrl,totalRequests,successCount,failureCount,rateLimitedCount,timeoutCount,successRpm,overallRps,latencyAvg,latencyP50,latencyP90,latencyP95,latencyP99,tokensTotal/);
    assert.match(csv, new RegExp(`${fixture.runId},completed,100,POST,/v1/chat/completions,https://api.example.com/v1/chat/completions,1,1,0`));
    assert.doesNotMatch(csv, /export-secret/);
  } finally {
    await fixture.close();
  }
});

test('GET /api/jobs/:runId/export.html returns a standalone escaped report', async () => {
  const fixture = await createJobFixture({ model: '<html-model>' });
  try {
    const response = await fetch(`${fixture.baseUrl}/api/jobs/${fixture.runId}/export.html`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /&lt;html-model&gt;/);
    assert.match(html, /<strong>Method:<\/strong> POST/);
    assert.match(html, /<strong>Endpoint:<\/strong> \/v1\/chat\/completions/);
    assert.match(html, /<strong>Final URL:<\/strong> https:\/\/api\.example\.com\/v1\/chat\/completions/);
    assert.match(html, /吞吐量 KPI/);
    assert.match(html, /延迟分析/);
    assert.doesNotMatch(html, /export-secret/);
  } finally {
    await fixture.close();
  }
});

test('GET /api/jobs/:runId/export.zip returns a zip bundle', async () => {
  const fixture = await createJobFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/jobs/${fixture.runId}/export.zip`);
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/zip/);
    assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');
  } finally {
    await fixture.close();
  }
});

async function createJobFixture(overrides = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-export-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const response = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'https://api.example.com', apiKey: 'export-secret', model: overrides.model || 'export-model', mode: 'text', concurrency: 1, durationSeconds: 1 }),
  });
  const created = await response.json();
  return { baseUrl, runId: created.data.runId, close: () => new Promise((resolve) => server.close(resolve)) };
}
