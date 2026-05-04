import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunId, createScheduleId, validateJobInput, validateScheduleInput } from '../../../packages/contracts/src/contracts.mjs';
import { createArtifactStore } from './artifacts.mjs';
import { runSyntheticJob } from './runner.mjs';

export function createApiServer(options = {}) {
  const store = createArtifactStore({ dataDir: options.dataDir || process.env.DATA_DIR || './data', artifactDir: options.artifactDir || process.env.ARTIFACT_LOCAL_DIR || './data/artifacts' });
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'OPTIONS') return cors(res);
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { success: true, service: 'newapi-testops-api' });
      if (req.method === 'GET' && url.pathname === '/api/jobs') return json(res, 200, { success: true, data: await store.readJobs() });
      if (req.method === 'GET' && url.pathname === '/api/schedules') return json(res, 200, { success: true, data: await store.readSchedules() });
      const artifactMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
      if (req.method === 'GET' && artifactMatch) return json(res, 200, await store.readArtifact(decodeURIComponent(artifactMatch[1]), decodeURIComponent(artifactMatch[2])));
      if (req.method === 'POST' && url.pathname === '/api/schedules') {
        const body = await readJson(req);
        const scheduleInput = validateScheduleInput(body);
        const createdAt = new Date().toISOString();
        const scheduleId = createScheduleId(new Date(createdAt));
        const runId = createRunId(new Date(createdAt));
        const completed = await createAndRunJob({ ...scheduleInput.input, runId, createdAt }, store);
        const schedule = { scheduleId, name: scheduleInput.name, intervalSeconds: scheduleInput.intervalSeconds, createdAt, input: completed.input, lastRunId: runId, history: [{ runId, status: completed.status, completedAt: completed.completedAt }] };
        await store.writeSchedules([schedule, ...await store.readSchedules()]);
        return json(res, 201, { success: true, data: schedule });
      }
      if (req.method === 'POST' && url.pathname === '/api/jobs') {
        const body = await readJson(req);
        const input = validateJobInput(body);
        const createdAt = new Date().toISOString();
        const runId = createRunId(new Date(createdAt));
        const completed = await createAndRunJob({ ...input, runId, createdAt }, store);
        return json(res, 201, { success: true, data: completed });
      }
      return json(res, 404, { success: false, message: 'Not found' });
    } catch (error) {
      return json(res, error.statusCode || 500, { success: false, message: error.message });
    }
  });
}

async function createAndRunJob(input, store) {
  const queued = { runId: input.runId, status: 'queued', createdAt: input.createdAt, input: { ...input, apiKey: input.apiKey ? '[redacted]' : '' }, summary: null, checks: [], score: 0, artifacts: [] };
  const jobs = await store.readJobs();
  await store.writeJobs([queued, ...jobs]);
  const completed = await runSyntheticJob(input, store);
  const nextJobs = (await store.readJobs()).map((job) => job.runId === input.runId ? completed : job);
  await store.writeJobs(nextJobs);
  return completed;
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, corsHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(payload));
}

function cors(res) {
  res.writeHead(204, corsHeaders());
  res.end();
}

function corsHeaders(extra = {}) {
  return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', ...extra };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const host = process.env.API_HOST || '127.0.0.1';
  const port = Number(process.env.API_PORT || 8788);
  createApiServer().listen(port, host, () => console.log(`newapi-testops api listening on http://${host}:${port}`));
}
