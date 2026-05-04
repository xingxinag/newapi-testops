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
