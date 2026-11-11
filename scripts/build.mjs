import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const dir=new URL('../dist/',import.meta.url);
await rm(dir,{recursive:true,force:true});
await mkdir(dir,{recursive:true});
for(const path of ['index.html','styles.css','src','_headers','robots.txt','favicon.svg']) await cp(new URL('../'+path,import.meta.url),new URL('../dist/'+path,import.meta.url),{recursive:true});
console.log('Built static site to dist/ (Cloudflare Pages Functions are deployed from functions/).');
