import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULTS,
  CITY_BENCHMARKS,
  POLICY_DIRECTORY,
  HARDWARE_DIRECTORY,
  convertFromEur,
  estimateMonthlyProduction,
  calculateForecast,
  calculateSensitivityMatrix,
  computePaybackMetrics,
  calculateMIRR,
  checkHardwareCompatibility,
  asCSV
} from '../src/engine.js';
import {
  parseLoadCSV,
  normalizeHourlyPVGIS,
  simulateHourly,
  hourlyForecast
} from '../src/hourly.js';
import {
  roofFit,
  optimizeSizes,
  projectFinance,
  scoreAssumptions
} from '../src/model.js';
import {
  strictNum,
  normalizePVGIS,
  normalizeHourly as workerNormalizeHourly,
  checkRateLimit
} from '../_worker.js';

test('C01: City benchmarks and regional estimates are never marked verifiedProvider', () => {
  for (const city of CITY_BENCHMARKS) {
    assert.equal(city.verifiedProvider, false);
    assert.equal(city.quality, 'benchmark-reference');
  }
  const est = estimateMonthlyProduction(DEFAULTS);
  assert.equal(est.verifiedProvider, false);
  assert.equal(est.quality, 'benchmark-reference');
  const fc = calculateForecast(est.monthlyKwh, DEFAULTS);
  const flags = scoreAssumptions(fc, est.quality);
  assert.ok(flags.some(f => f.includes('unverified reference model')));
});

test('C03: Dataset-aware PVGIS hourly parser accepts :00, :10, :30 (ERA5) and :07 (SARAH3) minute offsets', () => {
  for (const minute of ['00', '10', '30', '07']) {
    const records = Array.from({ length: 8760 }, (_, i) => {
      const d = new Date(Date.UTC(2023, 0, 1, i));
      const ts =
        d.getUTCFullYear() +
        String(d.getUTCMonth() + 1).padStart(2, '0') +
        String(d.getUTCDate()).padStart(2, '0') +
        ':' +
        String(d.getUTCHours()).padStart(2, '0') +
        minute;
      return { time: ts, P: (i % 24 >= 8 && i % 24 <= 16) ? 1200 : 0 };
    });
    const payload = { inputs: { meteo_data: { radiation_db: `PVGIS-TEST-${minute}` } }, outputs: { hourly: records } };
    const normClient = normalizeHourlyPVGIS(payload, 2023);
    const normWorker = workerNormalizeHourly(payload, 2023);
    assert.equal(normClient.hourlyKwh.length, 8760);
    assert.equal(normClient.minuteOffset, Number(minute));
    assert.equal(normWorker.minuteOffset, Number(minute));
    assert.ok(Math.abs(normClient.annualKwh - normWorker.annualKwh) < 1e-4);
  }
});

test('C04: Monthly & Hourly PVGIS validators strictly reject null, undefined, boolean, empty string, or duplicate months', () => {
  assert.throws(() => strictNum(null, 'E_m'), /null or missing/i);
  assert.throws(() => strictNum('', 'E_m'), /null or missing/i);
  assert.throws(() => strictNum(false, 'E_m'), /null or missing/i);

  // Audit Quantitative Test #1: Monthly PVGIS JSON with one null E_m must throw
  const badMonths = Array.from({ length: 12 }, (_, i) => ({
    m: i + 1,
    E_m: i === 5 ? null : 500
  }));
  assert.throws(() => normalizePVGIS({ outputs: { monthly: { fixed: badMonths } } }), /null or missing/i);

  // Hourly PVGIS JSON with one null P must throw
  const badHourly = Array.from({ length: 8760 }, (_, i) => {
    const d = new Date(Date.UTC(2023, 0, 1, i));
    const ts =
      d.getUTCFullYear() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0') +
      ':' +
      String(d.getUTCHours()).padStart(2, '0') +
      '10';
    return { time: ts, P: i === 400 ? null : 500 };
  });
  assert.throws(() => workerNormalizeHourly({ outputs: { hourly: badHourly } }, 2023), /null or missing/i);
  assert.throws(() => normalizeHourlyPVGIS({ outputs: { hourly: badHourly } }, 2023), /null or missing/i);
});

test('C05: 3x3 Sensitivity Matrix center cell and Array Sizer match main hourlyForecast NPV to the cent', () => {
  const pv = Array.from({ length: 8760 }, (_, i) => (i % 24 >= 9 && i % 24 <= 16 ? 1.1 : 0));
  const load = Array.from({ length: 8760 }, (_, i) => (i % 24 >= 18 && i % 24 <= 22 ? 1.4 : 0.4));
  const inputs = { ...DEFAULTS, annualUsage: load.reduce((a, b) => a + b, 0) };
  const evaluator = (inp, mult = 1) => hourlyForecast(pv.map(v => v * mult), load, inp, 5, true);

  const mainFc = evaluator(inputs, 1);
  const est = estimateMonthlyProduction(inputs);
  const matrix = calculateSensitivityMatrix(est.monthlyKwh, inputs, evaluator);
  const centerCell = matrix[1].cells[1];

  assert.ok(Math.abs(centerCell.npv - mainFc.npv) < 1e-6, `Expected matrix center ${centerCell.npv} to equal main NPV ${mainFc.npv}`);
  assert.equal(centerCell.exactSimplePayback, mainFc.exactSimplePayback);

  const sized = optimizeSizes(est.monthlyKwh, inputs, {
    sizes: [inputs.peakKw],
    evaluatorFn: (testInp, ratio) => evaluator(testInp, ratio)
  });
  assert.ok(Math.abs(sized[0].npv - mainFc.npv) < 1e-6);
});

test('C06 & Gate 3: Hourly energy conservation holds to 1e-6 kWh across Midday vs Evening load timing', () => {
  // Audit Quantitative Test #3: 1,825 kWh PV vs 1,825 kWh load (all midday vs all evening)
  const pv = Array.from({ length: 8760 }, (_, i) => (i % 24 === 12 ? 5.0 : 0)); // 365 * 5 = 1825 kWh
  const middayLoad = Array.from({ length: 8760 }, (_, i) => (i % 24 === 12 ? 5.0 : 0));
  const eveningLoad = Array.from({ length: 8760 }, (_, i) => (i % 24 === 20 ? 5.0 : 0));

  const simMid = simulateHourly(pv, middayLoad, { batteryKwh: 0, batteryEfficiencyPct: 90, batteryPowerKw: 5 });
  const simEve = simulateHourly(pv, eveningLoad, { batteryKwh: 0, batteryEfficiencyPct: 90, batteryPowerKw: 5 });

  assert.equal(simMid.totals.selfConsumptionPct, 100);
  assert.equal(simEve.totals.selfConsumptionPct, 0);

  // Check energy conservation with a 10 kWh battery
  const simBatt = simulateHourly(pv, eveningLoad, { batteryKwh: 10, batteryEfficiencyPct: 90, batteryPowerKw: 5 });
  const pvResidual = Math.abs(simBatt.totals.pv - (simBatt.totals.direct + simBatt.totals.toBattery + simBatt.totals.gridExport));
  const loadResidual = Math.abs(simBatt.totals.load - (simBatt.totals.direct + simBatt.totals.fromBattery + simBatt.totals.gridImport));
  assert.ok(pvResidual < 1e-6, `PV residual ${pvResidual} exceeds 1e-6`);
  assert.ok(loadResidual < 1e-6, `Load residual ${loadResidual} exceeds 1e-6`);
});

test('C08: Dutch Salderingsregeling policy explicitly states ending on 1 January 2027 (2027-01-01)', () => {
  const nl = POLICY_DIRECTORY.find(p => p.id === 'benelux_transition');
  assert.ok(nl);
  assert.ok(nl.expiresOn.includes('2027-01-01'));
  assert.ok(nl.summary.includes('1 January 2027'));
  assert.equal(nl.sourceUrl, 'https://www.rijksoverheid.nl/themas/klimaat-milieu-en-natuur/energie-thuis/salderingsregeling');
});

test('C10 & C12: Currency conversion guard and 2D setback roof geometry', () => {
  assert.equal(convertFromEur(1000, 'EUR'), 1000);
  assert.equal(convertFromEur(1000, 'USD'), 1080);
  assert.equal(convertFromEur(1000, 'GBP'), 840);

  const rf = roofFit({ length: 12, width: 6, usablePct: 75, moduleWatts: 450, moduleArea: 2.0 });
  assert.ok(rf.maxPanels > 0);
  assert.ok(!rf.badgeLabel.includes('VERIFIED'), 'Roof badge must never claim structural verification');
});

test('C13: Interrupted payback distinguishes First Crossing (1.56 yr) from Sustained Payback (4.22 yr)', () => {
  // Audit Quantitative Test #5: Capex €1,400, annual cash flows +€900, with €2,400 replacement in Year 3 (net -€1,500 in Year 3)
  const upfront = 1400;
  const flows = [900, 900, -1500, 900, 900, 900];
  let cum = -upfront;
  const years = flows.map((cf, idx) => {
    cum += cf;
    return { year: idx + 1, cashflow: cf, cumulative: cum };
  });
  const pb = computePaybackMetrics(upfront, years, 'cumulative', 'cashflow');
  assert.equal(pb.firstPayback, 1.56);
  assert.equal(pb.sustainedPayback, 4.22);
  assert.equal(pb.interrupted, true);
  assert.equal(pb.sustainedYear, 5);

  const mirr = calculateMIRR(upfront, flows, 4, 4);
  assert.ok(Number.isFinite(mirr));
});

test('C15 & C19: CSV provenance headers and Worker rate limiter function', () => {
  const est = estimateMonthlyProduction(DEFAULTS);
  const fc = calculateForecast(est.monthlyKwh, DEFAULTS);
  const csv = asCSV(fc, { quality: 'benchmark-reference', verifiedProvider: false, dataset: est.dataset });
  assert.ok(csv.includes('# Data_Provenance_Mode: benchmark-reference'));
  assert.ok(csv.includes('# Verified_Provider_Data: NO'));

  const ip = '203.0.113.99';
  let last;
  for (let i = 0; i < 31; i++) last = checkRateLimit(ip, 1000);
  assert.equal(last.allowed, false);
});

import {
  decomposeUtilityBill,
  auditInstallerQuote
} from '../src/engine.js';
import {
  handleHealthProbe,
  verifyStripeWebhookSignature
} from '../_worker.js';

test('V71-01 (P0): Zero fixed annual charge is never treated as absent (1200 / 6500 = 0.184615/kWh, not 0.140/kWh)', () => {
  const res = decomposeUtilityBill({ annualBill: 1200, fixedAnnual: 0, annualUsage: 6500 });
  assert.equal(res.fixedAnnual, 0);
  assert.equal(res.avoidablePool, 1200);
  assert.ok(Math.abs(res.trueAvoidableRatePerKwh - (1200 / 6500)) < 1e-12);
  assert.equal(res.trueAvoidableRatePerKwh.toFixed(3), '0.185');
});

test('V71-02 (P0): Infeasible narrow roof (10m x 1.5m with 0.4m setback) returns 0 panels and 0 kWp', () => {
  const rf = roofFit({
    length: 10,
    width: 1.5,
    usablePct: 70,
    moduleWatts: 450,
    moduleArea: 2,
    moduleLengthM: 1.762,
    moduleWidthM: 1.134,
    setbackM: 0.4
  });
  assert.equal(rf.maxPanels, 0);
  assert.equal(rf.maxKwp, 0);
});

test('V71-05 (P1): /api/health/live returns 200 OK while /api/health/ready returns HTTP 503 when upstream canary fails', async () => {
  const liveRes = await handleHealthProbe('/api/health/live', new URL('https://example.com/api/health/live'));
  assert.equal(liveRes.status, 200);
  const liveJson = await liveRes.json();
  assert.equal(liveJson.ok, true);

  const failingFetcher = async () => ({ ok: false, status: 503 });
  const readyRes = await handleHealthProbe('/api/health/ready', new URL('https://example.com/api/health/ready'), failingFetcher);
  assert.equal(readyRes.status, 503);
  const readyJson = await readyRes.json();
  assert.equal(readyJson.ok, false);
  assert.equal(readyJson.pvgisCanary, 'failed');
});

test('V71-06 (P1): Installer Quote Auditor quantifies hidden omissions (scaffolding, SPD, grid permit, VAT) and questions', () => {
  const q = auditInstallerQuote({
    name: 'Incomplete Bid',
    kw: 6.0,
    pvCost: 7000,
    batteryKwh: 0,
    batteryCost: 0,
    includesScaffolding: false,
    includesElectricalSpd: false,
    includesGridPermit: false,
    vatIncluded: false,
    vatPct: 24,
    workmanshipWarrantyYrs: 2
  }, DEFAULTS);
  assert.ok(q.hiddenOmissions > 2000);
  assert.equal(q.omissionsList.length, 4);
  assert.ok(q.negotiationQuestions.length >= 4);
  assert.ok(q.downsideNpv < q.baseNpv && q.baseNpv < q.upsideNpv);
});

test('V71-08 (P1): Web Crypto HMAC-SHA256 Stripe Webhook verifier accepts valid signature and rejects tampered or expired payloads', async () => {
  const secret = 'whsec_test_secret_key_for_unit_verification';
  const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
  const t = 1763000000;
  const enc = new TextEncoder();
  const key = await (globalThis.crypto || (await import('node:crypto')).webcrypto).subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await (globalThis.crypto || (await import('node:crypto')).webcrypto).subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  const okCheck = await verifyStripeWebhookSignature(payload, `t=${t},v1=${hex}`, secret, t + 10);
  assert.equal(okCheck.valid, true);

  const badBody = await verifyStripeWebhookSignature(payload + 'x', `t=${t},v1=${hex}`, secret, t + 10);
  assert.equal(badBody.valid, false);

  const expired = await verifyStripeWebhookSignature(payload, `t=${t},v1=${hex}`, secret, t + 999);
  assert.equal(expired.valid, false);
});

test('V71-09 (P1): All 8 Policy Directory records cite official primary government or energy regulator domains', () => {
  const allowedDomains = ['deddie.gr', 'bundesnetzagentur.de', 'rijksoverheid.nl', 'idae.es', 'gse.it', 'ofgem.gov.uk', 'cpuc.ca.gov', 'cer.gov.au'];
  for (const pol of POLICY_DIRECTORY) {
    const u = new URL(pol.sourceUrl);
    assert.ok(allowedDomains.some(d => u.hostname.endsWith(d)), `Unexpected non-regulator domain ${u.hostname} for ${pol.id}`);
  }
});

test('V71-13 (P1): parseLoadCSV resamples 30-minute (17,520 rows) and 15-minute (35,040 rows) smart meter CSVs into 8,760 hours', () => {
  const rows30 = ['kwh'];
  for (let i = 0; i < 17520; i++) rows30.push('0.25');
  const parsed30 = parseLoadCSV(rows30.join('\n'));
  assert.equal(parsed30.hourlyKwh.length, 8760);
  assert.ok(Math.abs(parsed30.annualKwh - 4380) < 1e-6);

  const rows15 = ['kwh'];
  for (let i = 0; i < 35040; i++) rows15.push('0.125');
  const parsed15 = parseLoadCSV(rows15.join('\n'));
  assert.equal(parsed15.hourlyKwh.length, 8760);
  assert.ok(Math.abs(parsed15.annualKwh - 4380) < 1e-6);
});

import fs from 'node:fs';
import {
  ENGINE_VERSION,
  extractQuoteFieldsFromText,
  extractTextFromPdfBytes,
  generateDecisionReportPDF
} from '../src/engine.js';
import {
  SKU_CATALOG,
  issueSessionToken,
  verifySessionToken,
  handleCreateCheckout,
  handleStripeWebhookEvent,
  handleReportAccess,
  handleProjects,
  handleAuthSession,
  handleDocumentUpload,
  handleOrderLookup,
  handleGdprDelete
} from '../_worker.js';

test('P0-1: Hourly quote & size comparisons scale PV production by (newKw / baseKw) ONCE (8.0 / 5.5 = 1.454545, never 2.1157)', () => {
  const baseKw = 5.5;
  const baseHourlyPv = Array.from({ length: 8760 }, (_, i) => (i % 24 >= 9 && i % 24 <= 16 ? 4574.625 / (365 * 8) : 0));
  const load = Array.from({ length: 8760 }, () => 6500 / 8760);
  const baseInputs = { ...DEFAULTS, peakKw: baseKw, annualUsage: 6500 };

  const forecastFor = (inputs = baseInputs, yieldMultiplier = 1) => {
    const sizeRatio = inputs.peakKw / baseKw;
    const totalScale = sizeRatio * yieldMultiplier;
    const scaledPv = baseHourlyPv.map(v => v * totalScale);
    return hourlyForecast(scaledPv, load, inputs, 5, false);
  };

  const baseFc = forecastFor(baseInputs, 1.0);
  assert.ok(Math.abs(baseFc.years[0].generation - 4574.625) < 1e-3);

  const est = estimateMonthlyProduction(baseInputs);
  const sized = optimizeSizes(est.monthlyKwh, baseInputs, {
    sizes: [3.0, 5.5, 8.0, 10.0],
    evaluatorFn: (testInp, mult = 1) => forecastFor(testInp, mult)
  });

  const size8 = sized.find(s => s.kw === 8.0);
  const ratio8 = size8.annualKwh / baseFc.years[0].generation;
  assert.ok(Math.abs(ratio8 - (8.0 / 5.5)) < 1e-6, `Expected ratio 1.454545, got ${ratio8}`);
  assert.ok(Math.abs(size8.annualKwh - 6654.0) < 0.1, `Expected ~6654 kWh, got ${size8.annualKwh}`);

  const quote8 = auditInstallerQuote(
    { name: '8 kWp Quote', kw: 8.0, pvCost: 11345, batteryKwh: 0, batteryCost: 0 },
    baseInputs,
    (testInp, mult = 1) => forecastFor(testInp, mult)
  );
  assert.ok(Math.abs(quote8.baseFc.years[0].generation - size8.annualKwh) < 1e-6);
  assert.ok(Math.abs(quote8.baseNpv - size8.npv) < 1e-6);
});

test('P0-3: decomposeUtilityBill handles zero fixed fees, zero avoidable rate (fixed === gross), and rejects blank/negative/fixed>gross', () => {
  const zeroFixed = decomposeUtilityBill({ annualBill: 1200, fixedAnnual: 0, annualUsage: 6500 });
  assert.ok(Math.abs(zeroFixed.trueAvoidableRatePerKwh - (1200 / 6500)) < 1e-12);

  const allFixed = decomposeUtilityBill({ annualBill: 1200, fixedAnnual: 1200, annualUsage: 6500 });
  assert.equal(allFixed.trueAvoidableRatePerKwh, 0);

  assert.throws(() => decomposeUtilityBill({ annualBill: '', fixedAnnual: 0, annualUsage: 6500 }), /blank or null/);
  assert.throws(() => decomposeUtilityBill({ annualBill: 1200, fixedAnnual: -10, annualUsage: 6500 }), /negative/);
  assert.throws(() => decomposeUtilityBill({ annualBill: 1200, fixedAnnual: 1300, annualUsage: 6500 }), /cannot exceed/);
});

test('P0-1, P0-2, P0-4 & P0-5: Real Stripe API checkout, HMAC session auth, R2 PDF upload, non-owner 403 isolation, atomic retry & Charge (ch_...) refund reconciliation', async () => {
  const store = {
    customers: new Map(),
    projects: new Map(),
    analysis_runs: new Map(),
    orders: new Map(),
    stripe_events: new Map(),
    reports: new Map(),
    r2: new Map()
  };

  let failNextR2Put = false;
  const mockR2 = {
    async put(key, bytes, meta) {
      if (failNextR2Put) {
        failNextR2Put = false;
        throw new Error('Simulated transient R2 storage outage');
      }
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      store.r2.set(key, { bytes: u8, meta });
    },
    async get(key) {
      const item = store.r2.get(key);
      if (!item) return null;
      return {
        arrayBuffer: async () => item.bytes.buffer.slice(item.bytes.byteOffset, item.bytes.byteOffset + item.bytes.byteLength)
      };
    }
  };

  const mockDb = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.includes('INSERT OR IGNORE INTO customers')) {
                store.customers.set(args[0], { id: args[0], email: args[1] });
              } else if (sql.includes('INSERT OR IGNORE INTO projects') || sql.includes('INSERT OR REPLACE INTO projects')) {
                store.projects.set(args[0], { id: args[0], customer_id: args[1], jurisdiction: args[2], status: args[3], updated_at: args[4] });
              } else if (sql.includes('INSERT OR REPLACE INTO analysis_runs')) {
                store.analysis_runs.set(args[1], { id: args[0], project_id: args[1], engine_version: args[2], inputs_json: args[3], source_json: args[4], result_json: args[5], status: args[6] });
              } else if (sql.includes('INSERT INTO orders')) {
                store.orders.set(args[0], {
                  id: args[0],
                  customer_id: args[1],
                  project_id: args[2],
                  sku: args[3],
                  stripe_session_id: args[4],
                  payment_intent_id: args[5],
                  payment_status: args[6],
                  amount: args[7],
                  currency: args[8],
                  created_at: args[9]
                });
              } else if (sql.includes('UPDATE orders SET payment_status = ?1, payment_intent_id = ?2 WHERE id = ?3')) {
                const o = store.orders.get(args[2]);
                if (o) {
                  o.payment_status = args[0];
                  if (args[1]) o.payment_intent_id = args[1];
                }
              } else if (sql.includes('UPDATE orders SET payment_status = ?1, charge_id = ?2, refunded_at = ?3 WHERE id = ?4')) {
                const o = store.orders.get(args[3]);
                if (o) {
                  o.payment_status = args[0];
                  o.charge_id = args[1];
                  o.refunded_at = args[2];
                }
              } else if (sql.includes('INSERT OR REPLACE INTO reports')) {
                store.reports.set(args[2], {
                  id: args[0],
                  analysis_run_id: args[1],
                  order_id: args[2],
                  r2_key: args[3],
                  sha256_hash: args[4],
                  engine_version: args[5],
                  created_at: args[6],
                  access_status: args[7]
                });
              } else if (sql.includes('UPDATE reports SET access_status = ?1 WHERE order_id = ?2')) {
                const r = store.reports.get(args[1]);
                if (r) r.access_status = args[0];
              } else if (sql.includes('INSERT INTO stripe_events')) {
                store.stripe_events.set(args[0], { id: args[0], event_type: args[1], processed_at: args[2] });
              }
              return { success: true };
            },
            async first() {
              if (sql.includes('FROM stripe_events WHERE id = ?1')) return store.stripe_events.get(args[0]) || null;
              if (sql.includes('FROM projects WHERE id = ?1')) return store.projects.get(args[0]) || null;
              if (sql.includes('FROM analysis_runs WHERE project_id = ?1')) return store.analysis_runs.get(args[0]) || null;
              if (sql.includes('FROM orders WHERE stripe_session_id = ?1')) {
                for (const o of store.orders.values()) if (o.stripe_session_id === args[0]) return o;
                return null;
              }
              if (sql.includes('FROM orders WHERE payment_intent_id = ?1')) {
                for (const o of store.orders.values()) if (o.payment_intent_id === args[0]) return o;
                return null;
              }
              if (sql.includes('FROM orders WHERE id = ?1')) return store.orders.get(args[0]) || null;
              if (sql.includes('FROM reports WHERE order_id = ?1')) return store.reports.get(args[0]) || null;
              return null;
            }
          };
        }
      };
    }
  };

  const authSecret = 'aurora_test_hmac_auth_secret_2026_enterprise';
  const webhookSecret = 'whsec_live_test_secret_v74';
  const stripeKey = 'sk_test_51AuroraMockStripeKey';
  const env = { DB: mockDb, REPORTS_BUCKET: mockR2, AUTH_SECRET: authSecret, STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_SECRET_KEY: stripeKey };

  const tokenAlice = await issueSessionToken({ customerId: 'cus_alice', email: 'alice@example.com' }, authSecret);
  const tokenBob = await issueSessionToken({ customerId: 'cus_bob', email: 'bob@example.com' }, authSecret);

  // 1. Unauthenticated or forged Bearer token to /api/checkout or /api/projects is rejected with 401
  const unauthCheckout = await handleCreateCheckout(new Request('https://example.com/api/checkout', {
    method: 'POST',
    headers: { Authorization: 'Bearer fake_unverified_token' },
    body: JSON.stringify({ sku: 'report_comparison_3', projectId: 'prj_alice_1' })
  }), env);
  assert.equal(unauthCheckout.status, 401);

  // 2. Authenticated Alice creates a project snapshot and initiates Stripe Checkout
  let stripeApiCalled = false;
  const mockStripeFetcher = async (url, init) => {
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(init.method, 'POST');
    assert.ok(init.headers.Authorization.includes(stripeKey));
    assert.ok(init.body.includes('5900'));
    stripeApiCalled = true;
    return new Response(JSON.stringify({
      id: 'cs_test_a1b2c3d4e5f6',
      object: 'checkout.session',
      payment_intent: 'pi_real_stripe_999',
      url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const reqCheckout = new Request('https://example.com/api/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenAlice}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: 'report_comparison_3', projectId: 'prj_alice_1' })
  });
  const resCheckout = await handleCreateCheckout(reqCheckout, env, mockStripeFetcher);
  assert.equal(resCheckout.status, 201);
  assert.equal(resCheckout.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(stripeApiCalled, true);
  const checkoutData = await resCheckout.json();
  assert.equal(checkoutData.stripeSessionId, 'cs_test_a1b2c3d4e5f6');
  assert.equal(checkoutData.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6');

  // 3. Before webhook fulfillment, Alice cannot access report (403)
  const preAccess = await handleReportAccess(checkoutData.orderId, new Request('https://example.com/api/reports/' + checkoutData.orderId, {
    headers: { Authorization: `Bearer ${tokenAlice}` }
  }), env);
  assert.equal(preAccess.status, 403);

  // Helper to sign webhook payloads
  const signWebhook = async (payloadObj) => {
    const raw = JSON.stringify(payloadObj);
    const t = Math.floor(Date.now() / 1000);
    const subtle = (globalThis.crypto || (await import('node:crypto')).webcrypto).subtle;
    const key = await subtle.importKey('raw', new TextEncoder().encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`));
    const hex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return new Request('https://example.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': `t=${t},v1=${hex}` },
      body: raw
    });
  };

  // 4. Test atomic webhook safety: if R2 upload throws, stripe_events is NOT marked processed, so retry succeeds!
  const evtCompleted = {
    id: 'evt_complete_v74',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_a1b2c3d4e5f6', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_real_stripe_999' } }
  };
  // Trigger failed R2 call
  failNextR2Put = true;
  const reqFailWh = await signWebhook(evtCompleted);
  await assert.rejects(() => handleStripeWebhookEvent(reqFailWh, env), /Simulated transient R2 storage outage/);
  assert.equal(store.stripe_events.has('evt_complete_v74'), false, 'Failed webhook must not record event ID prematurely');

  // Now retry webhook with R2 healthy -> succeeds and uploads PDF to R2!
  const whRes1 = await handleStripeWebhookEvent(await signWebhook(evtCompleted), env);
  assert.equal(whRes1.status, 200);
  assert.equal(store.stripe_events.has('evt_complete_v74'), true);

  // 5. Security Gate: Anonymous caller gets 401, Bob (non-owner) gets 403, Alice (owner) gets 200 with private Cache-Control and binary PDF!
  const anonAccess = await handleReportAccess(checkoutData.orderId, new Request('https://example.com/api/reports/' + checkoutData.orderId), env);
  assert.equal(anonAccess.status, 401);
  assert.equal(anonAccess.headers.get('Cache-Control'), 'private, no-store');

  const bobAccess = await handleReportAccess(checkoutData.orderId, new Request('https://example.com/api/reports/' + checkoutData.orderId, {
    headers: { Authorization: `Bearer ${tokenBob}` }
  }), env);
  assert.equal(bobAccess.status, 403);

  const aliceMeta = await handleReportAccess(checkoutData.orderId, new Request('https://example.com/api/reports/' + checkoutData.orderId, {
    headers: { Authorization: `Bearer ${tokenAlice}` }
  }), env, false);
  assert.equal(aliceMeta.status, 200);
  assert.equal(aliceMeta.headers.get('Cache-Control'), 'private, no-store');
  const metaJson = await aliceMeta.json();
  assert.equal(metaJson.entitled, true);
  assert.equal(metaJson.r2Key, undefined, 'Internal R2 key must never be exposed in public/client JSON');

  const alicePdfRes = await handleReportAccess(checkoutData.orderId, new Request('https://example.com/api/reports/' + checkoutData.orderId + '/download', {
    headers: { Authorization: `Bearer ${tokenAlice}` }
  }), env, true);
  assert.equal(alicePdfRes.status, 200);
  assert.equal(alicePdfRes.headers.get('Content-Type'), 'application/pdf');
  const pdfText = new TextDecoder().decode(await alicePdfRes.arrayBuffer());
  assert.ok(pdfText.startsWith('%PDF-1.4'));

  // 6. Real Stripe charge.refunded webhook (where data.object is a Charge ch_... with payment_intent pi_real_stripe_999, NOT a Checkout Session!)
  const evtChargeRefunded = {
    id: 'evt_charge_refund_v74',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_3RealStripeChargeId',
        object: 'charge',
        payment_intent: 'pi_real_stripe_999',
        refunded: true,
        amount_refunded: 5900
      }
    }
  };
  const refundRes = await handleStripeWebhookEvent(await signWebhook(evtChargeRefunded), env);
  assert.equal(refundRes.status, 200);

  // Alice's report access is now revoked (403)
  const postRefundAccess = await handleReportAccess(checkoutData.orderId, new Request('https://example.com/api/reports/' + checkoutData.orderId, {
    headers: { Authorization: `Bearer ${tokenAlice}` }
  }), env, false);
  assert.equal(postRefundAccess.status, 403);
});

test('P0-6 & P0-7: Binary PDF report generation and PDF binary upload text extractor round-trip', () => {
  const extracted = extractQuoteFieldsFromText('Proposal: 6.5 kWp solar PV system, total price €8,200, with 10.2 kWh battery storage. Note: scaffolding excluded.');
  assert.ok(extracted.fields.some(f => f.key === 'peakKw' && f.value === 6.5));
  assert.ok(extracted.fields.some(f => f.key === 'pvCost' && f.value === 8200));
  assert.ok(extracted.fields.some(f => f.key === 'batteryKwh' && f.value === 10.2));
  assert.ok(extracted.fields.some(f => f.key === 'includesScaffolding' && f.value === false));

  const pdfBytes = generateDecisionReportPDF({
    location: 'Athens, Greece',
    provenanceLabel: 'Illustrative Reference',
    verifiedProvider: false,
    peakKw: '6.5',
    batteryKwh: '10.2',
    currency: 'EUR',
    sustainedPayback: '6.4 yrs',
    firstPayback: '6.4 yrs',
    npvText: 'EUR 6,420',
    irrText: '12.4%',
    mirrText: '8.9%',
    lcoeText: 'EUR 0.068/kWh',
    quotes: [{ name: 'Quote A', kw: '6.5', batteryKwh: '10.2', quotedText: 'EUR 8,200', omissionsText: '+EUR 650', effectiveText: 'EUR 8,850', downsideText: 'EUR 4,100', baseText: 'EUR 6,420', upsideText: 'EUR 8,900', paybackText: '6.4 yrs' }],
    questions: ['Confirm scaffolding inclusion in writing.'],
    milestoneYears: [{ year: 1, generation: 9800, selfUsed: 4410, exported: 5390, cashflowText: 'EUR 1,315', cumulativeText: '-EUR 7,535', discCumulativeText: '-EUR 7,584' }]
  });
  const parsedPdf = extractTextFromPdfBytes(pdfBytes);
  assert.ok(parsedPdf.documentHash.length === 8);
  assert.ok(parsedPdf.extractedText.includes('SOLARPAYBACK AURORA'));
  assert.ok(parsedPdf.extractedFields.fields.some(f => f.key === 'peakKw' && f.value === 6.5));
});

test('Version & Schema Alignment Gate: package.json, MANIFEST.json, engine.js, and _worker.js are all synchronized to 7.5.0 with zero dead tables', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(new URL('../MANIFEST.json', import.meta.url), 'utf8'));
  const workerSrc = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
  assert.equal(ENGINE_VERSION, '7.5.0');
  assert.equal(pkg.version, '7.5.0');
  assert.equal(manifest.version, '7.5.0');
  assert.ok(!workerSrc.includes('INTO project_versions'));
  assert.ok(!workerSrc.includes('INTO entitlements'));
});


test('P0-2, P0-7, P0-8 & GDPR Gate: /api/auth/session, /api/documents R2 upload, /api/orders/:id isolation, P0-8 synthetic rejection in paid runs, and DELETE /api/customer/data', async () => {
  const store = { customers: new Map(), projects: new Map(), documents: new Map(), quote_fields: [], analysis_runs: new Map(), orders: new Map(), r2: new Map() };
  const mockR2 = {
    async put(k, v) { store.r2.set(k, v); },
    async get(k) { return store.r2.get(k) || null; }
  };
  const mockDb = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.includes('INSERT OR IGNORE INTO customers')) store.customers.set(args[0], { id: args[0], email: args[1] });
              else if (sql.includes('INSERT OR REPLACE INTO projects')) store.projects.set(args[0], { id: args[0], customer_id: args[1], jurisdiction: args[2], status: args[3], updated_at: args[4] });
              else if (sql.includes('INSERT OR REPLACE INTO documents')) store.documents.set(args[0], { id: args[0], project_id: args[1], type: args[2], r2_key: args[3], hash: args[4] });
              else if (sql.includes('INSERT OR REPLACE INTO quote_fields')) store.quote_fields.push({ project_id: args[0], document_id: args[1], key: args[2], value: args[3] });
              else if (sql.includes('DELETE FROM customers WHERE id = ?1')) store.customers.delete(args[0]);
              else if (sql.includes('DELETE FROM projects WHERE customer_id = ?1')) {
                for (const [k, v] of store.projects) if (v.customer_id === args[0]) store.projects.delete(k);
              } else if (sql.includes('DELETE FROM orders WHERE customer_id = ?1')) {
                for (const [k, v] of store.orders) if (v.customer_id === args[0]) store.orders.delete(k);
              }
              return { success: true };
            },
            async first() {
              if (sql.includes('FROM projects WHERE id = ?1')) return store.projects.get(args[0]) || null;
              if (sql.includes('FROM orders WHERE id = ?1')) return store.orders.get(args[0]) || null;
              return null;
            }
          };
        }
      };
    }
  };

  const env = { DB: mockDb, REPORTS_BUCKET: mockR2, AUTH_SECRET: 'aurora_v75_super_secret_hmac_key_2026' };

  // 1. Issue session token via POST /api/auth/session
  const authRes = await handleAuthSession(new Request('https://example.com/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ email: 'owner@example.com' })
  }), env);
  assert.equal(authRes.status, 200);
  const authJson = await authRes.json();
  assert.ok(authJson.sessionToken);

  // 2. P0-8: Attempt to save a paidTier project with synthetic/demo provenance -> must be rejected with 422!
  const badPaidProj = await handleProjects(new Request('https://example.com/api/projects', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authJson.sessionToken}` },
    body: JSON.stringify({
      projectId: 'prj_synth_1',
      paidTier: true,
      provenance: { demoMode: true, quality: 'synthetic-demo', verifiedProvider: false }
    })
  }), env);
  assert.equal(badPaidProj.status, 422);

  // 3. Upload a quote document with extracted fields via POST /api/documents
  const docRes = await handleDocumentUpload(new Request('https://example.com/api/documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authJson.sessionToken}` },
    body: JSON.stringify({
      projectId: 'prj_owner_1',
      type: 'installer_quote',
      content: '6.5 kWp PV quote €8,200',
      fields: [{ key: 'peakKw', value: 6.5, unit: 'kWp', confidence: 'high', userConfirmed: true }]
    })
  }), env);
  assert.equal(docRes.status, 201);
  assert.equal(store.documents.size, 1);
  assert.equal(store.quote_fields.length, 1);

  // 4. GDPR Erasure via DELETE /api/customer/data removes customer records
  const delRes = await handleGdprDelete(new Request('https://example.com/api/customer/data', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authJson.sessionToken}` }
  }), env);
  assert.equal(delRes.status, 200);
  assert.equal(store.customers.size, 0);
});
