export const TEST_MODES = ['text', 'image', 'aspect-ratio'];
export const EXECUTION_MODES = ['synthetic', 'live'];
export const JOB_STATUSES = ['queued', 'running', 'completed', 'failed'];
export const CHECK_STATUSES = ['pass', 'warning', 'fail'];
export const ENDPOINT_PRESETS = [
  'openai-chat',
  'openai-responses',
  'claude-messages',
  'gemini-generate-content',
  'openai-image-generation',
];

const ENDPOINT_TARGETS = {
  'openai-chat': { method: 'POST', endpoint: '/v1/chat/completions' },
  'openai-responses': { method: 'POST', endpoint: '/v1/responses' },
  'claude-messages': { method: 'POST', endpoint: '/v1/messages' },
  'gemini-generate-content': { method: 'POST', endpoint: '/v1beta/models/{model}:generateContent' },
  'openai-image-generation': { method: 'POST', endpoint: '/v1/images/generations' },
};

const MODE_DEFAULT_PRESETS = {
  text: 'openai-chat',
  image: 'openai-image-generation',
  'aspect-ratio': 'gemini-generate-content',
};

export function createRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const random = Math.random().toString(36).slice(2, 8);
  return `run_${stamp}_${random}`;
}

export function createScheduleId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const random = Math.random().toString(36).slice(2, 8);
  return `schedule_${stamp}_${random}`;
}

export function redactHeaders(headers = {}) {
  const secretNames = new Set(['authorization', 'cookie', 'x-api-key', 'api-key']);
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => {
    return [key, secretNames.has(String(key).toLowerCase()) ? '[redacted]' : value];
  }));
}

export function redactJobInput(input) {
  return {
    ...input,
    apiKey: input.apiKey ? maskSecret(input.apiKey) : '',
  };
}

export function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '*'.repeat(text.length);
  return `${text.slice(0, 4)}${'*'.repeat(Math.min(text.length - 6, 12))}${text.slice(-2)}`;
}

export function validateJobInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') errors.push('body must be an object');
  const body = input || {};
  if (!body.baseUrl || typeof body.baseUrl !== 'string') errors.push('baseUrl is required');
  if (!body.model || typeof body.model !== 'string') errors.push('model is required');
  if (!TEST_MODES.includes(body.mode)) errors.push(`mode must be one of ${TEST_MODES.join(', ')}`);
  const endpointPreset = normalizeEndpointPreset(body.mode, body.endpointPreset);
  if (body.endpointPreset && !ENDPOINT_TARGETS[body.endpointPreset]) errors.push(`endpointPreset must be one of ${ENDPOINT_PRESETS.join(', ')}`);
  const executionMode = body.executionMode || 'synthetic';
  if (!EXECUTION_MODES.includes(executionMode)) errors.push(`executionMode must be one of ${EXECUTION_MODES.join(', ')}`);
  const concurrency = Number(body.concurrency ?? 1);
  const durationSeconds = Number(body.durationSeconds ?? 5);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) errors.push('concurrency must be an integer between 1 and 200');
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) errors.push('durationSeconds must be an integer between 1 and 3600');
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.statusCode = 400;
    throw error;
  }
  return {
    baseUrl: body.baseUrl.trim().replace(/\/$/, ''),
    apiKey: String(body.apiKey || ''),
    mode: body.mode,
    executionMode,
    model: body.model.trim(),
    endpointPreset,
    endpointMethod: body.endpoint ? 'POST' : ENDPOINT_TARGETS[endpointPreset].method,
    endpoint: body.endpoint || ENDPOINT_TARGETS[endpointPreset].endpoint,
    concurrency,
    durationSeconds,
    sampling: normalizeSampling(body.sampling),
    retainFullBodies: Boolean(body.retainFullBodies),
  };
}

export function validateScheduleInput(input) {
  const errors = [];
  const body = input && typeof input === 'object' ? input : {};
  if (!body.name || typeof body.name !== 'string') errors.push('name is required');
  const intervalSeconds = Number(body.intervalSeconds ?? 3600);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 60) errors.push('intervalSeconds must be an integer greater than or equal to 60');
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.statusCode = 400;
    throw error;
  }
  return {
    name: body.name.trim(),
    intervalSeconds,
    input: { ...validateJobInput(body.input || {}), sampling: { strategy: 'scheduled', sampleRate: 1 } },
  };
}

function normalizeEndpointPreset(mode, endpointPreset) {
  if (endpointPreset) return endpointPreset;
  return MODE_DEFAULT_PRESETS[mode] || 'openai-chat';
}

function normalizeSampling(sampling) {
  if (!sampling || typeof sampling !== 'object') return { strategy: 'manual', sampleRate: 1 };
  const strategy = ['manual', 'scheduled', 'random-sample'].includes(sampling.strategy) ? sampling.strategy : 'manual';
  const sampleRate = Number(sampling.sampleRate ?? 1);
  return { strategy, sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 1 };
}

export function buildChecklist({ statusCode, bodyText, latencyMs, model }) {
  const responseLooksJson = looksJson(bodyText);
  const identityMatch = bodyText.toLowerCase().includes(String(model).toLowerCase().split('/').pop());
  const hasContent = bodyText.trim().length > 0;
  return [
    { name: 'Protocol Signature', status: statusCode === 200 ? 'pass' : 'fail', detail: `HTTP ${statusCode}` },
    { name: 'Response Structure', status: responseLooksJson ? 'pass' : 'warning', detail: responseLooksJson ? 'JSON-like' : 'Non-JSON body' },
    { name: 'Identity Match', status: identityMatch ? 'pass' : 'warning', detail: identityMatch ? 'Model echoed' : 'Not enough evidence' },
    { name: 'Thinking Chain', status: hasContent ? 'pass' : 'fail', detail: hasContent ? 'Content present' : 'Empty response' },
    { name: 'Latency Budget', status: latencyMs <= 5000 ? 'pass' : latencyMs <= 15000 ? 'warning' : 'fail', detail: `${latencyMs}ms` },
  ];
}

export function scoreFromChecklist(checks) {
  const weights = { pass: 20, warning: 10, fail: 0 };
  return checks.reduce((sum, item) => sum + weights[item.status], 0);
}

function looksJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}
