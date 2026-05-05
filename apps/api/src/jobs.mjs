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
  if (input.historyNameMode === 'parameters') return buildParameterDisplayName(input);
  const date = new Date(input.createdAt);
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${stamp} ${formatMode(input.mode)} 测试${input.model}`;
}

function buildParameterDisplayName(input) {
  if (!input.historyNameFields?.length) return `${input.mode} ${input.model} c${input.concurrency} d${input.durationSeconds}s ${input.endpointPreset}`;
  return input.historyNameFields.slice().sort((a, b) => fieldOrder.indexOf(a) - fieldOrder.indexOf(b)).map((field) => `${fieldLabels[field]}=${formatParameterValue(field, input[field])}`).join(' / ');
}

const fieldOrder = ['concurrency', 'model', 'mode', 'durationSeconds', 'endpointPreset', 'executionMode', 'baseUrl'];

const fieldLabels = {
  baseUrl: 'API地址',
  concurrency: '并发数',
  durationSeconds: '持续秒数',
  endpointPreset: '端点预设',
  executionMode: '执行方式',
  mode: '测试模式',
  model: '模型',
};

function formatParameterValue(field, value) {
  if (field === 'mode') return formatMode(value);
  if (field === 'executionMode') return ({ synthetic: '模拟探测', live: '真实请求' })[value] || value;
  return String(value ?? '');
}

function formatMode(mode) {
  return ({ text: '文本', image: '图像', 'aspect-ratio': '宽高比' })[mode] || mode;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function ownerFields(input) {
  if (!Object.hasOwn(input, 'ownerUserId')) return {};
  return { ownerUserId: input.ownerUserId, ownerTeamId: input.ownerTeamId };
}
