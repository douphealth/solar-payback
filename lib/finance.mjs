/**
 * Solar investment model. No network or DOM dependencies.
 * Monthly PVGIS kWh are used as the physical energy input; all monetary inputs
 * are user assumptions. Fixed fees, tax effects, financing and storage dispatch
 * are intentionally excluded and documented rather than silently estimated.
 */
export const DEFAULTS = Object.freeze({
  capacity: 5,
  annualDemand: 6000,
  selfUsePct: 55,
  buyPrice: 0.24,
  exportPrice: 0.06,
  costPerKw: 1450,
  grant: 0,
  opexPct: 1,
  degradationPct: 0.5,
  priceGrowthPct: 1.5,
  exportGrowthPct: 0,
  discountPct: 4,
  inverterYear: 12,
  inverterCost: 1000,
  years: 25,
});

const REQUIREMENTS = {
  capacity: [0.1, 1000], annualDemand: [0, 1e9], selfUsePct: [0, 100],
  buyPrice: [0, 10], exportPrice: [0, 10], costPerKw: [1, 1e7],
  grant: [0, 1e9], opexPct: [0, 25], degradationPct: [0, 10],
  priceGrowthPct: [-20, 30], exportGrowthPct: [-20, 30],
  discountPct: [0, 30], inverterYear: [0, 50],
  inverterCost: [0, 1e8], years: [1, 40],
};

function check(value, key, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${key} must be a finite number between ${min} and ${max}`);
  }
}

/** @returns 12 validated kWh values, Jan-Dec. */
export function validateMonthly(monthly) {
  if (!Array.isArray(monthly) || monthly.length !== 12) {
    throw new TypeError('Expected exactly twelve monthly solar production values');
  }
  return monthly.map((value, month) => {
    const kwh = Number(value);
    if (!Number.isFinite(kwh) || kwh < 0 || kwh > 1e10) {
      throw new RangeError(`Invalid PV production in month ${month + 1}`);
    }
    return kwh;
  });
}

export function normalizeInputs(inputs = {}) {
  const config = { ...DEFAULTS, ...inputs };
  for (const [key, range] of Object.entries(REQUIREMENTS)) {
    config[key] = Number(config[key]);
    check(config[key], key, ...range);
  }
  if (!Number.isInteger(config.years) || !Number.isInteger(config.inverterYear)) {
    throw new RangeError('years and inverterYear must be integers');
  }
  const gross = config.capacity * config.costPerKw;
  if (config.grant > gross) throw new RangeError('Grant cannot exceed installed cost');
  return config;
}

function monthlyFlows(monthly, annualDemand, selfUsePct) {
  const demandPerMonth = annualDemand / 12; // explicit flat-month demand approximation
  return monthly.map((generation) => {
    const consumed = Math.min(generation * selfUsePct / 100, demandPerMonth);
    return {
      generation,
      consumed,
      exported: Math.max(0, generation - consumed),
      imported: Math.max(0, demandPerMonth - consumed),
    };
  });
}

export function calculateFinance(monthlyInput, inputs = {}) {
  const monthly = validateMonthly(monthlyInput);
  const cfg = normalizeInputs(inputs);
  const grossCost = cfg.capacity * cfg.costPerKw;
  const netCost = grossCost - cfg.grant;
  const flows = [];
  let totalGenerated = 0;
  let lifetimeBenefit = 0;
  let lifetimeOpex = 0;
  let cumulative = -netCost;
  let discountedCumulative = -netCost;
  let simplePayback = netCost === 0 ? 0 : null;
  let discountedPayback = netCost === 0 ? 0 : null;
  let discountedProduction = 0;
  let discountedCosts = netCost;
  let totalDirect = 0;
  let totalExport = 0;

  for (let year = 1; year <= cfg.years; year++) {
    const factor = Math.pow(1 - cfg.degradationPct / 100, year - 1);
    const projected = monthly.map((kwh) => kwh * factor);
    const energy = monthlyFlows(projected, cfg.annualDemand, cfg.selfUsePct);
    const production = energy.reduce((n, m) => n + m.generation, 0);
    const consumed = energy.reduce((n, m) => n + m.consumed, 0);
    const exported = energy.reduce((n, m) => n + m.exported, 0);
    const imported = energy.reduce((n, m) => n + m.imported, 0);
    const retailPrice = cfg.buyPrice * Math.pow(1 + cfg.priceGrowthPct / 100, year - 1);
    const feedInPrice = cfg.exportPrice * Math.pow(1 + cfg.exportGrowthPct / 100, year - 1);
    const billSavings = consumed * retailPrice;
    const exportRevenue = exported * feedInPrice;
    const benefit = billSavings + exportRevenue;
    const maintenance = grossCost * cfg.opexPct / 100; // constant nominal EUR per year
    const replacement = cfg.inverterYear === year ? cfg.inverterCost : 0;
    const net = benefit - maintenance - replacement;
    const presentFactor = Math.pow(1 + cfg.discountPct / 100, year);
    const prev = cumulative;
    const prevDiscounted = discountedCumulative;
    cumulative += net;
    discountedCumulative += net / presentFactor;
    if (simplePayback === null && prev < 0 && cumulative >= 0 && net > 0) {
      simplePayback = year - 1 + (-prev / net);
    }
    if (discountedPayback === null && prevDiscounted < 0 && discountedCumulative >= 0 && net > 0) {
      discountedPayback = year - 1 + (-prevDiscounted / (net / presentFactor));
    }
    lifetimeBenefit += benefit;
    lifetimeOpex += maintenance + replacement;
    totalGenerated += production;
    discountedProduction += production / presentFactor;
    discountedCosts += (maintenance + replacement) / presentFactor;
    totalDirect += consumed;
    totalExport += exported;
    flows.push({ year, production, consumed, exported, imported, retailPrice, feedInPrice,
      billSavings, exportRevenue, benefit, maintenance, replacement, net,
      cumulative, discountedCumulative });
  }

  const first = flows[0];
  const totalNetBenefit = lifetimeBenefit - lifetimeOpex - netCost;
  return {
    config: cfg,
    monthly: monthlyFlows(monthly, cfg.annualDemand, cfg.selfUsePct),
    annualKwh: monthly.reduce((sum, kwh) => sum + kwh, 0),
    firstYear: first,
    grossCost,
    netCost,
    simplePayback,
    discountedPayback,
    npv: discountedCumulative,
    totalProfit: totalNetBenefit,
    lifetimeBenefit,
    lifetimeOpex,
    lifetimeEnergy: totalGenerated,
    lifetimeDirect: totalDirect,
    lifetimeExport: totalExport,
    roiPct: netCost > 0 ? totalNetBenefit / netCost * 100 : null,
    lcoe: discountedProduction > 0 ? discountedCosts / discountedProduction : null,
    directUseRatio: first.production > 0 ? first.consumed / first.production : 0,
    demandCoverage: cfg.annualDemand > 0 ? first.consumed / cfg.annualDemand : 0,
    flows,
  };
}

/** Deliberately labelled sensitivity tests, NOT probability intervals. */
export function calculateScenarios(monthly, inputs = {}) {
  const cfg = normalizeInputs(inputs);
  const settings = [
    { id: 'cautious', productionFactor: .90, priceFactor: .80 },
    { id: 'baseline', productionFactor: 1, priceFactor: 1 },
    { id: 'upside', productionFactor: 1.10, priceFactor: 1.20 },
  ];
  return settings.map(({ id, productionFactor, priceFactor }) => ({
    id,
    productionFactor,
    priceFactor,
    result: calculateFinance(monthly.map((v) => v * productionFactor), {
      ...cfg,
      buyPrice: cfg.buyPrice * priceFactor,
    }),
  }));
}

/** PVGIS output at one capacity is linearly scaled; not an installer quote. */
export function compareCapacities(monthly, inputs, capacities = [3, 4, 5, 6, 8, 10]) {
  const cfg = normalizeInputs(inputs);
  return capacities.map((capacity) => ({
    capacity,
    result: calculateFinance(monthly.map((v) => v * capacity / cfg.capacity), {
      ...cfg,
      capacity,
      grant: Math.min(cfg.grant, capacity * cfg.costPerKw),
    }),
  }));
}
