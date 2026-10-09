// Build the site, serve dist/ on http://localhost:8080 and rebuild when a source file changes.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Each build runs in a new process, so changes to the build code and the templates are picked up too.
function rebuild() {
  return new Promise((resolve) => {
    spawn(process.execPath, [join(ROOT, 'src/build.mjs')], { stdio: 'inherit' }).on('close', resolve);
  });
}

await rebuild();

let timer;
for (const dir of ['src', 'content', 'data', 'public'].filter((name) => existsSync(join(ROOT, name)))) {
  watch(join(ROOT, dir), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  });
}

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) file = DIST;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
