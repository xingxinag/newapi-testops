const apiBase = window.__NEWAPI_TESTOPS_API__ || 'http://127.0.0.1:8788';

const state = { jobs: [], schedules: [], trends: [], user: null, authRequired: false, teams: [], selectedTeamId: '' };

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">NewAPI TestOps</p>
        <h1>NewAPI 自动化测试与质量趋势控制台</h1>
        <p class="muted">集中发起即时测试、创建定时测试，查看请求/响应证据、评分趋势，并导出测试报告。</p>
      </div>
      <div class="score"><span id="health-score">--</span><small>最新得分</small></div>
    </section>
    <section class="grid">
      <aside class="sidebar-stack">
        <section class="card account-card">
          <h2>账号与团队</h2>
          <p class="muted form-intro">使用真实后端账号会话；未开启强制登录时，也可以保持开放模式直接运行测试。</p>
          <div id="auth-panel"></div>
          <div id="team-panel"></div>
        </section>
        <form id="job-form" class="card">
          <h2>测试任务</h2>
          <p class="muted form-intro">先填写通用测试参数，再选择立即执行或保存为定时自动测试。</p>
          <fieldset>
            <legend>通用测试参数</legend>
            <label>Base URL<input name="baseUrl" value="https://api.example.com" /></label>
            <label>API Key<input name="apiKey" type="password" placeholder="sk-..." autocomplete="off" /></label>
            <div class="model-helper-row">
              <label>模型<input id="model-input" name="model" value="demo-model" list="model-options" /></label>
              <button type="button" id="fetch-models-button" class="secondary compact-button">获取模型列表</button>
            </div>
            <div class="model-list-helper">
              <label>模型列表端点<select id="model-list-endpoint"><option value="/v1/models">/v1/models</option><option value="/v1beta/models">/v1beta/models</option></select></label>
              <select id="model-select" hidden aria-label="选择模型"></select>
              <datalist id="model-options"></datalist>
              <p id="model-list-status" class="muted">可手动输入模型，或点击按钮从当前 Base URL 获取。</p>
            </div>
            <label>端点预设<select name="endpointPreset"><option value="openai-chat">OpenAI ChatCompletions</option><option value="openai-responses">OpenAI Responses</option><option value="claude-messages">Claude Messages</option><option value="gemini-generate-content">Gemini generateContent</option><option value="openai-image-generation">OpenAI 图像生成</option></select></label>
            <label>测试模式<select name="mode"><option value="text">文本</option><option value="image">图像</option><option value="aspect-ratio">宽高比</option></select></label>
            <label>执行方式<select name="executionMode"><option value="synthetic">模拟探测</option><option value="live">真实请求</option></select></label>
            <label>并发数<input name="concurrency" type="number" value="2" min="1" /></label>
            <label>持续秒数<input name="durationSeconds" type="number" value="2" min="1" /></label>
            <label class="inline"><input name="retainFullBodies" type="checkbox" /> 保留完整响应预览</label>
            <label id="team-select-row" hidden>团队归属<select name="teamId" id="team-select"><option value="">个人/开放模式</option></select></label>
          </fieldset>
          <div class="action-panel immediate-panel">
            <h3>立即测试</h3>
            <p class="muted">马上创建一次测试任务，运行完成后可在历史记录中查看证据与报告导出。</p>
            <button type="submit">立即运行测试</button>
          </div>
          <fieldset class="action-panel schedule-panel">
            <legend>定时自动测试</legend>
            <label>计划名称<input name="scheduleName" placeholder="每小时样本测试" /></label>
            <label>间隔秒数<input name="intervalSeconds" type="number" value="3600" min="60" /></label>
            <p class="muted">保存计划后，后台 worker 会按间隔自动执行；请使用 <code>npm run start:worker</code> 启动 worker。</p>
            <button type="button" id="schedule-button" class="secondary">创建定时计划</button>
          </fieldset>
          <p id="form-status" class="muted"></p>
        </form>
      </aside>
      <section class="main-stack">
        <section class="card history-card">
          <h2>测试历史</h2>
          <div id="jobs" class="jobs"></div>
        </section>
        <section class="card trends-card">
          <h2>趋势图表</h2>
          <div id="trends" class="trends"></div>
        </section>
        <section class="card">
          <h2>定时测试计划</h2>
          <p class="muted section-note">计划由后台 worker 自动拉起执行；线上定时测试需要运行 <code>npm run start:worker</code>。</p>
          <div id="schedules" class="jobs"></div>
        </section>
      </section>
    </section>
  </main>
`;

document.querySelector('#job-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = getJobPayload(event.currentTarget);
  document.querySelector('#form-status').textContent = '正在运行测试...';
  const response = await fetch(`${apiBase}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, ...protectedFetchOptions(), body: JSON.stringify(payload) });
  const json = await response.json();
  document.querySelector('#form-status').textContent = json.success ? `已创建测试任务 ${json.data.runId}` : json.message;
  await Promise.all([loadJobs(), loadTrends()]);
});

document.querySelector('#schedule-button').addEventListener('click', async () => {
  const formElement = document.querySelector('#job-form');
  const form = new FormData(formElement);
  const payload = {
    name: form.get('scheduleName'),
    intervalSeconds: Number(form.get('intervalSeconds')),
    input: getJobPayload(formElement),
  };
  if (state.selectedTeamId) payload.teamId = state.selectedTeamId;
  document.querySelector('#form-status').textContent = '正在创建定时计划...';
  const response = await fetch(`${apiBase}/api/schedules`, { method: 'POST', headers: { 'content-type': 'application/json' }, ...protectedFetchOptions(), body: JSON.stringify(payload) });
  const json = await response.json();
  document.querySelector('#form-status').textContent = json.success ? `已创建定时计划 ${json.data.name}` : json.message;
  await Promise.all([loadJobs(), loadSchedules(), loadTrends()]);
});

document.querySelector('#fetch-models-button').addEventListener('click', fetchModelList);

document.querySelector('#model-select').addEventListener('change', (event) => {
  const model = event.currentTarget.value;
  if (model) document.querySelector('#model-input').value = model;
});

function getJobPayload(formElement) {
  const form = new FormData(formElement);
  const payload = Object.fromEntries(form.entries());
  delete payload.scheduleName;
  delete payload.intervalSeconds;
  if (!state.selectedTeamId) delete payload.teamId;
  payload.concurrency = Number(payload.concurrency);
  payload.durationSeconds = Number(payload.durationSeconds);
  payload.retainFullBodies = form.has('retainFullBodies');
  return payload;
}

async function fetchModelList() {
  const formElement = document.querySelector('#job-form');
  const form = new FormData(formElement);
  const modelSelect = document.querySelector('#model-select');
  const modelOptions = document.querySelector('#model-options');
  const endpoint = document.querySelector('#model-list-endpoint').value;
  setModelListStatus('正在获取模型列表...');
  modelSelect.hidden = true;
  modelSelect.innerHTML = '';
  modelOptions.innerHTML = '';
  try {
    const response = await fetch(`${apiBase}/api/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...protectedFetchOptions(),
      body: JSON.stringify({ baseUrl: form.get('baseUrl'), apiKey: form.get('apiKey'), endpoint }),
    });
    const json = await response.json();
    if (!json.success) return setModelListStatus(json.message || '获取模型列表失败，仍可手动输入模型。');
    const models = Array.isArray(json.data) ? json.data.filter((item) => item?.id) : [];
    if (!models.length) return setModelListStatus('未返回可用模型，仍可手动输入模型。');
    modelSelect.innerHTML = ['<option value="">选择返回的模型</option>', ...models.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)}</option>`)].join('');
    modelOptions.innerHTML = models.map((item) => `<option value="${escapeHtml(item.id)}"></option>`).join('');
    modelSelect.hidden = false;
    setModelListStatus(`已获取 ${models.length} 个模型，选择后会填入模型输入框。`);
  } catch (error) {
    setModelListStatus(`获取模型列表失败：${error.message}。仍可手动输入模型。`);
  }
}

function setModelListStatus(message) {
  document.querySelector('#model-list-status').textContent = message;
}

document.querySelector('#team-select').addEventListener('change', (event) => {
  state.selectedTeamId = event.currentTarget.value;
});

document.querySelector('#auth-panel').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  if (!submitter?.dataset.authAction) return;
  await submitAuth(submitter.dataset.authAction, event.target);
});

document.querySelector('#auth-panel').addEventListener('click', async (event) => {
  if (event.target?.id !== 'logout-button') return;
  await logout();
});

document.querySelector('#team-panel').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  if (submitter?.dataset.teamAction === 'create') return await createTeam(event.target);
  if (submitter?.dataset.teamAction === 'member') return await addTeamMember(event.target);
});

async function loadCurrentUser() {
  try {
    const response = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
    if (response.status === 401) {
      state.user = null;
      state.authRequired = true;
      renderAccountPanels('需要登录后才能访问受保护的测试资源。');
      return;
    }
    const json = await response.json();
    state.user = json.data?.user || json.user || null;
    state.authRequired = false;
    if (state.user) await loadTeams();
    renderAccountPanels();
  } catch (error) {
    state.user = null;
    renderAccountPanels(`无法连接认证服务：${error.message}`);
  }
}

async function submitAuth(action, formElement) {
  const form = new FormData(formElement);
  const payload = { email: form.get('email'), password: form.get('password') };
  setAuthStatus(action === 'register' ? '正在注册...' : '正在登录...');
  const response = await fetch(`${apiBase}/api/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
  const json = await response.json();
  if (!json.success) return setAuthStatus(json.message || '操作失败');
  state.user = json.data || null;
  state.authRequired = false;
  await loadTeams();
  renderAccountPanels();
  await refreshProtectedData();
}

async function logout() {
  setAuthStatus('正在退出...');
  const response = await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  const json = await response.json();
  if (!json.success) return setAuthStatus(json.message || '退出失败');
  state.user = null;
  state.teams = [];
  state.selectedTeamId = '';
  renderAccountPanels('已退出登录，可继续使用开放模式或重新登录。');
  await refreshProtectedData();
}

async function loadTeams() {
  if (!state.user) {
    state.teams = [];
    state.selectedTeamId = '';
    return;
  }
  const response = await fetch(`${apiBase}/api/teams`, { credentials: 'include' });
  if (response.status === 401) {
    state.teams = [];
    state.selectedTeamId = '';
    return;
  }
  const json = await response.json();
  state.teams = json.data || [];
  if (!state.teams.some((team) => team.id === state.selectedTeamId)) state.selectedTeamId = '';
}

async function createTeam(formElement) {
  const form = new FormData(formElement);
  setTeamStatus('正在创建团队...');
  const response = await fetch(`${apiBase}/api/teams`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: form.get('teamName') }) });
  const json = await response.json();
  if (!json.success) return setTeamStatus(json.message || '创建团队失败');
  state.teams = [json.data, ...state.teams.filter((team) => team.id !== json.data.id)];
  state.selectedTeamId = json.data.id;
  renderAccountPanels(`已创建团队 ${json.data.name}`);
}

async function addTeamMember(formElement) {
  if (!state.selectedTeamId) return setTeamStatus('请先选择一个团队。');
  const form = new FormData(formElement);
  setTeamStatus('正在添加成员...');
  const response = await fetch(`${apiBase}/api/teams/${encodeURIComponent(state.selectedTeamId)}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email: form.get('memberEmail') }) });
  const json = await response.json();
  setTeamStatus(json.success ? `已添加成员 ${json.data.email}` : json.message || '添加成员失败');
  if (json.success) await loadTeams();
  renderAccountPanels();
}

function renderAccountPanels(message = '') {
  renderAuthPanel(message);
  renderTeamPanel();
  renderTeamSelect();
}

function renderAuthPanel(message = '') {
  document.querySelector('#auth-panel').innerHTML = state.user ? `<div class="account-summary">
    <p class="muted">当前用户</p>
    <strong>${escapeHtml(state.user.email)}</strong>
    <button type="button" id="logout-button" class="secondary compact-button">退出</button>
    <p id="auth-status" class="muted">${escapeHtml(message)}</p>
  </div>` : `<form class="auth-form">
    <label>邮箱<input name="email" type="email" autocomplete="email" required /></label>
    <label>密码<input name="password" type="password" autocomplete="current-password" minlength="8" required /></label>
    <div class="button-row">
      <button type="submit" data-auth-action="register" class="secondary">注册</button>
      <button type="submit" data-auth-action="login">登录</button>
    </div>
    <p id="auth-status" class="muted">${escapeHtml(message || (state.authRequired ? '当前后端要求登录。' : '未登录时将按开放模式尝试运行。'))}</p>
  </form>`;
}

function renderTeamPanel() {
  document.querySelector('#team-panel').innerHTML = state.user ? `<form class="team-form">
    <fieldset>
      <legend>团队管理</legend>
      <label>团队名称<input name="teamName" placeholder="质量测试团队" /></label>
      <button type="submit" data-team-action="create" class="secondary">创建团队</button>
      <label>成员邮箱<input name="memberEmail" type="email" placeholder="member@example.com" /></label>
      <button type="submit" data-team-action="member">添加成员</button>
      <p id="team-status" class="muted">${state.teams.length ? '选择团队后，新任务和计划会带上 teamId。' : '创建团队后可选择团队归属。'}</p>
    </fieldset>
  </form>` : '<p class="muted team-empty">登录后可创建团队，并通过邮箱添加已注册成员。</p>';
}

function renderTeamSelect() {
  const select = document.querySelector('#team-select');
  const options = ['<option value="">个人/开放模式</option>', ...state.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`)].join('');
  select.innerHTML = options;
  select.value = state.teams.some((team) => team.id === state.selectedTeamId) ? state.selectedTeamId : '';
  state.selectedTeamId = select.value;
  document.querySelector('#team-select-row').hidden = !state.user && !state.teams.length;
}

function setAuthStatus(message) {
  document.querySelector('#auth-status').textContent = message;
}

function setTeamStatus(message) {
  document.querySelector('#team-status').textContent = message;
}

async function loadJobs() {
  const response = await fetch(`${apiBase}/api/jobs`, protectedFetchOptions());
  if (response.status === 401) {
    state.jobs = [];
    document.querySelector('#health-score').textContent = '--';
    return renderProtectedNotice('#jobs', '登录后可查看受保护的测试历史。');
  }
  const json = await response.json();
  state.jobs = json.data || [];
  renderJobs();
}

async function loadSchedules() {
  const response = await fetch(`${apiBase}/api/schedules`, protectedFetchOptions());
  if (response.status === 401) {
    state.schedules = [];
    return renderProtectedNotice('#schedules', '登录后可查看受保护的定时计划。');
  }
  const json = await response.json();
  state.schedules = json.data || [];
  renderSchedules();
}

async function loadTrends() {
  const response = await fetch(`${apiBase}/api/analytics/trends`, protectedFetchOptions());
  if (response.status === 401) {
    state.trends = [];
    return renderProtectedNotice('#trends', '登录后可查看受保护的趋势数据。');
  }
  const json = await response.json();
  state.trends = json.data || [];
  renderTrends();
}

function renderProtectedNotice(selector, message) {
  document.querySelector(selector).innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
}

async function refreshProtectedData() {
  await Promise.all([loadJobs(), loadSchedules(), loadTrends()]);
}

function protectedFetchOptions() {
  return shouldSendCredentials() ? { credentials: 'include' } : {};
}

function shouldSendCredentials() {
  return isSameOriginApi() || state.authRequired || Boolean(state.user) || Boolean(state.selectedTeamId);
}

function isSameOriginApi() {
  return new URL(apiBase, window.location.href).origin === window.location.origin;
}

function renderJobs() {
  const latest = state.jobs[0];
  document.querySelector('#health-score').textContent = latest ? latest.score : '--';
  document.querySelector('#jobs').innerHTML = state.jobs.length ? state.jobs.map(renderJob).join('') : '<p class="muted">暂无测试记录。填写参数后点击“立即运行测试”开始生成趋势和报告。</p>';
}

function renderJob(job) {
  const checks = (job.checks || []).map((item) => `<li class="${escapeHtml(item.status)}"><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.detail)}</strong></li>`).join('');
  const artifacts = ['request.json', 'response.json', 'report.json'].map((name) => `<a href="${artifactUrl(job.runId, name)}" target="_blank" rel="noopener">${name}</a>`).join('');
  const exports = ['csv', 'html', 'zip'].map((format) => `<a href="${exportUrl(job.runId, format)}" target="_blank" rel="noopener">${format.toUpperCase()} 报告</a>`).join('');
  return `<article class="job">
    <header><strong>${escapeHtml(job.runId)}</strong><span>${escapeHtml(job.status)}</span><b>${escapeHtml(job.score)}%</b></header>
    <p>${escapeHtml(formatRunSummary(job.input, `${job.summary?.totalRequests || 0} 次请求`))}</p>
    <section class="link-group">
      <h3>测试证据</h3>
      <nav class="artifacts" aria-label="${escapeHtml(job.runId)} 的测试证据">${artifacts}</nav>
    </section>
    <section class="link-group export-group">
      <h3>报告导出</h3>
      <nav class="artifacts" aria-label="${escapeHtml(job.runId)} 的报告导出">${exports}</nav>
    </section>
    ${renderBenchmarkReport(job)}
    <ul>${checks}</ul>
  </article>`;
}

function renderBenchmarkReport(job) {
  const input = job.input || {};
  const summary = job.summary || {};
  const durationSeconds = toFiniteNumber(input.durationSeconds);
  const totalRequests = toFiniteNumber(summary.totalRequests);
  const successCount = toFiniteNumber(summary.successCount);
  const rateLimitedCount = toFiniteNumber(summary.rateLimitedCount);
  const timeoutCount = firstFiniteValue(summary.timeoutCount, summary.timedOutCount, summary.timeouts);
  const failureCount = firstFiniteValue(summary.failureCount, summary.failedCount, summary.errorCount, deriveFailureCount(totalRequests, successCount, rateLimitedCount));

  const groups = [
    renderReportGroup('测试配置', [
      reportMetric('API地址', input.baseUrl),
      reportMetric('端点预设', input.endpointPreset ? formatEndpointPreset(input.endpointPreset) : undefined),
      reportMetric('测试模式', input.mode ? formatTestMode(input.mode) : undefined),
      reportMetric('目标模型', input.model),
      reportMetric('并发数', input.concurrency),
      reportMetric('设定时长', input.durationSeconds, '秒'),
    ]),
    renderReportGroup('总体结果', [
      reportMetric('总请求数', summary.totalRequests),
      reportMetric('成功数', formatCountWithPercent(successCount, totalRequests)),
      reportMetric('限流数', summary.rateLimitedCount),
      reportMetric('超时数', timeoutCount),
      reportMetric('失败数', failureCount),
    ]),
    renderReportGroup('吞吐量 KPI', [
      reportMetric('成功 RPM', firstFiniteValue(summary.throughput?.successRpm, deriveSuccessRpm(successCount, durationSeconds)), 'rpm'),
      reportMetric('整体 RPS', firstFiniteValue(summary.throughput?.overallRps, deriveOverallRps(totalRequests, durationSeconds)), 'rps'),
    ]),
    renderReportGroup('延迟分析', renderStatMetrics(summary.latencyMs || summary.latency, 'ms', true)),
    renderReportGroup('响应体大小', renderStatMetrics(summary.responseBytes, 'B')),
    renderErrorGroup(summary.errors),
    renderReportGroup('客户端排队延迟', [
      ...renderStatMetrics(summary.queueLatency, 'ms', false, ['avg', 'p99', 'max']),
      reportMetric('Legacy', summary.queueLatencyMs, 'ms'),
    ]),
    renderReportGroup('Token 消耗', [
      reportMetric('总量', summary.tokens?.total),
    ]),
    renderReportGroup('实际并发度', [
      reportMetric('最大', summary.concurrency?.max),
      reportMetric('平均', summary.concurrency?.avg),
      !hasAnyFiniteValue(summary.concurrency, ['max', 'avg']) ? reportMetric('配置并发数', input.concurrency) : '',
    ]),
    renderReportGroup('TTFB', [
      ...renderStatMetrics(summary.ttfb, 'ms', false, ['avg', 'p50']),
      reportMetric('Legacy', summary.ttfbMs, 'ms'),
    ]),
  ].filter(Boolean);

  if (!groups.length) return '';
  return `<details class="benchmark-report" aria-label="${escapeHtml(job.runId)} 的详细结果报告">
    <summary>详细结果报告</summary>
    <div class="report-groups">${groups.join('')}</div>
  </details>`;
}

function renderReportGroup(title, metrics) {
  const content = metrics.filter(Boolean).join('');
  if (!content) return '';
  return `<section class="report-group">
    <h4>${escapeHtml(title)}</h4>
    <div class="report-grid">${content}</div>
  </section>`;
}

function renderErrorGroup(errors) {
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return '';
  const entries = Object.entries(errors).filter(([, value]) => isPresentMetric(value));
  if (!entries.length) {
    return renderReportGroup('错误类型细分', [reportMetric('系统级错误', '无系统级错误')]);
  }
  return renderReportGroup('错误类型细分', entries.map(([name, value]) => reportMetric(name, value)));
}

function renderStatMetrics(source, unit, includeP95Fallback = false, keys = ['avg', 'p50', 'p90', 'p99', 'min', 'max']) {
  if (!source || typeof source !== 'object') return [];
  const labels = { avg: '平均', p50: 'P50', p90: 'P90', p95: 'P95', p99: 'P99', min: '最小', max: '最大' };
  const metrics = keys.map((key) => reportMetric(labels[key] || key, source[key], unit));
  if (includeP95Fallback && !isPresentMetric(source.p90) && !isPresentMetric(source.p99) && isPresentMetric(source.p95)) {
    metrics.splice(2, 0, reportMetric(labels.p95, source.p95, unit));
  }
  return metrics;
}

function reportMetric(label, value, unit = '') {
  if (!isPresentMetric(value)) return '';
  const displayValue = typeof value === 'number' ? formatReportNumber(value) : String(value);
  return `<div class="report-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(displayValue)}${escapeHtml(unit)}</strong></div>`;
}

function formatCountWithPercent(count, total) {
  if (!Number.isFinite(count)) return undefined;
  if (!Number.isFinite(total) || total <= 0) return formatReportNumber(count);
  return `${formatReportNumber(count)} (${formatReportNumber((count / total) * 100)}%)`;
}

function deriveSuccessRpm(successCount, durationSeconds) {
  if (!Number.isFinite(successCount) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;
  return (successCount / durationSeconds) * 60;
}

function deriveOverallRps(totalRequests, durationSeconds) {
  if (!Number.isFinite(totalRequests) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;
  return totalRequests / durationSeconds;
}

function deriveFailureCount(totalRequests, successCount, rateLimitedCount) {
  if (!Number.isFinite(totalRequests) || !Number.isFinite(successCount)) return undefined;
  const limited = Number.isFinite(rateLimitedCount) ? rateLimitedCount : 0;
  const failures = totalRequests - successCount - limited;
  return failures >= 0 ? failures : undefined;
}

function firstFiniteValue(...values) {
  return values.find((value) => Number.isFinite(toFiniteNumber(value)));
}

function hasAnyFiniteValue(source, keys) {
  if (!source || typeof source !== 'object') return false;
  return keys.some((key) => Number.isFinite(toFiniteNumber(source[key])));
}

function isPresentMetric(value) {
  return value !== undefined && value !== null && value !== '';
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatReportNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderSchedules() {
  document.querySelector('#schedules').innerHTML = state.schedules.length ? state.schedules.map(renderSchedule).join('') : '<p class="muted">暂无定时计划。创建计划后，请保持 <code>npm run start:worker</code> 运行以自动执行测试。</p>';
}

function renderTrends() {
  document.querySelector('#trends').innerHTML = state.trends.length ? [
    renderTrendMetric('测试得分', state.trends.map((point) => point.score), '%'),
    renderTrendMetric('成功率', state.trends.map((point) => point.successRate), '%'),
    renderTrendMetric('p95 延迟', state.trends.map((point) => point.latencyP95), 'ms'),
    renderTrendMetric('总请求数', state.trends.map((point) => point.totalRequests), ''),
  ].join('') : '<p class="muted">暂无趋势数据。运行测试后会自动生成得分、成功率、延迟和请求量趋势。</p>';
}

function renderTrendMetric(label, values, suffix) {
  const numericValues = values.map(Number).filter(Number.isFinite);
  const latest = numericValues.at(-1);
  const points = buildSparklinePoints(numericValues);
  return `<article class="trend-metric">
    <header><span>${escapeHtml(label)}</span><strong>${formatMetric(latest, suffix)}</strong></header>
    ${points.length > 1 ? `<svg viewBox="0 0 100 32" role="img" aria-label="${escapeHtml(label)}趋势"><polyline points="${escapeHtml(points.join(' '))}" /></svg>` : '<div class="trend-empty muted">至少需要两次测试数据。</div>'}
  </article>`;
}

function buildSparklinePoints(values) {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 28 - ((value - min) / range) * 24;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
}

function formatMetric(value, suffix) {
  if (!Number.isFinite(value)) return '--';
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${escapeHtml(formatted)}${escapeHtml(suffix)}`;
}

function renderSchedule(schedule) {
  return `<article class="job">
    <header><strong>${escapeHtml(schedule.name)}</strong><span>每 ${escapeHtml(schedule.intervalSeconds)} 秒</span><b>${escapeHtml(schedule.history?.length || 0)} 次运行</b></header>
    <p>${escapeHtml(formatRunSummary(schedule.input))}</p>
    <p class="muted">后台 worker 会按此间隔自动执行；请确保 <code>npm run start:worker</code> 正在运行。</p>
    <p class="muted">最近运行：${escapeHtml(schedule.lastRunId || '暂无')}</p>
  </article>`;
}

function formatExecutionMode(mode) {
  return ({ synthetic: '模拟探测', live: '真实请求' })[mode] || mode;
}

function formatTestMode(mode) {
  return ({ text: '文本', image: '图像', 'aspect-ratio': '宽高比' })[mode] || mode;
}

function formatEndpointPreset(preset) {
  return ({
    'openai-chat': 'OpenAI ChatCompletions',
    'openai-responses': 'OpenAI Responses',
    'claude-messages': 'Claude Messages',
    'gemini-generate-content': 'Gemini generateContent',
    'openai-image-generation': 'OpenAI 图像生成',
  })[preset] || preset;
}

function formatRunSummary(input = {}, suffix) {
  return [
    formatExecutionMode(input.executionMode || 'synthetic'),
    formatTestMode(input.mode),
    input.model,
    input.endpointPreset ? formatEndpointPreset(input.endpointPreset) : undefined,
    suffix,
  ].filter(Boolean).join(' / ');
}

function artifactUrl(runId, name) {
  return `${apiBase}/api/jobs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`;
}

function exportUrl(runId, format) {
  return `${apiBase}/api/jobs/${encodeURIComponent(runId)}/export.${encodeURIComponent(format)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

loadCurrentUser().then(refreshProtectedData).catch((error) => {
  document.querySelector('#jobs').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  document.querySelector('#schedules').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  document.querySelector('#trends').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
