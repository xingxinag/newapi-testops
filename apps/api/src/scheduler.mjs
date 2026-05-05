import { createRunId } from '../../../packages/contracts/src/contracts.mjs';
import { createAndRunJob } from './jobs.mjs';

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const MAX_HISTORY = 50;

export async function runDueSchedules(store, { now = new Date(), leaseMs = DEFAULT_LEASE_MS } = {}) {
  let ran = 0;
  const schedules = await store.readSchedules();
  for (const schedule of schedules) {
    if (!isDue(schedule, now)) continue;
    if (hasActiveLease(schedule, now)) continue;
    const runId = createRunId(now);
    const claimed = await claimSchedule(store, schedule.scheduleId, runId, new Date(now.getTime() + leaseMs).toISOString(), now);
    if (!claimed) continue;
    const completed = await createAndRunJob({ ...claimed.input, runId, createdAt: now.toISOString() }, store);
    await completeScheduleRun(store, claimed.scheduleId, completed, now);
    ran += 1;
  }
  return { ran };
}

function isDue(schedule, now) {
  const nextRunAt = schedule.nextRunAt || schedule.createdAt;
  return new Date(nextRunAt).getTime() <= now.getTime();
}

function hasActiveLease(schedule, now) {
  return Boolean(schedule.runningRunId && schedule.leaseUntil && new Date(schedule.leaseUntil).getTime() > now.getTime());
}

async function claimSchedule(store, scheduleId, runId, leaseUntil, now) {
  const schedules = await store.readSchedules();
  const schedule = schedules.find((item) => item.scheduleId === scheduleId);
  if (!schedule || !isDue(schedule, now) || hasActiveLease(schedule, now)) return null;
  const claimed = { ...schedule, runningRunId: runId, leaseUntil, lastStartedAt: now.toISOString() };
  await store.writeSchedules(schedules.map((item) => (item.scheduleId === scheduleId ? claimed : item)));
  return claimed;
}

async function completeScheduleRun(store, scheduleId, completed, now) {
  const schedules = await store.readSchedules();
  const schedule = schedules.find((item) => item.scheduleId === scheduleId);
  if (!schedule) return;
  const history = [{ runId: completed.runId, status: completed.status, startedAt: completed.startedAt || schedule.lastStartedAt, completedAt: completed.completedAt }, ...(schedule.history || [])].slice(0, MAX_HISTORY);
  const nextRunAt = nextScheduleRunAt(schedule, now).toISOString();
  const updated = { ...schedule, lastRunId: completed.runId, lastRunAt: completed.completedAt, nextRunAt, history };
  delete updated.runningRunId;
  delete updated.leaseUntil;
  await store.writeSchedules(schedules.map((item) => (item.scheduleId === scheduleId ? updated : item)));
}

function nextScheduleRunAt(schedule, now) {
  if (schedule.cron) return nextSimpleCronRunAt(schedule.cron, now);
  return new Date(now.getTime() + schedule.intervalSeconds * 1000);
}

function nextSimpleCronRunAt(cron, now) {
  const minutes = Number(String(cron).match(/^\*\/(\d+) \* \* \* \*$/)?.[1]);
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const currentMinute = next.getUTCMinutes();
  const nextMinute = Math.ceil((currentMinute + 1) / minutes) * minutes;
  if (nextMinute < 60) {
    next.setUTCMinutes(nextMinute);
    return next;
  }
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  return next;
}
