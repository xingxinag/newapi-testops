import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceUrls, formatStartupMessage } from './compose-up.mjs';

test('buildServiceUrls uses default compose port mappings', () => {
  assert.deepEqual(buildServiceUrls(), {
    web: 'http://127.0.0.1:4178',
    api: 'http://127.0.0.1:8788',
    health: 'http://127.0.0.1:8788/api/health',
  });
});

test('buildServiceUrls uses published ports from compose ps json', () => {
  const services = [
    { Service: 'api', Publishers: [{ TargetPort: 8788, PublishedPort: 18788 }] },
    { Service: 'web', Publishers: [{ TargetPort: 80, PublishedPort: 14178 }] },
  ];

  assert.deepEqual(buildServiceUrls(services), {
    web: 'http://127.0.0.1:14178',
    api: 'http://127.0.0.1:18788',
    health: 'http://127.0.0.1:18788/api/health',
  });
});

test('formatStartupMessage prints user-facing service URLs', () => {
  const message = formatStartupMessage({
    web: 'http://127.0.0.1:4178',
    api: 'http://127.0.0.1:8788',
    health: 'http://127.0.0.1:8788/api/health',
  });

  assert.match(message, /Web:\s+http:\/\/127\.0\.0\.1:4178/);
  assert.match(message, /API:\s+http:\/\/127\.0\.0\.1:8788/);
  assert.match(message, /Health:\s+http:\/\/127\.0\.0\.1:8788\/api\/health/);
  assert.match(message, /VPS/);
});
