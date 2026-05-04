import { runSyntheticJob } from './runner.mjs';

export async function createAndRunJob(input, store) {
  const owner = ownerFields(input);
  const queued = { runId: input.runId, status: 'queued', createdAt: input.createdAt, input: { ...input, apiKey: input.apiKey ? '[redacted]' : '' }, summary: null, checks: [], score: 0, artifacts: [], ...owner };
  const jobs = await store.readJobs();
  await store.writeJobs([queued, ...jobs]);
  const completed = await runSyntheticJob(input, store);
  Object.assign(completed, owner);
  const nextJobs = (await store.readJobs()).map((job) => (job.runId === input.runId ? completed : job));
  await store.writeJobs(nextJobs);
  return completed;
}

function ownerFields(input) {
  if (!Object.hasOwn(input, 'ownerUserId')) return {};
  return { ownerUserId: input.ownerUserId, ownerTeamId: input.ownerTeamId };
}
