import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../src/server.mjs';
import { createAuthStore, sessionCookie } from '../src/auth.mjs';

test('auth store hashes passwords with scrypt and never stores plaintext', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-auth-'));
  const auth = createAuthStore({ dataDir: temp });

  const user = await auth.createUser({ email: 'hash@example.com', password: 'correct horse battery staple' });
  const users = await auth.readUsers();

  assert.equal(users.length, 1);
  assert.equal(users[0].email, 'hash@example.com');
  assert.equal(users[0].password, undefined);
  assert.notEqual(users[0].passwordHash, 'correct horse battery staple');
  assert.match(users[0].passwordHash, /^scrypt:/);
  assert.equal(await auth.verifyPassword(user, 'correct horse battery staple'), true);
  assert.equal(await auth.verifyPassword(user, 'wrong password'), false);
});

test('session cookies can be configured for cross-site static frontend deployments', () => {
  const cookie = sessionCookie('session_demo', { sameSite: 'None', secure: true, domain: '.example.com' });

  assert.match(cookie, /sid=session_demo/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=None/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /Domain=\.example\.com/i);
});

test('register, login, me, and logout use server-side HttpOnly session cookies', async () => {
  const fixture = await startServer({ authRequired: true });
  try {
    const registered = await postJson(fixture.baseUrl, '/api/auth/register', { email: 'owner@example.com', password: 'secret-passphrase' });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.data.email, 'owner@example.com');
    assert.equal(registered.body.data.passwordHash, undefined);
    assert.match(registered.cookie, /sid=/);
    assert.match(registered.cookie, /HttpOnly/i);
    assert.match(registered.cookie, /SameSite=Lax/i);
    assert.match(registered.cookie, /Path=\//i);

    const meAfterRegister = await getJson(fixture.baseUrl, '/api/auth/me', registered.cookie);
    assert.equal(meAfterRegister.response.status, 200);
    assert.equal(meAfterRegister.body.data.user.email, 'owner@example.com');

    const loggedOut = await postJson(fixture.baseUrl, '/api/auth/logout', {}, registered.cookie);
    assert.equal(loggedOut.response.status, 200);
    assert.match(loggedOut.cookie, /sid=;/);

    const meAfterLogout = await getJson(fixture.baseUrl, '/api/auth/me', registered.cookie);
    assert.equal(meAfterLogout.response.status, 401);

    const loggedIn = await postJson(fixture.baseUrl, '/api/auth/login', { email: 'owner@example.com', password: 'secret-passphrase' });
    assert.equal(loggedIn.response.status, 200);
    assert.match(loggedIn.cookie, /sid=/);

    const meAfterLogin = await getJson(fixture.baseUrl, '/api/auth/me', loggedIn.cookie);
    assert.equal(meAfterLogin.response.status, 200);
    assert.equal(meAfterLogin.body.data.user.email, 'owner@example.com');
  } finally {
    await fixture.close();
  }
});

test('credentialed auth requests echo the browser origin for CORS', async () => {
  const fixture = await startServer({ authRequired: true });
  try {
    const response = await fetch(`${fixture.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:4178', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'cors@example.com', password: 'secret-passphrase' }),
    });

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4178');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  } finally {
    await fixture.close();
  }
});

test('AUTH_REQUIRED protects jobs and valid sessions restore access', async () => {
  const fixture = await startServer({ authRequired: true });
  try {
    assert.equal((await fetch(`${fixture.baseUrl}/api/jobs`)).status, 401);
    assert.equal((await fetch(`${fixture.baseUrl}/api/schedules`)).status, 401);
    assert.equal((await fetch(`${fixture.baseUrl}/api/analytics/trends`)).status, 401);

    const registered = await postJson(fixture.baseUrl, '/api/auth/register', { email: 'jobs@example.com', password: 'secret-passphrase' });
    const created = await postJson(fixture.baseUrl, '/api/jobs', jobInput('team-model'), registered.cookie);
    assert.equal(created.response.status, 201);
    assert.equal(created.body.data.ownerUserId, registered.body.data.id);
    assert.equal(created.body.data.ownerTeamId, null);

    const jobs = await getJson(fixture.baseUrl, '/api/jobs', registered.cookie);
    assert.equal(jobs.response.status, 200);
    assert.deepEqual(jobs.body.data.map((job) => job.runId), [created.body.data.runId]);

    assert.equal((await fetch(`${fixture.baseUrl}/api/jobs/${created.body.data.runId}/artifacts/request.json`)).status, 401);
    assert.equal((await fetch(`${fixture.baseUrl}/api/jobs/${created.body.data.runId}/export.csv`)).status, 401);
    assert.equal((await fetch(`${fixture.baseUrl}/api/jobs/${created.body.data.runId}/artifacts/request.json`, { headers: { cookie: registered.cookie } })).status, 200);
    assert.equal((await fetch(`${fixture.baseUrl}/api/jobs/${created.body.data.runId}/export.csv`, { headers: { cookie: registered.cookie } })).status, 200);
  } finally {
    await fixture.close();
  }
});

test('GET /api/teams returns teams available to the logged-in user', async () => {
  const fixture = await startServer({ authRequired: true });
  try {
    const owner = await postJson(fixture.baseUrl, '/api/auth/register', { email: 'team-list-owner@example.com', password: 'secret-passphrase' });
    const team = await postJson(fixture.baseUrl, '/api/teams', { name: 'Visible Team' }, owner.cookie);
    assert.equal(team.response.status, 201);

    const teams = await getJson(fixture.baseUrl, '/api/teams', owner.cookie);
    assert.equal(teams.response.status, 200);
    assert.deepEqual(teams.body.data.map((item) => ({ id: item.id, name: item.name, role: item.role })), [{ id: team.body.data.id, name: 'Visible Team', role: 'owner' }]);
  } finally {
    await fixture.close();
  }
});

test('team creation and email membership grants access to team-owned jobs and schedules', async () => {
  const fixture = await startServer({ authRequired: true });
  try {
    const owner = await postJson(fixture.baseUrl, '/api/auth/register', { email: 'owner@example.com', password: 'secret-passphrase' });
    const member = await postJson(fixture.baseUrl, '/api/auth/register', { email: 'member@example.com', password: 'secret-passphrase' });
    const outsider = await postJson(fixture.baseUrl, '/api/auth/register', { email: 'outsider@example.com', password: 'secret-passphrase' });

    const team = await postJson(fixture.baseUrl, '/api/teams', { name: 'Platform QA' }, owner.cookie);
    assert.equal(team.response.status, 201);
    assert.equal(team.body.data.name, 'Platform QA');

    const invited = await postJson(fixture.baseUrl, `/api/teams/${team.body.data.id}/members`, { email: 'member@example.com' }, owner.cookie);
    assert.equal(invited.response.status, 201);
    assert.equal(invited.body.data.email, 'member@example.com');

    const createdJob = await postJson(fixture.baseUrl, '/api/jobs', { ...jobInput('shared-model'), teamId: team.body.data.id }, owner.cookie);
    assert.equal(createdJob.response.status, 201);
    assert.equal(createdJob.body.data.ownerTeamId, team.body.data.id);

    const createdSchedule = await postJson(fixture.baseUrl, '/api/schedules', { name: 'team sample', intervalSeconds: 3600, teamId: team.body.data.id, input: jobInput('scheduled-model') }, owner.cookie);
    assert.equal(createdSchedule.response.status, 201);
    assert.equal(createdSchedule.body.data.ownerTeamId, team.body.data.id);

    const memberJobs = await getJson(fixture.baseUrl, '/api/jobs', member.cookie);
    assert.equal(memberJobs.response.status, 200);
    assert.deepEqual(memberJobs.body.data.map((job) => job.runId), [createdSchedule.body.data.lastRunId, createdJob.body.data.runId]);

    const memberSchedules = await getJson(fixture.baseUrl, '/api/schedules', member.cookie);
    assert.equal(memberSchedules.response.status, 200);
    assert.deepEqual(memberSchedules.body.data.map((schedule) => schedule.scheduleId), [createdSchedule.body.data.scheduleId]);

    const outsiderJobs = await getJson(fixture.baseUrl, '/api/jobs', outsider.cookie);
    assert.equal(outsiderJobs.response.status, 200);
    assert.deepEqual(outsiderJobs.body.data, []);
  } finally {
    await fixture.close();
  }
});

async function startServer(options = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'newapi-testops-auth-'));
  const server = createApiServer({ dataDir: temp, artifactDir: path.join(temp, 'artifacts'), ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function postJson(baseUrl, pathname, body, cookie) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json(), cookie: response.headers.get('set-cookie') || cookie || '' };
}

async function getJson(baseUrl, pathname, cookie) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: cookie ? { cookie } : {} });
  return { response, body: await response.json() };
}

function jobInput(model) {
  return { baseUrl: 'https://api.example.com', apiKey: 'secret-key', model, mode: 'text', concurrency: 1, durationSeconds: 1 };
}
