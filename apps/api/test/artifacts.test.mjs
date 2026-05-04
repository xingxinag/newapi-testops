import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArtifactStore } from '../src/artifacts.mjs';

test('local artifact driver writes and reads JSON artifacts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-artifacts-'));
  const store = createArtifactStore({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });

  const metadata = await store.putArtifact('run_driver_test', 'request.json', { model: 'driver-model', ok: true });
  const artifact = await store.readArtifact('run_driver_test', 'request.json');

  assert.equal(metadata.name, 'request.json');
  assert.match(metadata.path, /request\.json$/);
  assert.deepEqual(artifact, { model: 'driver-model', ok: true });
});

test('artifact store keeps job and schedule metadata local while using artifact driver', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-artifacts-'));
  const store = createArtifactStore({ dataDir: temp, artifactDir: path.join(temp, 'artifacts') });

  await store.writeJobs([{ runId: 'run_metadata_test', status: 'completed' }]);
  await store.writeSchedules([{ scheduleId: 'schedule_metadata_test', name: 'sample' }]);

  assert.deepEqual(await store.readJobs(), [{ runId: 'run_metadata_test', status: 'completed' }]);
  assert.deepEqual(await store.readSchedules(), [{ scheduleId: 'schedule_metadata_test', name: 'sample' }]);
});

test('s3 artifact driver requires complete storage configuration', () => {
  assert.throws(() => createArtifactStore({ storageDriver: 's3' }), /S3_BUCKET is required/);
});

test('s3 artifact driver writes and reads JSON through injected client', async () => {
  const sent = [];
  const client = {
    async send(command) {
      sent.push(command);
      if (command.type === 'GetObject') return { Body: { transformToString: async () => '{"model":"s3-model","ok":true}' } };
      return {};
    },
  };
  const store = createArtifactStore({
    storageDriver: 's3',
    s3: { bucket: 'bucket-name', endpoint: 'https://example.r2.cloudflarestorage.com', region: 'auto', accessKeyId: 'key', secretAccessKey: 'secret', client },
  });

  const metadata = await store.putArtifact('run_s3_test', 'request.json', { model: 's3-model', ok: true });
  const artifact = await store.readArtifact('run_s3_test', 'request.json');

  assert.deepEqual(metadata, { name: 'request.json', bucket: 'bucket-name', key: 'run_s3_test/request.json' });
  assert.equal(sent[0].type, 'PutObject');
  assert.equal(sent[0].input.Bucket, 'bucket-name');
  assert.equal(sent[0].input.Key, 'run_s3_test/request.json');
  assert.equal(sent[0].input.ContentType, 'application/json; charset=utf-8');
  assert.equal(sent[0].input.Body, '{\n  "model": "s3-model",\n  "ok": true\n}');
  assert.equal(sent[1].type, 'GetObject');
  assert.deepEqual(artifact, { model: 's3-model', ok: true });
});
