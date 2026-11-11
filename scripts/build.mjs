import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html','favicon.svg','robots.txt','_headers']) {
  await copyFile(new URL(file, root), new URL(file, dist));
}
for (const directory of ['assets', 'lib']) {
  await cp(new URL(directory, root), new URL(directory, dist), { recursive: true });
}
console.log('Built dependency-free Cloudflare Pages assets into dist/');
