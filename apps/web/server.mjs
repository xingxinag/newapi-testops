import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/web');
const host = process.env.WEB_HOST || '127.0.0.1';
const port = Number(process.env.WEB_PORT || 4178);

http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    const apiBase = process.env.NEWAPI_TESTOPS_API || 'http://127.0.0.1:8788';
    res.end(`window.__NEWAPI_TESTOPS_API__ = ${JSON.stringify(apiBase)};\n`);
    return;
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(root, pathname.replace(/^\/+/, ''));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'content-type': contentType(filePath) });
  createReadStream(filePath).pipe(res);
}).listen(port, host, () => console.log(`newapi-testops web listening on http://${host}:${port}`));

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}
