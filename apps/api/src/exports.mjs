export async function exportJobCsv(runId, store) {
  const job = await findJob(runId, store);
  const summary = job.summary || {};
  const row = [
    job.runId,
    job.status,
    job.score,
    summary.totalRequests ?? 0,
    summary.successCount ?? 0,
    summary.failureCount ?? 0,
    summary.rateLimitedCount ?? 0,
    summary.timeoutCount ?? 0,
    summary.throughput?.successRpm ?? 0,
    summary.throughput?.overallRps ?? 0,
    summary.latencyMs?.avg ?? 0,
    summary.latencyMs?.p50 ?? 0,
    summary.latencyMs?.p90 ?? 0,
    summary.latencyMs?.p95 ?? 0,
    summary.latencyMs?.p99 ?? 0,
    summary.tokens?.total ?? 0,
  ];
  return `${['runId', 'status', 'score', 'totalRequests', 'successCount', 'failureCount', 'rateLimitedCount', 'timeoutCount', 'successRpm', 'overallRps', 'latencyAvg', 'latencyP50', 'latencyP90', 'latencyP95', 'latencyP99', 'tokensTotal'].join(',')}\n${row.map(csvCell).join(',')}\n`;
}

export async function exportJobHtml(runId, store) {
  const job = await findJob(runId, store);
  const report = await store.readArtifact(runId, 'report.json');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>NewAPI TestOps Report ${escapeHtml(job.runId)}</title></head>
<body>
  <h1>NewAPI TestOps Report</h1>
  <p><strong>Run:</strong> ${escapeHtml(job.runId)}</p>
  <p><strong>Status:</strong> ${escapeHtml(job.status)}</p>
  <p><strong>Model:</strong> ${escapeHtml(job.input?.model)}</p>
  <p><strong>Score:</strong> ${escapeHtml(job.score)}%</p>
  ${renderHtmlReportSections(job.summary || {})}
  <h2>Checks</h2>
  <pre>${escapeHtml(JSON.stringify(report.checks || [], null, 2))}</pre>
</body>
</html>`;
}

function renderHtmlReportSections(summary) {
  return `<h2>总体结果</h2>
  <ul>
    <li>发起总数: ${escapeHtml(summary.totalRequests ?? 0)} 次</li>
    <li>成功 (200): ${escapeHtml(summary.successCount ?? 0)} 次</li>
    <li>限流 (429): ${escapeHtml(summary.rateLimitedCount ?? 0)} 次</li>
    <li>超时/其他错误: ${escapeHtml((summary.timeoutCount ?? 0) + (summary.failureCount ?? 0))} 次</li>
  </ul>
  <h2>吞吐量 KPI</h2>
  <ul>
    <li>真实成功 RPM: ${escapeHtml(summary.throughput?.successRpm ?? 0)}</li>
    <li>整体发包 RPS: ${escapeHtml(summary.throughput?.overallRps ?? 0)}</li>
  </ul>
  <h2>延迟分析</h2>
  <ul>
    <li>平均延迟: ${escapeHtml(summary.latencyMs?.avg ?? 0)} ms</li>
    <li>P50 / P90 / P99: ${escapeHtml(summary.latencyMs?.p50 ?? 0)} / ${escapeHtml(summary.latencyMs?.p90 ?? 0)} / ${escapeHtml(summary.latencyMs?.p99 ?? 0)}</li>
    <li>最小/最大: ${escapeHtml(summary.latencyMs?.min ?? 0)} / ${escapeHtml(summary.latencyMs?.max ?? 0)}</li>
  </ul>
  <h2>资源与队列</h2>
  <ul>
    <li>响应体平均大小: ${escapeHtml(summary.responseBytes?.avg ?? 0)} 字节</li>
    <li>平均排队: ${escapeHtml(summary.queueLatency?.avg ?? summary.queueLatencyMs ?? 0)} ms</li>
    <li>总消耗 Token: ${escapeHtml(summary.tokens?.total ?? 0)}</li>
    <li>最大/平均并发: ${escapeHtml(summary.concurrency?.max ?? 0)} / ${escapeHtml(summary.concurrency?.avg ?? 0)}</li>
    <li>平均 TTFB: ${escapeHtml(summary.ttfb?.avg ?? summary.ttfbMs ?? 0)} ms</li>
  </ul>`;
}

export async function exportJobZip(runId, store) {
  const [request, response, report] = await Promise.all([
    store.readArtifact(runId, 'request.json'),
    store.readArtifact(runId, 'response.json'),
    store.readArtifact(runId, 'report.json'),
  ]);
  const entries = [
    ['request.json', JSON.stringify(request, null, 2)],
    ['response.json', JSON.stringify(response, null, 2)],
    ['report.json', JSON.stringify(report, null, 2)],
    ['summary.csv', await exportJobCsv(runId, store)],
    ['report.html', await exportJobHtml(runId, store)],
  ];
  return createStoredZip(entries);
}

async function findJob(runId, store) {
  const job = (await store.readJobs()).find((item) => item.runId === runId);
  if (!job) {
    const error = new Error('Job not found');
    error.statusCode = 404;
    throw error;
  }
  return job;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const checksum = crc32(contentBuffer);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
