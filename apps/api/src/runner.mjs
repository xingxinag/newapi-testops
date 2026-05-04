import { buildChecklist, redactHeaders, redactJobInput, scoreFromChecklist } from '../../../packages/contracts/src/contracts.mjs';

export async function runSyntheticJob(input, store, now = new Date()) {
  if (input.executionMode === 'live') {
    return runLiveJob(input, store, now);
  }

  const startedAt = now.toISOString();
  const requestBody = buildRequestBody(input);
  const requestHeaders = redactHeaders({ Authorization: input.apiKey ? `Bearer ${input.apiKey}` : '', 'Content-Type': 'application/json' });
  const latencyMs = Math.max(50, Math.min(30000, input.concurrency * 37 + input.durationSeconds * 21));
  const responseBody = buildResponseBody(input, latencyMs);
  const statusCode = 200;
  const checks = buildChecklist({ statusCode, bodyText: JSON.stringify(responseBody), latencyMs, model: input.model });
  const score = scoreFromChecklist(checks);
  const summary = {
    totalRequests: input.concurrency * input.durationSeconds,
    successCount: input.concurrency * input.durationSeconds,
    failureCount: 0,
    rateLimitedCount: 0,
    timeoutCount: 0,
    latencyMs: { min: latencyMs, p50: latencyMs, p95: latencyMs + 25, max: latencyMs + 50 },
    ttfbMs: Math.round(latencyMs * 0.35),
    queueLatencyMs: Math.round(input.concurrency * 3),
    tokens: { input: 128, output: input.mode === 'text' ? 64 : 0, total: input.mode === 'text' ? 192 : 128 },
  };
  const requestRecord = { url: `${input.baseUrl}${input.endpoint}`, headers: requestHeaders, body: requestBody };
  const responseRecord = { statusCode, headers: { 'content-type': 'application/json' }, body: responseBody };
  const artifacts = [
    await store.putArtifact(input.runId, 'request.json', requestRecord),
    await store.putArtifact(input.runId, 'response.json', responseRecord),
    await store.putArtifact(input.runId, 'report.json', { summary, checks, score }),
  ];
  return {
    runId: input.runId,
    status: 'completed',
    createdAt: input.createdAt,
    startedAt,
    completedAt: new Date(Date.parse(startedAt) + latencyMs).toISOString(),
    input: redactJobInput(input),
    summary,
    checks,
    score,
    request: { url: requestRecord.url, headers: requestHeaders, body: input.retainFullBodies ? requestBody : '[stored as artifact]' },
    response: { statusCode, body: input.retainFullBodies ? responseBody : '[stored as artifact]' },
    artifacts,
  };
}

async function runLiveJob(input, store, now = new Date()) {
  const startedAt = now.toISOString();
  const requestBody = buildRequestBody(input);
  const rawHeaders = { Authorization: input.apiKey ? `Bearer ${input.apiKey}` : '', 'Content-Type': 'application/json' };
  const requestHeaders = redactHeaders(rawHeaders);
  const url = `${input.baseUrl}${input.endpoint.replace('{model}', encodeURIComponent(input.model))}`;
  const totalRequests = input.concurrency * input.durationSeconds;
  const results = await runLiveRequests(totalRequests, input.concurrency, url, rawHeaders, requestBody);
  const firstResult = results[0];
  const statusCode = firstResult.statusCode;
  const parsedBody = firstResult.body;
  const bodyText = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
  const latencyMs = firstResult.latencyMs;
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const responseSizes = results.map((result) => result.responseBytes).sort((a, b) => a - b);
  const ttfbValues = results.map((result) => result.ttfbMs).filter(Number.isFinite).sort((a, b) => a - b);
  const queueValues = results.map((result) => result.queueLatencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const successCount = results.filter((result) => result.statusCode >= 200 && result.statusCode < 300).length;
  const failureCount = totalRequests - successCount;
  const checks = buildChecklist({ statusCode, bodyText, latencyMs, model: input.model });
  const score = scoreFromChecklist(checks);
  const success = failureCount === 0;
  const tokenTotals = results.map((result) => extractUsage(result.body)).reduce((totals, usage) => ({
    input: totals.input + usage.input,
    output: totals.output + usage.output,
    total: totals.total + usage.total,
  }), { input: 0, output: 0, total: 0 });
  const summary = {
    totalRequests,
    successCount,
    failureCount,
    rateLimitedCount: results.filter((result) => result.statusCode === 429).length,
    timeoutCount: results.filter((result) => String(result.bodyText).includes('Timeout')).length,
    latencyMs: summarizeValues(latencies),
    responseBytes: summarizeValues(responseSizes),
    errors: summarizeErrors(results),
    throughput: summarizeThroughput(totalRequests, successCount, startedAt, new Date()),
    concurrency: summarizeConcurrency(results),
    ttfb: summarizeValues(ttfbValues),
    queueLatency: summarizeValues(queueValues),
    ttfbMs: avg(ttfbValues),
    queueLatencyMs: avg(queueValues),
    tokens: tokenTotals,
  };
  const requestRecord = { url, headers: requestHeaders, body: requestBody };
  const responseRecord = { statusCode, headers: firstResult.headers, body: parsedBody, samples: results.map((result, index) => ({ index: index + 1, statusCode: result.statusCode, latencyMs: result.latencyMs, ttfbMs: result.ttfbMs, queueLatencyMs: result.queueLatencyMs, responseBytes: result.responseBytes, errorType: result.errorType, activeRequests: result.activeRequests })) };
  const artifacts = [
    await store.putArtifact(input.runId, 'request.json', requestRecord),
    await store.putArtifact(input.runId, 'response.json', responseRecord),
    await store.putArtifact(input.runId, 'report.json', { summary, checks, score }),
  ];
  return {
    runId: input.runId,
    status: success ? 'completed' : 'failed',
    createdAt: input.createdAt,
    startedAt,
    completedAt: new Date().toISOString(),
    input: redactJobInput(input),
    summary,
    checks,
    score,
    request: { url, headers: requestHeaders, body: input.retainFullBodies ? requestBody : '[stored as artifact]' },
    response: { statusCode, body: input.retainFullBodies ? parsedBody : '[stored as artifact]' },
    artifacts,
  };
}

async function runLiveRequests(totalRequests, concurrency, url, headers, body) {
  const results = [];
  let nextIndex = 0;
  let activeRequests = 0;
  const workerCount = Math.min(concurrency, totalRequests);
  async function worker() {
    while (nextIndex < totalRequests) {
      const queuedAt = performance.now();
      nextIndex += 1;
      activeRequests += 1;
      const currentActiveRequests = activeRequests;
      try {
        results.push(await runOneLiveRequest(url, headers, body, { queuedAt, activeRequests: currentActiveRequests }));
      } finally {
        activeRequests -= 1;
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function runOneLiveRequest(url, headers, body, sampleContext = {}) {
  const startedAt = performance.now();
  const queueLatencyMs = sampleContext.queuedAt ? Math.max(0, startedAt - sampleContext.queuedAt) : 0;
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const ttfbMs = Math.round(performance.now() - start);
    const bodyText = await response.text();
    return {
      statusCode: response.status,
      headers: redactHeaders(Object.fromEntries(response.headers.entries())),
      bodyText,
      body: parseBody(bodyText),
      latencyMs: Math.round(performance.now() - start),
      ttfbMs,
      queueLatencyMs: round(queueLatencyMs),
      responseBytes: Buffer.byteLength(bodyText),
      errorType: response.status >= 200 && response.status < 300 ? null : `status_${response.status}`,
      activeRequests: sampleContext.activeRequests || 1,
    };
  } catch (error) {
    const bodyText = JSON.stringify({ error: error.message });
    return {
      statusCode: 0,
      headers: {},
      bodyText,
      body: parseBody(bodyText),
      latencyMs: Math.round(performance.now() - start),
      ttfbMs: Math.round(performance.now() - start),
      queueLatencyMs: round(queueLatencyMs),
      responseBytes: Buffer.byteLength(bodyText),
      errorType: error.name || 'request_error',
      activeRequests: sampleContext.activeRequests || 1,
    };
  }
}

function summarizeValues(values) {
  if (!values.length) return { min: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  return { min: values[0], avg: avg(values), p50: percentile(values, 50), p90: percentile(values, 90), p95: percentile(values, 95), p99: percentile(values, 99), max: values[values.length - 1] };
}

function summarizeErrors(results) {
  return results.reduce((errors, result) => {
    if (!result.errorType) return errors;
    errors[result.errorType] = (errors[result.errorType] || 0) + 1;
    return errors;
  }, {});
}

function summarizeThroughput(totalRequests, successCount, startedAt, completedAt) {
  const elapsedSeconds = Math.max(0.001, (completedAt.getTime() - Date.parse(startedAt)) / 1000);
  return { elapsedSeconds: round(elapsedSeconds), successRpm: round((successCount / elapsedSeconds) * 60), overallRps: round(totalRequests / elapsedSeconds) };
}

function summarizeConcurrency(results) {
  const values = results.map((result) => result.activeRequests || 1);
  return { max: Math.max(0, ...values), avg: avg(values) };
}

function avg(values) {
  if (!values.length) return 0;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function percentile(values, target) {
  if (!values.length) return 0;
  const index = Math.ceil((target / 100) * values.length) - 1;
  return values[Math.max(0, Math.min(index, values.length - 1))];
}

function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractUsage(body) {
  const usage = body && typeof body === 'object' ? body.usage || {} : {};
  const input = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const output = Number(usage.completion_tokens || usage.output_tokens || 0);
  const total = Number(usage.total_tokens || input + output || 0);
  return { input, output, total };
}

function buildRequestBody(input) {
  if (input.mode === 'text') return { model: input.model, messages: [{ role: 'user', content: 'Say OK for NewAPI TestOps probe.' }], max_tokens: 64 };
  if (input.mode === 'image') return { model: input.model, prompt: 'A compact status dashboard card', n: 1, size: '1024x1024' };
  return { contents: [{ role: 'user', parts: [{ text: 'Generate a simple diagnostic image.' }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } } };
}

function buildResponseBody(input, latencyMs) {
  return { ok: true, model: input.model, mode: input.mode, latency_ms: latencyMs, message: 'synthetic probe completed' };
}
