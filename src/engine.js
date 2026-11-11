/** Deterministic financial engine. No networking, browser state or hidden defaults. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Example inputs are explicitly hypothetical, NOT current energy prices or supplier quotations.
export const DEFAULTS = Object.freeze({
  lat: 37.9838, lon: 23.7275, location: 'Athens, Greece',
  peakKw: 5.5, slope: 30, aspect: 0, loss: 14, mounting: 'free',
  annualUsage: 6500, usageProfile: 'flat', selfUsePct: 45,
  importRate: 0.23, exportRate: 0.07, systemCost: 7800, grant: 0,
  annualMaintenance: 120, annualInsurance: 0, replacementYear: 12, replacementCost: 1100,
  degradationPct: 0.5, utilityEscalationPct: 2, exportEscalationPct: 0,
  expenseEscalationPct: 2, discountPct: 4, lifetime: 25, co2KgPerKwh: 0.38,
  currency: 'EUR'
});

const limits = {
  lat: [-90, 90], lon: [-180, 180], peakKw: [0.1, 1000], slope: [0, 90], aspect: [-180, 180], loss: [0, 50],
  annualUsage: [0, 10000000], selfUsePct: [0, 100], importRate: [0, 10], exportRate: [0, 10],
  systemCost: [0, 100000000], grant: [0, 100000000], annualMaintenance: [0, 10000000],
  annualInsurance: [0, 10000000], replacementYear: [0, 40], replacementCost: [0, 10000000],
  degradationPct: [0, 5], utilityEscalationPct: [-10, 30], exportEscalationPct: [-10, 30],
  expenseEscalationPct: [-10, 30], discountPct: [0, 30], lifetime: [1, 40], co2KgPerKwh: [0, 3]
};

const usageWeights = {
  flat: [1,1,1,1,1,1,1,1,1,1,1,1],
  summer: [.76,.76,.83,.91,1.03,1.31,1.48,1.45,1.16,.91,.72,.68],
  winter: [1.46,1.32,1.13,.86,.72,.68,.74,.78,.83,1,1.18,1.3]
};

export function validateInputs(value) {
  const input = { ...DEFAULTS, ...value };
  for (const [name, [min, max]] of Object.entries(limits)) {
    if (typeof input[name] !== 'number' || !Number.isFinite(input[name]) || input[name] < min || input[name] > max) {
      throw new RangeError(`${name} must be between ${min} and ${max}`);
    }
  }
  if (!Number.isInteger(input.lifetime) || !Number.isInteger(input.replacementYear)) throw new RangeError('Years must be whole numbers');
  if (input.grant > input.systemCost) throw new RangeError('Grant cannot exceed installation price');
  if (!usageWeights[input.usageProfile]) throw new RangeError('Invalid household demand profile');
  if (!['EUR','USD','GBP','AUD','CAD','INR'].includes(input.currency)) throw new RangeError('Unsupported currency');
  if (!['free','building'].includes(input.mounting)) throw new RangeError('Unsupported mounting type');
  return input;
}

export function getMonthlyUsage(annualUsage, profile = 'flat') {
  const weights = usageWeights[profile];
  if (!weights) throw new RangeError('Unknown usage profile');
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => annualUsage * w / sum);
}

/** A monthly grid-interaction approximation, not an hourly load simulation. */
export function calculateForecast(monthlyProduction, rawInputs, productionMultiplier = 1) {
  const input = validateInputs(rawInputs);
  if (!Array.isArray(monthlyProduction) || monthlyProduction.length !== 12 ||
    monthlyProduction.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e8)) {
    throw new RangeError('Expected 12 finite, non-negative monthly production values');
  }
  if (!Number.isFinite(productionMultiplier) || productionMultiplier <= 0 || productionMultiplier > 10) throw new RangeError('Invalid yield multiplier');
  const monthUsage = getMonthlyUsage(input.annualUsage, input.usageProfile);
  const upfront = input.systemCost - input.grant;
  let cumulative = -upfront;
  let discountedCumulative = -upfront;
  let npvBenefits = 0, npvCost = upfront, discountedGeneration = 0;
  let lifetimeGeneration = 0, lifetimeSelfUse = 0, lifetimeExports = 0, grossBenefit = 0;
  const years = [];
  for (let year = 1; year <= input.lifetime; year++) {
    const factor = productionMultiplier * Math.pow(1 - input.degradationPct / 100, year - 1);
    let generation = 0, selfUsed = 0, exported = 0;
    const perMonth = monthlyProduction.map((base, idx) => {
      const energy = base * factor;
      // The self-use assumption captures load/PV coincidence; monthly import demand is an additional hard cap.
      const own = Math.min(energy * input.selfUsePct / 100, monthUsage[idx]);
      const sentToGrid = Math.max(0, energy - own);
      generation += energy;
      selfUsed += own;
      exported += sentToGrid;
      return { month: idx + 1, generation: energy, selfUsed: own, exported: sentToGrid, usage: monthUsage[idx] };
    });
    const retailRate = input.importRate * Math.pow(1 + input.utilityEscalationPct / 100, year - 1);
    const gridRate = input.exportRate * Math.pow(1 + input.exportEscalationPct / 100, year - 1);
    const avoidedPurchases = selfUsed * retailRate;
    const exportRevenue = exported * gridRate;
    const annualOperatingCost = (input.annualMaintenance + input.annualInsurance) * Math.pow(1 + input.expenseEscalationPct / 100, year - 1);
    const replacement = input.replacementYear === year ? input.replacementCost : 0;
    const cashflow = avoidedPurchases + exportRevenue - annualOperatingCost - replacement;
    const discount = Math.pow(1 + input.discountPct / 100, year);
    const discountedCashflow = cashflow / discount;
    cumulative += cashflow;
    discountedCumulative += discountedCashflow;
    lifetimeGeneration += generation;
    lifetimeSelfUse += selfUsed;
    lifetimeExports += exported;
    grossBenefit += avoidedPurchases + exportRevenue;
    npvBenefits += (avoidedPurchases + exportRevenue) / discount;
    npvCost += (annualOperatingCost + replacement) / discount;
    discountedGeneration += generation / discount;
    years.push({ year, generation, selfUsed, exported, retailRate, gridRate, avoidedPurchases,
      exportRevenue, annualOperatingCost, replacement, cashflow, discountedCashflow,
      cumulative, discountedCumulative, perMonth });
  }
  // A single positive year before a costly inverter replacement is not a durable breakeven.
  // Use the first crossing after which the balance remains non-negative for the remaining horizon.
  const payback = sustainedPayback(years, upfront, 'cumulative', 'cashflow');
  const discountedPayback = sustainedPayback(years, upfront, 'discountedCumulative', 'discountedCashflow');
  const first = years[0];
  return {
    inputs: input, upfront,
    annualProduction: first.generation, annualSelfUsed: first.selfUsed, annualExported: first.exported,
    annualSavings: first.cashflow, firstYearAvoided: first.avoidedPurchases, firstYearExportRevenue: first.exportRevenue,
    firstYearGrossSavings: first.avoidedPurchases + first.exportRevenue,
    paybackYears: payback, discountedPaybackYears: discountedPayback,
    lifetimeGeneration, lifetimeSelfUse, lifetimeExports, lifetimeGrossBenefit: grossBenefit,
    lifetimeNetProfit: cumulative, lifetimeNetCashflow: cumulative + upfront,
    npv: npvBenefits - npvCost, lcoe: discountedGeneration > 0 ? npvCost / discountedGeneration : null,
    estimatedCo2Kg: lifetimeGeneration * input.co2KgPerKwh, years, months: first.perMonth,
    selfUseShare: first.generation > 0 ? first.selfUsed / first.generation : 0
  };
}

function sustainedPayback(years, upfront, balanceKey, flowKey) {
  if (upfront === 0) return 0;
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    if (year[balanceKey] < 0 || year[flowKey] <= 0) continue;
    if (!years.slice(i).every(later => later[balanceKey] >= 0)) continue;
    const previous = i === 0 ? -upfront : years[i - 1][balanceKey];
    if (previous < 0) return i + (-previous / year[flowKey]);
    // Previously positive then temporarily negative and recovered: report the actual recrossing.
    return i + 1;
  }
  return null;
}

export function asCSV(forecast) {
  const lines = ['year,production_kwh,self_consumed_kwh,exported_kwh,avoided_grid_cost,export_revenue,operating_cost,replacement_cost,net_cash_flow,cumulative_cash_flow,discounted_cumulative_cash_flow'];
  for (const y of forecast.years) {
    lines.push([y.year, y.generation, y.selfUsed, y.exported, y.avoidedPurchases, y.exportRevenue,
      y.annualOperatingCost, y.replacement, y.cashflow, y.cumulative, y.discountedCumulative]
      .map(v => Number(v.toFixed(4))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function solarSignature(input) {
  return ['lat','lon','peakKw','slope','aspect','loss','mounting'].map(key => String(input[key])).join('|');
}
