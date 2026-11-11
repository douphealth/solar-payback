import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinance, calculateScenarios, compareCapacities, validateMonthly, DEFAULTS } from '../lib/finance.mjs';

const solar = Array(12).fill(500); // precisely 6000 kWh in first year
const make = (overrides = {}) => calculateFinance(solar, { ...DEFAULTS, ...overrides });

test('energy cannot be consumed or sold more than produced', () => {
  const result = make({ annualDemand: 1200, selfUsePct: 100 });
  assert.equal(result.annualKwh, 6000);
  assert.equal(result.firstYear.consumed, 1200);
  assert.equal(result.firstYear.exported, 4800);
  assert.equal(result.firstYear.imported, 0);
  assert.ok(result.monthly.every((m) => m.consumed + m.exported === m.generation));
});

test('no demand means all production goes to export', () => {
  const result = make({ annualDemand: 0, selfUsePct: 90 });
  assert.equal(result.firstYear.consumed, 0);
  assert.equal(result.firstYear.exported, 6000);
});

test('year-one cash flow subtracts operating cost and year-of-replacement', () => {
  const result = make({ selfUsePct: 50, inverterYear: 1, inverterCost: 1000,
    opexPct: 1, costPerKw: 1000, buyPrice: .2, exportPrice: .05 });
  assert.equal(result.grossCost, 5000);
  assert.equal(result.firstYear.billSavings, 600);
  assert.equal(result.firstYear.exportRevenue, 150);
  assert.equal(result.firstYear.maintenance, 50);
  assert.equal(result.firstYear.net, -300);
  assert.equal(result.firstYear.cumulative, -5300);
});

test('discounted NPV and discounted payback do not exceed optimistic nominal figures', () => {
  const result = make({ exportPrice: .2, buyPrice: .3, costPerKw: 900 });
  assert.ok(result.discountedPayback >= result.simplePayback);
  assert.ok(result.npv < result.totalProfit);
});

test('zero grant, nonzero grant and free system are handled without divide by zero', () => {
  assert.ok(make({ grant: 0 }).netCost > 0);
  const free = make({ grant: 7250 });
  assert.equal(free.netCost, 0);
  assert.equal(free.simplePayback, 0);
  assert.equal(free.roiPct, null);
  assert.ok(Number.isFinite(free.npv));
});

test('negative net cashflow never reports a fictitious payback', () => {
  const result = make({ buyPrice: 0, exportPrice: 0, opexPct: 2 });
  assert.equal(result.simplePayback, null);
  assert.equal(result.discountedPayback, null);
  assert.ok(result.npv < 0);
});

test('scenarios and capacity comparisons are internally consistent', () => {
  const base = make();
  const scenarios = calculateScenarios(solar, DEFAULTS);
  assert.equal(scenarios.length, 3);
  assert.equal(scenarios[1].result.npv, base.npv);
  assert.ok(scenarios[0].result.npv <= base.npv);
  assert.ok(scenarios[2].result.npv >= base.npv);
  const sizes = compareCapacities(solar, DEFAULTS);
  const same = sizes.find((x) => x.capacity === 5);
  assert.equal(same.result.annualKwh, 6000);
  assert.equal(same.result.netCost, base.netCost);
});

test('invalid and impossible inputs cannot silently alter recommendations', () => {
  assert.throws(() => validateMonthly([500, 100]), /twelve/);
  assert.throws(() => make({ selfUsePct: 125 }), /selfUsePct/);
  assert.throws(() => make({ grant: 100000 }), /Grant/);
  assert.throws(() => make({ buyPrice: Infinity }), /buyPrice/);
  assert.throws(() => make({ years: 2.5 }), /integers/);
});
