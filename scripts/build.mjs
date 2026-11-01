import { cp, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
await mkdir(out, { recursive: true });
await cp(new URL('index.html', root), new URL('index.html', out));
await cp(new URL('src/', root), new URL('src/', out), { recursive: true });
await cp(new URL('walkthrough/', root), new URL('walkthrough/', out), { recursive: true });
