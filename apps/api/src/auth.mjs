import { mkdir, readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export function createAuthStore({ dataDir = './data' } = {}) {
  const root = path.resolve(dataDir);
  return {
    root,
    usersFile: path.join(root, 'users.json'),
    sessionsFile: path.join(root, 'sessions.json'),
    teamsFile: path.join(root, 'teams.json'),
    membershipsFile: path.join(root, 'memberships.json'),
    async ensure() {
      await mkdir(root, { recursive: true });
      await ensureJsonFile(this.usersFile);
      await ensureJsonFile(this.sessionsFile);
      await ensureJsonFile(this.teamsFile);
      await ensureJsonFile(this.membershipsFile);
    },
    async readUsers() {
      return readJsonArray(this.usersFile, this);
    },
    async writeUsers(users) {
      return writeJsonArray(this.usersFile, users, this);
    },
    async readSessions() {
      return readJsonArray(this.sessionsFile, this);
    },
    async writeSessions(sessions) {
      return writeJsonArray(this.sessionsFile, sessions, this);
    },
    async readTeams() {
      return readJsonArray(this.teamsFile, this);
    },
    async writeTeams(teams) {
      return writeJsonArray(this.teamsFile, teams, this);
    },
    async readMemberships() {
      return readJsonArray(this.membershipsFile, this);
    },
    async writeMemberships(memberships) {
      return writeJsonArray(this.membershipsFile, memberships, this);
    },
    async createUser({ email, password }) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) throw statusError(400, 'email is required');
      if (!password || String(password).length < 8) throw statusError(400, 'password must be at least 8 characters');
      const users = await this.readUsers();
      if (users.some((user) => user.email === normalizedEmail)) throw statusError(409, 'email is already registered');
      const user = { id: `user_${crypto.randomUUID()}`, email: normalizedEmail, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
      await this.writeUsers([user, ...users]);
      return user;
    },
    async findUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      return (await this.readUsers()).find((user) => user.email === normalizedEmail) || null;
    },
    async verifyPassword(user, password) {
      if (!user?.passwordHash) return false;
      return verifyPasswordHash(password, user.passwordHash);
    },
    async createSession(userId) {
      const session = { id: `session_${crypto.randomBytes(32).toString('hex')}`, userId, createdAt: new Date().toISOString() };
      await this.writeSessions([session, ...await this.readSessions()]);
      return session;
    },
    async readSession(sessionId) {
      if (!sessionId) return null;
      const session = (await this.readSessions()).find((item) => item.id === sessionId);
      if (!session) return null;
      const user = (await this.readUsers()).find((item) => item.id === session.userId);
      return user ? { session, user } : null;
    },
    async deleteSession(sessionId) {
      await this.writeSessions((await this.readSessions()).filter((session) => session.id !== sessionId));
    },
    async createTeam({ name, ownerUserId }) {
      if (!name || !String(name).trim()) throw statusError(400, 'name is required');
      const team = { id: `team_${crypto.randomUUID()}`, name: String(name).trim(), ownerUserId, createdAt: new Date().toISOString() };
      await this.writeTeams([team, ...await this.readTeams()]);
      await this.writeMemberships([{ teamId: team.id, userId: ownerUserId, role: 'owner', createdAt: team.createdAt }, ...await this.readMemberships()]);
      return team;
    },
    async addTeamMemberByEmail({ teamId, email }) {
      const team = (await this.readTeams()).find((item) => item.id === teamId);
      if (!team) throw statusError(404, 'Team not found');
      const user = await this.findUserByEmail(email);
      if (!user) throw statusError(404, 'User not found');
      const memberships = await this.readMemberships();
      if (memberships.some((membership) => membership.teamId === teamId && membership.userId === user.id)) return { teamId, userId: user.id, email: user.email, role: memberships.find((membership) => membership.teamId === teamId && membership.userId === user.id).role };
      const membership = { teamId, userId: user.id, role: 'member', createdAt: new Date().toISOString() };
      await this.writeMemberships([membership, ...memberships]);
      return { teamId, userId: user.id, email: user.email, role: membership.role };
    },
    async userTeamIds(userId) {
      return (await this.readMemberships()).filter((membership) => membership.userId === userId).map((membership) => membership.teamId);
    },
    async userTeams(userId) {
      const memberships = await this.readMemberships();
      const membershipByTeamId = new Map(memberships.filter((membership) => membership.userId === userId).map((membership) => [membership.teamId, membership]));
      return (await this.readTeams()).filter((team) => membershipByTeamId.has(team.id)).map((team) => ({ ...team, role: membershipByTeamId.get(team.id).role }));
    },
    async isTeamMember(userId, teamId) {
      return (await this.readMemberships()).some((membership) => membership.userId === userId && membership.teamId === teamId);
    },
  };
}

export function publicUser(user) {
  return user ? { id: user.id, email: user.email, createdAt: user.createdAt } : null;
}

export function sessionCookie(sessionId, options = {}) {
  return `sid=${encodeURIComponent(sessionId)}; ${cookieAttributes(options)}`;
}

export function clearSessionCookie(options = {}) {
  return `sid=; ${cookieAttributes(options)}; Max-Age=0`;
}

function cookieAttributes(options = {}) {
  const sameSite = options.sameSite || 'Lax';
  const parts = ['HttpOnly', `SameSite=${sameSite}`, 'Path=/'];
  if (options.secure) parts.push('Secure');
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join('; ');
}

export function parseSessionId(cookieHeader = '') {
  const cookies = String(cookieHeader).split(';').map((part) => part.trim());
  const cookie = cookies.find((part) => part.startsWith('sid='));
  return cookie ? decodeURIComponent(cookie.slice(4)) : '';
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`;
}

async function verifyPasswordHash(password, storedHash) {
  const [scheme, salt, hash] = String(storedHash).split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = await scrypt(String(password), salt, 64);
  const actual = Buffer.from(derived);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureJsonFile(filePath) {
  try {
    await readFile(filePath, 'utf8');
  } catch {
    await writeFile(filePath, '[]\n');
  }
}

async function readJsonArray(filePath, store) {
  await store.ensure();
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJsonArray(filePath, value, store) {
  await store.ensure();
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function statusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
