import { cp, mkdir, rm } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
const root = new URL('../', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', '_headers', '_worker.js', 'favicon.svg', 'robots.txt', 'assets', 'src']) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
console.log('Cloudflare Pages production assets written to dist/');
