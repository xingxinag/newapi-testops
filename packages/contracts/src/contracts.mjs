export const TEST_MODES = ['text', 'image', 'aspect-ratio'];
export const EXECUTION_MODES = ['synthetic', 'live'];
export const JOB_STATUSES = ['queued', 'running', 'completed', 'failed'];
export const CHECK_STATUSES = ['pass', 'warning', 'fail'];
export const HISTORY_NAME_MODES = ['default', 'custom', 'parameters'];
export const ACCESS_SCOPES = ['public', 'private', 'password', 'account', 'team'];
export const HISTORY_NAME_FIELDS = ['baseUrl', 'concurrency', 'durationSeconds', 'endpointPreset', 'executionMode', 'mode', 'model'];
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
  const historyNameMode = body.historyNameMode || 'default';
  if (!HISTORY_NAME_MODES.includes(historyNameMode)) errors.push(`historyNameMode must be one of ${HISTORY_NAME_MODES.join(', ')}`);
  const historyName = typeof body.historyName === 'string' ? body.historyName.trim() : '';
  if (historyNameMode === 'custom' && !historyName) errors.push('historyName is required when historyNameMode is custom');
  const historyNameFields = normalizeHistoryNameFields(body.historyNameFields, errors);
  const accessScope = body.accessScope || 'private';
  if (!ACCESS_SCOPES.includes(accessScope)) errors.push(`accessScope must be one of ${ACCESS_SCOPES.join(', ')}`);
  const questionBank = normalizeQuestionBank(body.questionBank, errors);
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
    historyNameMode,
    historyName,
    historyNameFields,
    accessScope,
    accessPassword: body.accessPassword ? String(body.accessPassword) : '',
    accountId: body.accountId ? String(body.accountId).trim() : '',
    teamId: body.teamId ? String(body.teamId).trim() : '',
    questionBank,
    sampling: normalizeSampling(body.sampling),
    retainFullBodies: Boolean(body.retainFullBodies),
  };
}

export function validateQuestionBankInput(input) {
  const errors = [];
  const body = input && typeof input === 'object' ? input : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) errors.push('name is required');
  const items = normalizeQuestionBankItems(body.items, errors, 'items');
  if (!items.length) errors.push('items must include at least one prompt');
  if (errors.length) throwValidation(errors);
  return { name, items };
}

export function validateScheduleInput(input) {
  const errors = [];
  const body = input && typeof input === 'object' ? input : {};
  if (!body.name || typeof body.name !== 'string') errors.push('name is required');
  const hasCron = body.cron !== undefined && body.cron !== '';
  const intervalSeconds = hasCron ? undefined : Number(body.intervalSeconds ?? 3600);
  const cron = hasCron ? String(body.cron).trim() : undefined;
  if (hasCron && !isSimpleEveryMinutesCron(cron)) errors.push('cron must use simple */N * * * * format');
  if (!hasCron && (!Number.isInteger(intervalSeconds) || intervalSeconds < 60)) errors.push('intervalSeconds must be an integer greater than or equal to 60');
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.statusCode = 400;
    throw error;
  }
  return {
    name: body.name.trim(),
    ...(hasCron ? { cron } : { intervalSeconds }),
    input: { ...validateJobInput(body.input || {}), sampling: { strategy: 'scheduled', sampleRate: 1 } },
  };
}

export function validateStorageConfig(input) {
  const errors = [];
  const body = input && typeof input === 'object' ? input : {};
  const provider = body.provider || 'local';
  if (!['local', 's3', 'r2'].includes(provider)) errors.push('provider must be one of local, s3, r2');
  const retentionDays = Number(body.retentionDays ?? 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) errors.push('retentionDays must be an integer between 1 and 3650');
  if ((provider === 's3' || provider === 'r2') && !body.bucket) errors.push('bucket is required');
  if ((provider === 's3' || provider === 'r2') && !body.endpoint) errors.push('endpoint is required');
  if (errors.length) throwValidation(errors);
  return {
    provider,
    bucket: String(body.bucket || '').trim(),
    endpoint: String(body.endpoint || '').trim(),
    region: String(body.region || 'auto').trim(),
    accessKeyId: String(body.accessKeyId || '').trim(),
    secretAccessKey: String(body.secretAccessKey || ''),
    retentionDays,
  };
}

validateStorageConfig.mask = function maskStorageConfig(config = {}) {
  return { ...config, secretAccessKey: config.secretAccessKey ? maskSecret(config.secretAccessKey) : '' };
};

export function validateNotificationConfig(input) {
  const errors = [];
  const body = input && typeof input === 'object' ? input : {};
  const channel = body.channel || 'none';
  if (!['none', 'webhook', 'email'].includes(channel)) errors.push('channel must be one of none, webhook, email');
  if (channel === 'webhook' && !body.webhookUrl) errors.push('webhookUrl is required');
  if (errors.length) throwValidation(errors);
  const template = body.template && typeof body.template === 'object' ? body.template : {};
  return {
    enabled: Boolean(body.enabled),
    channel,
    webhookUrl: String(body.webhookUrl || '').trim(),
    template: {
      title: String(template.title || '').trim(),
      body: String(template.body || '').trim(),
    },
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

function normalizeHistoryNameFields(fields, errors) {
  if (fields === undefined) return [];
  if (!Array.isArray(fields)) {
    errors.push('historyNameFields must be an array');
    return [];
  }
  const unique = [];
  for (const field of fields) {
    const name = String(field || '').trim();
    if (!HISTORY_NAME_FIELDS.includes(name)) {
      errors.push(`historyNameFields must use one of ${HISTORY_NAME_FIELDS.join(', ')}`);
      continue;
    }
    if (!unique.includes(name)) unique.push(name);
  }
  return unique;
}

function normalizeQuestionBank(questionBank, errors) {
  if (questionBank === undefined) return [];
  if (!Array.isArray(questionBank)) {
    errors.push('questionBank must be an array');
    return [];
  }
  return normalizeQuestionBankItems(questionBank, errors, 'questionBank').map((entry, index) => {
    if (entry.type === 'image-generation') return { type: 'image', prompt: entry.prompt, ...(entry.imageUrl ? { imageUrl: entry.imageUrl } : {}) };
    return entry;
  });
}

function normalizeQuestionBankItems(items, errors, label) {
  if (!Array.isArray(items)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  return items.map((entry, index) => {
    const type = entry?.type;
    const prompt = typeof entry?.prompt === 'string' ? entry.prompt.trim() : '';
    if (!['text', 'image', 'image-generation'].includes(type)) errors.push(`${label}[${index}].type must be one of text, image, image-generation`);
    if (!prompt) errors.push(`${label}[${index}].prompt is required`);
    if (type === 'image') {
      const imageUrl = typeof entry?.imageUrl === 'string' ? entry.imageUrl.trim() : '';
      if (!imageUrl) errors.push(`${label}[${index}].imageUrl is required`);
      return { type, prompt, imageUrl };
    }
    const imageUrl = typeof entry?.imageUrl === 'string' ? entry.imageUrl.trim() : '';
    return { type, prompt, ...(imageUrl ? { imageUrl } : {}) };
  });
}

function isSimpleEveryMinutesCron(cron) {
  const match = String(cron || '').match(/^\*\/(\d+) \* \* \* \*$/);
  return Boolean(match && Number(match[1]) >= 1 && Number(match[1]) <= 59);
}

function throwValidation(errors) {
  const error = new Error(errors.join('; '));
  error.statusCode = 400;
  throw error;
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
