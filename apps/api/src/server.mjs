import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunId, createScheduleId, validateJobInput, validateScheduleInput } from '../../../packages/contracts/src/contracts.mjs';
import { getTrendPoints } from './analytics.mjs';
import { createArtifactStore } from './artifacts.mjs';
import { clearSessionCookie, createAuthStore, parseSessionId, publicUser, sessionCookie } from './auth.mjs';
import { exportJobCsv, exportJobHtml, exportJobZip } from './exports.mjs';
import { createAndRunJob } from './jobs.mjs';

export function createApiServer(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || './data';
  const authRequired = options.authRequired ?? process.env.AUTH_REQUIRED === 'true';
  const cookieOptions = options.cookieOptions || {
    sameSite: process.env.SESSION_COOKIE_SAMESITE || 'Lax',
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    domain: process.env.SESSION_COOKIE_DOMAIN || '',
  };
  const store = createArtifactStore({ dataDir, artifactDir: options.artifactDir || process.env.ARTIFACT_LOCAL_DIR || './data/artifacts' });
  const auth = createAuthStore({ dataDir });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'OPTIONS') return cors(req, res);
      if (req.method === 'GET' && url.pathname === '/api/health') return json(req, res, 200, { success: true, service: 'newapi-testops-api' });
      const current = await currentAuth(req, auth);
      if (req.method === 'POST' && url.pathname === '/api/models') return await listModels(req, res, current, authRequired);
      if (req.method === 'POST' && url.pathname === '/api/auth/register') return await register(req, res, auth, cookieOptions);
      if (req.method === 'POST' && url.pathname === '/api/auth/login') return await login(req, res, auth, cookieOptions);
      if (req.method === 'POST' && url.pathname === '/api/auth/logout') return await logout(req, res, auth, cookieOptions);
      if (req.method === 'GET' && url.pathname === '/api/auth/me') return await me(req, res, current, authRequired);
      if (req.method === 'GET' && url.pathname === '/api/teams') {
        const user = requireUser(current);
        return json(req, res, 200, { success: true, data: await auth.userTeams(user.id) });
      }
      if (req.method === 'POST' && url.pathname === '/api/teams') {
        const user = requireUser(current);
        const team = await auth.createTeam({ ...(await readJson(req)), ownerUserId: user.id });
        return json(req, res, 201, { success: true, data: team });
      }
      const teamMemberMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/members$/);
      if (req.method === 'POST' && teamMemberMatch) {
        const user = requireUser(current);
        const teamId = decodeURIComponent(teamMemberMatch[1]);
        if (!await auth.isTeamMember(user.id, teamId)) throw statusError(403, 'Forbidden');
        const member = await auth.addTeamMemberByEmail({ teamId, ...(await readJson(req)) });
        return json(req, res, 201, { success: true, data: member });
      }
      if (req.method === 'GET' && url.pathname === '/api/analytics/trends') {
        requireAuthIfNeeded(authRequired, current);
        return json(req, res, 200, { success: true, data: await getTrendPoints({ ...store, readJobs: () => visibleJobs(store, auth, current, authRequired) }) });
      }
      if (req.method === 'GET' && url.pathname === '/api/jobs') {
        requireAuthIfNeeded(authRequired, current);
        return json(req, res, 200, { success: true, data: await visibleJobs(store, auth, current, authRequired) });
      }
      if (req.method === 'GET' && url.pathname === '/api/schedules') {
        requireAuthIfNeeded(authRequired, current);
        return json(req, res, 200, { success: true, data: await visibleSchedules(store, auth, current, authRequired) });
      }
      const csvExportMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.csv$/);
      if (req.method === 'GET' && csvExportMatch) {
        await requireJobAccess(decodeURIComponent(csvExportMatch[1]), store, auth, current, authRequired);
        return text(req, res, 200, 'text/csv; charset=utf-8', await exportJobCsv(decodeURIComponent(csvExportMatch[1]), store));
      }
      const htmlExportMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.html$/);
      if (req.method === 'GET' && htmlExportMatch) {
        await requireJobAccess(decodeURIComponent(htmlExportMatch[1]), store, auth, current, authRequired);
        return text(req, res, 200, 'text/html; charset=utf-8', await exportJobHtml(decodeURIComponent(htmlExportMatch[1]), store));
      }
      const zipExportMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.zip$/);
      if (req.method === 'GET' && zipExportMatch) {
        await requireJobAccess(decodeURIComponent(zipExportMatch[1]), store, auth, current, authRequired);
        return binary(req, res, 200, 'application/zip', await exportJobZip(decodeURIComponent(zipExportMatch[1]), store));
      }
      const artifactMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
      if (req.method === 'GET' && artifactMatch) {
        await requireJobAccess(decodeURIComponent(artifactMatch[1]), store, auth, current, authRequired);
        return json(req, res, 200, await store.readArtifact(decodeURIComponent(artifactMatch[1]), decodeURIComponent(artifactMatch[2])));
      }
      if (req.method === 'POST' && url.pathname === '/api/schedules') {
        requireAuthIfNeeded(authRequired, current);
        const body = await readJson(req);
        const scheduleInput = validateScheduleInput(body);
        const createdAt = new Date().toISOString();
        const scheduleId = createScheduleId(new Date(createdAt));
        const runId = createRunId(new Date(createdAt));
        const owner = await ownerFields(body, current, auth, authRequired);
        const completed = await createAndRunJob({ ...scheduleInput.input, runId, createdAt, ...owner }, store);
        const schedule = { scheduleId, name: scheduleInput.name, intervalSeconds: scheduleInput.intervalSeconds, createdAt, input: completed.input, lastRunId: runId, lastRunAt: completed.completedAt, nextRunAt: new Date(new Date(createdAt).getTime() + scheduleInput.intervalSeconds * 1000).toISOString(), history: [{ runId, status: completed.status, startedAt: completed.startedAt, completedAt: completed.completedAt }], ...owner };
        await store.writeSchedules([schedule, ...await store.readSchedules()]);
        return json(req, res, 201, { success: true, data: schedule });
      }
      if (req.method === 'POST' && url.pathname === '/api/jobs') {
        requireAuthIfNeeded(authRequired, current);
        const body = await readJson(req);
        const input = validateJobInput(body);
        const createdAt = new Date().toISOString();
        const runId = createRunId(new Date(createdAt));
        const completed = await createAndRunJob({ ...input, runId, createdAt, ...await ownerFields(body, current, auth, authRequired) }, store);
        return json(req, res, 201, { success: true, data: completed });
      }
      return json(req, res, 404, { success: false, message: 'Not found' });
    } catch (error) {
      return json(req, res, error.statusCode || 500, { success: false, message: error.message });
    }
  });
  server.store = store;
  server.auth = auth;
  return server;
}

async function register(req, res, auth, cookieOptions) {
  const user = await auth.createUser(await readJson(req));
  const session = await auth.createSession(user.id);
  return json(req, res, 201, { success: true, data: publicUser(user) }, { 'set-cookie': sessionCookie(session.id, cookieOptions) });
}

async function login(req, res, auth, cookieOptions) {
  const body = await readJson(req);
  const user = await auth.findUserByEmail(body.email);
  if (!user || !await auth.verifyPassword(user, body.password)) throw statusError(401, 'Invalid email or password');
  const session = await auth.createSession(user.id);
  return json(req, res, 200, { success: true, data: publicUser(user) }, { 'set-cookie': sessionCookie(session.id, cookieOptions) });
}

async function logout(req, res, auth, cookieOptions) {
  await auth.deleteSession(parseSessionId(req.headers.cookie || ''));
  return json(req, res, 200, { success: true }, { 'set-cookie': clearSessionCookie(cookieOptions) });
}

async function me(req, res, current, authRequired) {
  if (!current && authRequired) throw statusError(401, 'Authentication required');
  return json(req, res, 200, { success: true, data: current ? { user: publicUser(current.user) } : { user: null } });
}

async function currentAuth(req, auth) {
  return auth.readSession(parseSessionId(req.headers.cookie || ''));
}

async function listModels(req, res, current, authRequired) {
  requireAuthIfNeeded(authRequired, current);
  const body = await readJson(req);
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/$/, '') : '';
  if (!baseUrl) throw statusError(400, 'baseUrl is required');
  const endpoint = body.endpoint === undefined ? '/v1/models' : body.endpoint;
  if (endpoint !== '/v1/models' && endpoint !== '/v1beta/models') throw statusError(400, 'endpoint must be one of /v1/models, /v1beta/models');
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'GET',
    headers: body.apiKey ? { authorization: `Bearer ${body.apiKey}` } : {},
  });
  const payload = await response.json();
  return json(req, res, 200, { success: true, data: normalizeModelList(payload, endpoint) });
}

function requireUser(current) {
  if (!current) throw statusError(401, 'Authentication required');
  return current.user;
}

function requireAuthIfNeeded(authRequired, current) {
  if (authRequired) requireUser(current);
}

async function ownerFields(body, current, auth, authRequired) {
  if (!authRequired) return {};
  const user = requireUser(current);
  const teamId = body.teamId || null;
  if (teamId && !await auth.isTeamMember(user.id, teamId)) throw statusError(403, 'Forbidden');
  return { ownerUserId: user.id, ownerTeamId: teamId };
}

async function visibleJobs(store, auth, current, authRequired) {
  const jobs = await store.readJobs();
  if (!authRequired) return jobs;
  const user = requireUser(current);
  const teamIds = new Set(await auth.userTeamIds(user.id));
  return jobs.filter((job) => canAccessOwned(job, user.id, teamIds));
}

async function visibleSchedules(store, auth, current, authRequired) {
  const schedules = await store.readSchedules();
  if (!authRequired) return schedules;
  const user = requireUser(current);
  const teamIds = new Set(await auth.userTeamIds(user.id));
  return schedules.filter((schedule) => canAccessOwned(schedule, user.id, teamIds));
}

async function requireJobAccess(runId, store, auth, current, authRequired) {
  requireAuthIfNeeded(authRequired, current);
  if (!authRequired) return;
  const job = (await store.readJobs()).find((item) => item.runId === runId);
  if (!job) throw statusError(404, 'Job not found');
  const teamIds = new Set(await auth.userTeamIds(current.user.id));
  if (!canAccessOwned(job, current.user.id, teamIds)) throw statusError(404, 'Job not found');
}

function canAccessOwned(item, userId, teamIds) {
  if (item.ownerTeamId) return teamIds.has(item.ownerTeamId);
  return item.ownerUserId === userId;
}

function statusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function json(req, res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, corsHeaders(req, { 'content-type': 'application/json; charset=utf-8', ...headers }));
  res.end(JSON.stringify(payload));
}

function text(req, res, statusCode, contentType, payload) {
  res.writeHead(statusCode, corsHeaders(req, { 'content-type': contentType }));
  res.end(payload);
}

function binary(req, res, statusCode, contentType, payload) {
  res.writeHead(statusCode, corsHeaders(req, { 'content-type': contentType }));
  res.end(payload);
}

function cors(req, res) {
  res.writeHead(204, corsHeaders(req));
  res.end();
}

function corsHeaders(req, extra = {}) {
  const origin = req?.headers?.origin;
  return {
    'access-control-allow-origin': origin || '*',
    ...(origin ? { 'access-control-allow-credentials': 'true' } : {}),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, cookie',
    ...extra,
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function normalizeModelList(payload, endpoint) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  return items.map((item) => {
    const rawId = endpoint === '/v1beta/models' ? (item?.name || item?.id || '') : (item?.id || item?.name || '');
    return { id: String(rawId).replace(/^models\//, ''), source: endpoint };
  }).filter((item) => item.id);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const host = process.env.API_HOST || '127.0.0.1';
  const port = Number(process.env.API_PORT || 8788);
  createApiServer().listen(port, host, () => console.log(`newapi-testops api listening on http://${host}:${port}`));
}
