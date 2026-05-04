import { mkdir, copyFile, cp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('dist/web');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'src'), { recursive: true });
await copyFile('apps/web/index.html', path.join(out, 'index.html'));
await cp('apps/web/src', path.join(out, 'src'), { recursive: true });
const apiBase = process.env.NEWAPI_TESTOPS_API;
const configValue = apiBase ? JSON.stringify(apiBase) : 'window.location.origin';
await writeFile(path.join(out, 'config.js'), `window.__NEWAPI_TESTOPS_API__ = ${configValue};`);
console.log(`Built static frontend to ${out}`);
