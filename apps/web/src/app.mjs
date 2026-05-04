const apiBase = window.__NEWAPI_TESTOPS_API__ || 'http://127.0.0.1:8788';

const state = { jobs: [], schedules: [] };

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">NewAPI TestOps</p>
        <h1>Testing, sampling, and relay scoring console</h1>
        <p class="muted">Front/back separated MVP with job history, request/response evidence, relayAPI-style checklist scoring, and deploy matrix docs.</p>
      </div>
      <div class="score"><span id="health-score">--</span><small>latest score</small></div>
    </section>
    <section class="grid">
      <form id="job-form" class="card">
        <h2>Create test job</h2>
        <fieldset>
          <legend>Schedule</legend>
          <label>Schedule name<input name="scheduleName" placeholder="Hourly sample" /></label>
          <label>Interval seconds<input name="intervalSeconds" type="number" value="3600" min="60" /></label>
        </fieldset>
        <label>Base URL<input name="baseUrl" value="https://api.example.com" /></label>
        <label>Model<input name="model" value="demo-model" /></label>
        <label>Mode<select name="mode"><option value="text">text</option><option value="image">image</option><option value="aspect-ratio">aspect-ratio</option></select></label>
        <label>Execution<select name="executionMode"><option value="synthetic">synthetic</option><option value="live">live</option></select></label>
        <label>Concurrency<input name="concurrency" type="number" value="2" min="1" /></label>
        <label>Duration seconds<input name="durationSeconds" type="number" value="2" min="1" /></label>
        <label class="inline"><input name="retainFullBodies" type="checkbox" /> retain full body preview</label>
        <button type="submit">Run synthetic probe</button>
        <button type="button" id="schedule-button" class="secondary">Create schedule</button>
        <p id="form-status" class="muted"></p>
      </form>
      <section class="card">
        <h2>Run history</h2>
        <div id="jobs" class="jobs"></div>
      </section>
      <section class="card">
        <h2>Schedules</h2>
        <div id="schedules" class="jobs"></div>
      </section>
    </section>
  </main>
`;

document.querySelector('#job-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = getJobPayload(event.currentTarget);
  document.querySelector('#form-status').textContent = 'Running...';
  const response = await fetch(`${apiBase}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await response.json();
  document.querySelector('#form-status').textContent = json.success ? `Created ${json.data.runId}` : json.message;
  await loadJobs();
});

document.querySelector('#schedule-button').addEventListener('click', async () => {
  const formElement = document.querySelector('#job-form');
  const form = new FormData(formElement);
  const payload = {
    name: form.get('scheduleName'),
    intervalSeconds: Number(form.get('intervalSeconds')),
    input: getJobPayload(formElement),
  };
  document.querySelector('#form-status').textContent = 'Creating schedule...';
  const response = await fetch(`${apiBase}/api/schedules`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await response.json();
  document.querySelector('#form-status').textContent = json.success ? `Scheduled ${json.data.name}` : json.message;
  await Promise.all([loadJobs(), loadSchedules()]);
});

function getJobPayload(formElement) {
  const form = new FormData(formElement);
  const payload = Object.fromEntries(form.entries());
  delete payload.scheduleName;
  delete payload.intervalSeconds;
  payload.concurrency = Number(payload.concurrency);
  payload.durationSeconds = Number(payload.durationSeconds);
  payload.retainFullBodies = form.has('retainFullBodies');
  return payload;
}

async function loadJobs() {
  const response = await fetch(`${apiBase}/api/jobs`);
  const json = await response.json();
  state.jobs = json.data || [];
  renderJobs();
}

async function loadSchedules() {
  const response = await fetch(`${apiBase}/api/schedules`);
  const json = await response.json();
  state.schedules = json.data || [];
  renderSchedules();
}

function renderJobs() {
  const latest = state.jobs[0];
  document.querySelector('#health-score').textContent = latest ? latest.score : '--';
  document.querySelector('#jobs').innerHTML = state.jobs.length ? state.jobs.map(renderJob).join('') : '<p class="muted">No runs yet.</p>';
}

function renderJob(job) {
  const checks = (job.checks || []).map((item) => `<li class="${escapeHtml(item.status)}"><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.detail)}</strong></li>`).join('');
  const artifacts = ['request.json', 'response.json', 'report.json'].map((name) => `<a href="${artifactUrl(job.runId, name)}" target="_blank" rel="noopener">${name}</a>`).join('');
  return `<article class="job">
    <header><strong>${escapeHtml(job.runId)}</strong><span>${escapeHtml(job.status)}</span><b>${escapeHtml(job.score)}%</b></header>
    <p>${escapeHtml(job.input.executionMode || 'synthetic')} / ${escapeHtml(job.input.mode)} / ${escapeHtml(job.input.model)} / ${escapeHtml(job.summary?.totalRequests || 0)} requests</p>
    <nav class="artifacts" aria-label="Artifacts for ${escapeHtml(job.runId)}">${artifacts}</nav>
    <ul>${checks}</ul>
  </article>`;
}

function renderSchedules() {
  document.querySelector('#schedules').innerHTML = state.schedules.length ? state.schedules.map(renderSchedule).join('') : '<p class="muted">No schedules yet.</p>';
}

function renderSchedule(schedule) {
  return `<article class="job">
    <header><strong>${escapeHtml(schedule.name)}</strong><span>${escapeHtml(schedule.intervalSeconds)}s</span><b>${escapeHtml(schedule.history?.length || 0)} runs</b></header>
    <p>${escapeHtml(schedule.input.executionMode || 'synthetic')} / ${escapeHtml(schedule.input.mode)} / ${escapeHtml(schedule.input.model)}</p>
    <p class="muted">Last run: ${escapeHtml(schedule.lastRunId || 'none')}</p>
  </article>`;
}

function artifactUrl(runId, name) {
  return `${apiBase}/api/jobs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

Promise.all([loadJobs(), loadSchedules()]).catch((error) => {
  document.querySelector('#jobs').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  document.querySelector('#schedules').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
