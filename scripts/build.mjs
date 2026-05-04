import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('dist/web');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'src'), { recursive: true });
await copyFile('apps/web/index.html', path.join(out, 'index.html'));
await cp('apps/web/src', path.join(out, 'src'), { recursive: true });
console.log(`Built static frontend to ${out}`);
