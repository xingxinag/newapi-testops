import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORTS = { api: 8788, web: 4178 };

export function buildServiceUrls(services = [], host = DEFAULT_HOST) {
  const apiPort = findPublishedPort(services, 'api', 8788) || DEFAULT_PORTS.api;
  const webPort = findPublishedPort(services, 'web', 80) || DEFAULT_PORTS.web;
  return {
    web: `http://${host}:${webPort}`,
    api: `http://${host}:${apiPort}`,
    health: `http://${host}:${apiPort}/api/health`,
  };
}

export function formatStartupMessage(urls) {
  return [
    '',
    'NewAPI TestOps is starting:',
    '',
    `Web:    ${urls.web}`,
    `API:    ${urls.api}`,
    `Health: ${urls.health}`,
    '',
    'If this runs on a VPS, replace 127.0.0.1 with your server IP or domain.',
    'Use docker compose ps to inspect containers and docker compose logs -f to follow logs.',
    '',
  ].join('\n');
}

function findPublishedPort(services, serviceName, targetPort) {
  const service = services.find((item) => item.Service === serviceName || item.Name?.includes(`-${serviceName}-`));
  const publisher = service?.Publishers?.find((item) => Number(item.TargetPort) === targetPort);
  return publisher?.PublishedPort ? Number(publisher.PublishedPort) : null;
}

function readComposeServices() {
  const result = spawnSync('docker', ['compose', 'ps', '--format', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  const text = result.stdout.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split('\n').map((line) => JSON.parse(line));
  }
}

function runComposeUp() {
  const result = spawnSync('docker', ['compose', 'up', '--build', '-d'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(formatStartupMessage(buildServiceUrls(readComposeServices())));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) runComposeUp();
