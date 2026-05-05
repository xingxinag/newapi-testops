import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('backend connection card supports manual API URL testing', async () => {
  const app = await readFile('apps/web/src/app.mjs', 'utf8');

  assert.match(app, /id="api-base-input"/);
  assert.match(app, /id="api-test-button"/);
  assert.match(app, /#api-connection-form'\)\.addEventListener\('submit'/);
  assert.match(app, /event\.preventDefault\(\);/);
  assert.match(app, /await testApiConnection\(\);/);
  assert.match(app, /function getApiBase\(\)/);
  assert.match(app, /function normalizeApiBase\(value\)/);
  assert.match(app, /await checkApiHealth\(getApiBase\(\)\)/);
  assert.match(app, /fetch\(`\$\{getApiBase\(\)\}\/api\/auth\/me`, protectedFetchOptions\(\)\)/);
});

test('new TestOps controls expose required DOM markers', async () => {
  const app = await readFile('apps/web/src/app.mjs', 'utf8');

  for (const marker of [
    'history-access-scope',
    'immediate-feedback',
    'question-bank',
    'question-bank-image-prompt',
    'history-name-mode',
    'history-custom-name',
    'storage-config',
    'storage-secret-masked',
    'schedule-cron',
    'notification-config',
  ]) {
    assert.match(app, new RegExp(`data-testid="${marker}"`));
  }
});

test('job and schedule payloads include TestOps MVP fields', async () => {
  const app = await readFile('apps/web/src/app.mjs', 'utf8');

  assert.match(app, /payload\.accessScope = form\.get\('accessScope'\)/);
  assert.match(app, /payload\.accessPassword = accessPassword/);
  assert.match(app, /payload\.historyNameMode = form\.get\('historyNameMode'\)/);
  assert.match(app, /payload\.historyName = historyName/);
  assert.match(app, /payload\.questionBank = buildQuestionBank\(form\)/);
  assert.match(app, /if \(cron\) payload\.cron = cron/);
  assert.match(app, /intervalSeconds: Number\(form\.get\('intervalSeconds'\)\)/);
});

test('immediate run gives pending feedback and disables button before fetch completes', async () => {
  const app = await readFile('apps/web/src/app.mjs', 'utf8');

  assert.match(app, /const immediateButton = document\.querySelector\('#immediate-run-button'\)/);
  assert.match(app, /immediateButton\.disabled = true/);
  assert.match(app, /document\.querySelector\('\[data-testid="immediate-feedback"\]'\)\.textContent = '正在提交即时测试\.\.\.'/);
  assert.match(app, /finally \{\s*immediateButton\.disabled = false;/s);
});

test('storage and notification config forms call backend config APIs safely', async () => {
  const app = await readFile('apps/web/src/app.mjs', 'utf8');

  assert.match(app, /fetch\(`\$\{getApiBase\(\)\}\/api\/config\/storage`, protectedFetchOptions\(\)\)/);
  assert.match(app, /fetch\(`\$\{getApiBase\(\)\}\/api\/config\/storage`, \{ method: 'POST'/);
  assert.match(app, /fetch\(`\$\{getApiBase\(\)\}\/api\/config\/notifications`, protectedFetchOptions\(\)\)/);
  assert.match(app, /fetch\(`\$\{getApiBase\(\)\}\/api\/config\/notifications`, \{ method: 'POST'/);
  assert.match(app, /secretAccessKeyMasked/);
  assert.doesNotMatch(app, /storage-secret-masked[\s\S]*secretAccessKey\}/);
});
