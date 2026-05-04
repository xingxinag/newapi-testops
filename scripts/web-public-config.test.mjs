import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('build defaults static web API config to same-origin', async () => {
  const env = { ...process.env };
  delete env.NEWAPI_TESTOPS_API;

  await execFileAsync(process.execPath, ['scripts/build.mjs'], { env });

  const config = await readFile('dist/web/config.js', 'utf8');
  assert.match(config, /window\.location\.origin/);
  assert.doesNotMatch(config, /127\.0\.0\.1:8788/);
});

test('nginx proxies same-origin API requests to compose API service', async () => {
  const nginxConfig = await readFile('deploy/nginx.conf', 'utf8');

  assert.match(nginxConfig, /location\s+\/api\//);
  assert.match(nginxConfig, /proxy_pass\s+http:\/\/api:8788/);
});

test('nginx serves module scripts with a browser-accepted mime type', async () => {
  const nginxConfig = await readFile('deploy/nginx.conf', 'utf8');

  assert.match(nginxConfig, /include\s+\/etc\/nginx\/mime\.types/);
  assert.match(nginxConfig, /application\/javascript\s+mjs/);
});
