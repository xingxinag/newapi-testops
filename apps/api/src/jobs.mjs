import { runSyntheticJob } from './runner.mjs';

export async function createAndRunJob(input, store) {
  const owner = ownerFields(input);
  const displayName = buildDisplayName(input);
  const queued = { runId: input.runId, displayName, status: 'queued', createdAt: input.createdAt, input: { ...input, apiKey: input.apiKey ? '[redacted]' : '' }, summary: null, checks: [], score: 0, artifacts: [], ...owner };
  const jobs = await store.readJobs();
  await store.writeJobs([queued, ...jobs]);
  const completed = await runSyntheticJob(input, store);
  completed.displayName = displayName;
  Object.assign(completed, owner);
  const nextJobs = (await store.readJobs()).map((job) => (job.runId === input.runId ? completed : job));
  await store.writeJobs(nextJobs);
  return completed;
}

function buildDisplayName(input) {
  if (input.historyNameMode === 'custom') return input.historyName.trim();
  if (input.historyNameMode === 'parameters') return `${input.mode} ${input.model} c${input.concurrency} d${input.durationSeconds}s ${input.endpointPreset}`;
  const date = new Date(input.createdAt);
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${stamp} 测试模式 测试${input.model}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function ownerFields(input) {
  if (!Object.hasOwn(input, 'ownerUserId')) return {};
  return { ownerUserId: input.ownerUserId, ownerTeamId: input.ownerTeamId };
}
