import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, normalizePVGIS, onRequestGet } from '../functions/api/solar.js';

const q = 'lat=37.9838&lon=23.7275&peakpower=5&loss=14&angle=30&aspect=0';
const row = (month) => ({ month, E_m: 100, SD_m: 5 });
const payload = {
  inputs: { meteo_data: { radiation_db: 'PVGIS-SARAH3', year_min: 2005, year_max: 2023 } },
  outputs: { monthly: { fixed: Array.from({ length: 12 }, (_, i) => row(i + 1)) }, totals: { fixed: { E_y: 1200 } } },
};

test('validates coordinates, capacity, tilt, azimuth, losses before contacting provider', () => {
  const input = parseParams(new URLSearchParams(q));
  assert.equal(input.lat, 37.9838);
  assert.equal(input.peakpower, 5);
  assert.throws(() => parseParams(new URLSearchParams(q.replace('lat=37.9838', 'lat=999'))), /lat/);
  assert.throws(() => parseParams(new URLSearchParams(q.replace('loss=14', 'loss=99'))), /loss/);
  assert.throws(() => parseParams(new URLSearchParams(q.replace('angle=30', 'angle=nan'))), /angle/);
  assert.throws(() => parseParams(new URLSearchParams(q.replace('&aspect=0', ''))), /aspect/);
});

test('normalizes complete PVGIS JSON without inventing readings', () => {
  const v = normalizePVGIS(payload);
  assert.equal(v.monthly.length, 12);
  assert.equal(v.annualKwh, 1200);
  assert.equal(v.dataset, 'PVGIS-SARAH3');
  assert.equal(v.weatherPeriod.to, 2023);
  assert.throws(() => normalizePVGIS({}), /incomplete/);
  assert.throws(() => normalizePVGIS({ ...payload, outputs: { ...payload.outputs, totals: { fixed: { E_y: 950 } } } }), /disagree/);
});

test('API proxy rejects invalid inputs before requesting PVGIS', async () => {
  const response = await onRequestGet({ request: new Request(`https://example.test/api/solar?${q}&loss=99`.replace('loss=14&','')) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'BAD_INPUT');
});

test('proxy fetches only official PVGIS endpoint and returns normalized production', async () => {
  const originalFetch = globalThis.fetch;
  let requested = null;
  try {
    globalThis.fetch = async (url) => { requested = new URL(url); return new Response(JSON.stringify(payload), { status: 200 }); };
    const response = await onRequestGet({ request: new Request(`https://example.test/api/solar?${q}`) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(requested.hostname, 're.jrc.ec.europa.eu');
    assert.equal(requested.pathname, '/api/v5_3/PVcalc');
    assert.equal(requested.searchParams.get('outputformat'), 'json');
    assert.equal(body.annualKwh, 1200);
    assert.equal(body.inputs.lat, 37.9838);
  } finally { globalThis.fetch = originalFetch; }
});

test('temporarily overloaded provider is not disguised as model output', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('busy', { status: 529 });
    const response = await onRequestGet({ request: new Request(`https://example.test/api/solar?${q}`) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'PROVIDER_BUSY');
  } finally { globalThis.fetch = originalFetch; }
});
