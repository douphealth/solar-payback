import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../index.html', import.meta.url),'utf8');
const app=readFileSync(new URL('../assets/app.js', import.meta.url),'utf8');
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match)=>match[1]));

test('every programmatically addressed element exists in the published dashboard',()=>{
  const requested=[...app.matchAll(/\$\('([\w-]+)'\)/g)].map((m)=>m[1]);
  assert.ok(requested.length>30);
  for(const id of requested) assert.ok(ids.has(id),`Missing #${id}`);
});

test('financial settings are connected to actual named input fields',()=>{
  for(const name of ['capacity','annualDemand','selfUsePct','buyPrice','exportPrice','costPerKw','grant','opexPct','degradationPct','priceGrowthPct','exportGrowthPct','discountPct','inverterYear','inverterCost','years']){
    assert.ok(new RegExp(`name="${name}"`).test(html),`${name} missing`);
  }
});

test('deployment includes same-origin API and authoritative source links',()=>{
  assert.match(app,/fetch\(`\/api\/solar\?/);
  assert.match(html,/joint-research-centre\.ec\.europa\.eu/);
  assert.match(html,/ec\.europa\.eu\/eurostat/);
  assert.match(html,/ypen\.gov\.gr/);
  assert.match(html,/aria-live="polite"/);
});
