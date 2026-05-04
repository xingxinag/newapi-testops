import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../src/server.mjs';

test('GET /api/analytics/trends returns empty series without jobs', async () => {
  const fixture = await startServer();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/analytics/trends`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json.data, []);
  } finally {
    await fixture.close();
  }
});

test('GET /api/analytics/trends returns oldest-to-newest chart points', async () => {
  const fixture = await startServer();
  try {
    await fixture.store.writeJobs([
      job({ runId: 'run_new', createdAt: '2026-05-04T04:02:00.000Z', score: 80, successCount: 8, failureCount: 2, rateLimitedCount: 2, p95: 120, successRpm: 15, overallRps: 0.5 }),
      job({ runId: 'run_old', createdAt: '2026-05-04T04:01:00.000Z', score: 100, successCount: 10, failureCount: 0, rateLimitedCount: 0, p95: 80, successRpm: 20, overallRps: 1 }),
    ]);

    const response = await fetch(`${fixture.baseUrl}/api/analytics/trends`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json.data.map((point) => point.runId), ['run_old', 'run_new']);
    assert.deepEqual(json.data.map((point) => point.successRate), [1, 0.8]);
    assert.equal(json.data[1].latencyP95, 120);
    assert.equal(json.data[1].failureCount, 2);
    assert.equal(json.data[1].rateLimitedCount, 2);
    assert.equal(json.data[1].successRpm, 15);
    assert.equal(json.data[1].overallRps, 0.5);
  } finally {
    await fixture.close();
  }
});

async function startServer() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-analytics-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, store: server.store, close: () => new Promise((resolve) => server.close(resolve)) };
}

function job(overrides) {
  return {
    runId: overrides.runId,
    status: 'completed',
    createdAt: overrides.createdAt,
    completedAt: overrides.createdAt,
    input: { model: 'analytics-model', mode: 'text', executionMode: 'synthetic' },
    score: overrides.score,
    summary: { totalRequests: 10, successCount: overrides.successCount, failureCount: overrides.failureCount, rateLimitedCount: overrides.rateLimitedCount, timeoutCount: 0, latencyMs: { min: 10, p50: 40, p95: overrides.p95, max: 150 }, throughput: { successRpm: overrides.successRpm, overallRps: overrides.overallRps }, tokens: { input: 1, output: 2, total: 3 } },
    checks: [],
    artifacts: [],
  };
}
