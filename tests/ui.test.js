import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../studio.css', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('all HTML IDs are unique and financial cockpit elements are addressable', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'projectForm','languageToggle','exportBtn','printBtn','sourceBadge','decisionTitle','decisionCopy',
    'independenceValue','netReturnValue','specificYieldValue','leverUseValue','leverCostValue',
    'leverPriceValue','paybackValue','npvValue','monthlyChart','cashChart','tab-system','tab-usage',
    'tab-finance','pane-system','pane-usage','pane-finance','statusBanner','formError'
  ]) assert.ok(ids.includes(id), `Required element missing: ${id}`);
});

test('all calculator numeric fields stay in the HTML even when a tab is hidden', () => {
  for (const name of [
    'lat','lon','peakKw','loss','slope','aspect','annualUsage','selfUsePct','systemCost','grant',
    'importRate','exportRate','annualMaintenance','replacementYear','replacementCost',
    'degradationPct','discountPct','lifetime'
  ]) assert.match(html, new RegExp(`\\bname="${name}"`));
  for (const pane of ['system','usage','finance']) assert.match(html, new RegExp(`id="pane-${pane}"`));
});

test('English labels are restored rather than cleared by a null translation', () => {
  assert.ok(js.includes("const translation=language==='el'?EL[el.dataset.i18n]:undefined"),
    'English must use undefined to trigger the original-label fallback; null clears textContent');
  assert.ok(!js.includes("EL[el.dataset.i18n]:null"));
});

test('production build includes the new responsive stylesheet without heavy client libraries', () => {
  assert.ok(build.includes('studio.css'));
  assert.ok(html.includes('href="/studio.css"'));
  assert.ok(css.includes('@media(max-width:420px)'));
  assert.ok(!html.includes('href="/premium.css"'));
  assert.ok(!html.includes('https://fonts.googleapis.com'));
});
