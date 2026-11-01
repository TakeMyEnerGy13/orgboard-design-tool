import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { handleAssistant } from './assistant-api.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
try { loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const port = Number(process.env.PORT || 4188);
const host = process.env.HOST || '127.0.0.1';
const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : undefined;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.ttf': 'font/ttf' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/assistant')) { await handleAssistant(req, res, publicOrigin); return; }
    if (pathname === '/walkthrough') { res.writeHead(302, { Location: '/walkthrough/' }); res.end(); return; }
    const file = path.resolve(root, '.' + (pathname === '/' || pathname === '/walkthrough/' ? pathname + 'index.html' : pathname));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !['index.html', 'src', 'walkthrough'].includes(relative.split(path.sep)[0])) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, host, () => console.log(`OrgBoard ready: ${publicOrigin || `http://${host}:${port}`}`));
