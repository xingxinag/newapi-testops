import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArtifactStore } from '../src/artifacts.mjs';
import { runDueSchedules } from '../src/scheduler.mjs';

test('runDueSchedules runs one due schedule and advances nextRunAt', async () => {
  const store = await createStore();
  await store.writeSchedules([schedule({ nextRunAt: '2026-05-04T04:00:00.000Z' })]);

  const result = await runDueSchedules(store, { now: new Date('2026-05-04T04:00:01.000Z') });
  const [updated] = await store.readSchedules();
  const jobs = await store.readJobs();

  assert.equal(result.ran, 1);
  assert.equal(jobs.length, 1);
  assert.equal(updated.lastRunId, jobs[0].runId);
  assert.equal(updated.runningRunId, undefined);
  assert.equal(updated.history.length, 1);
  assert.equal(updated.nextRunAt, '2026-05-04T04:01:01.000Z');
});

test('runDueSchedules skips schedules that are not due', async () => {
  const store = await createStore();
  await store.writeSchedules([schedule({ nextRunAt: '2026-05-04T04:01:00.000Z' })]);

  const result = await runDueSchedules(store, { now: new Date('2026-05-04T04:00:01.000Z') });

  assert.equal(result.ran, 0);
  assert.deepEqual(await store.readJobs(), []);
});

test('runDueSchedules respects active unexpired schedule leases', async () => {
  const store = await createStore();
  await store.writeSchedules([schedule({ nextRunAt: '2026-05-04T04:00:00.000Z', runningRunId: 'run_existing', leaseUntil: '2026-05-04T04:05:00.000Z' })]);

  const result = await runDueSchedules(store, { now: new Date('2026-05-04T04:00:01.000Z') });

  assert.equal(result.ran, 0);
  assert.deepEqual(await store.readJobs(), []);
});

async function createStore() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-scheduler-'));
  return createArtifactStore({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });
}

function schedule(overrides = {}) {
  return {
    scheduleId: 'schedule_test',
    name: 'Scheduler test',
    intervalSeconds: 60,
    createdAt: '2026-05-04T03:59:00.000Z',
    input: { baseUrl: 'https://api.example.com', apiKey: '[redacted]', model: 'scheduler-model', mode: 'text', executionMode: 'synthetic', concurrency: 1, durationSeconds: 1 },
    lastRunId: null,
    history: [],
    ...overrides,
  };
}
