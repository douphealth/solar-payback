import { calculateForecast, calculateIRR, calculateMIRR, computePaybackMetrics, validateInputs } from './engine.js';

export function projectFinance(forecast, { loanShare = 0, loanApr = 5, loanYears = 10 } = {}) {
  const share = Number(loanShare), apr = Number(loanApr), term = Number(loanYears);
  if (!Number.isFinite(share) || share < 0 || share > 100 || !Number.isFinite(apr) || apr < 0 || apr > 35 || !Number.isInteger(term) || term < 1 || term > 40) {
    throw new RangeError('Invalid financing terms');
  }
  if (term > forecast.inputs.lifetime && share > 0) {
    throw new RangeError('Loan term must not exceed modeled project lifetime');
  }
  const debt = (forecast.upfront * share) / 100;
  const equity = forecast.upfront - debt;
  const paymentsPerYear = 12;
  const r = apr / 100 / paymentsPerYear;
  const months = term * paymentsPerYear;
  const monthlyDebt = debt <= 0 ? 0 : (r === 0 ? debt / months : (debt * r) / (1 - Math.pow(1 + r, -months)));
  const annualDebt = monthlyDebt * paymentsPerYear;
  let cumulative = -equity;
  let discountedCumulative = -equity;
  let npv = -equity;

  const years = forecast.years.map((row, i) => {
    const debtService = i < term ? annualDebt : 0;
    const equityCash = row.cashflow - debtService;
    const discount = 1 / Math.pow(1 + forecast.inputs.discountPct / 100, i + 1);
    cumulative += equityCash;
    discountedCumulative += equityCash * discount;
    npv += equityCash * discount;
    return {
      ...row,
      debtService,
      equityCash,
      equityCumulative: cumulative,
      equityDiscountedCumulative: discountedCumulative
    };
  });

  const pb = computePaybackMetrics(equity, years, 'equityCumulative', 'equityCash');
  const eqCfs = years.map(x => x.equityCash);
  return {
    debt,
    equity,
    monthlyDebt,
    annualDebt,
    loanYears: term,
    loanApr: apr,
    npv,
    cumulative,
    payback: pb.sustainedPayback,
    firstPayback: pb.firstPayback,
    sustainedPayback: pb.sustainedPayback,
    paybackInterrupted: pb.interrupted,
    irr: calculateIRR(equity, eqCfs),
    mirr: calculateMIRR(equity, eqCfs, forecast.inputs.discountPct, forecast.inputs.discountPct),
    years
  };
}

/**
 * C12: 2D Row-by-Column Roof Geometry with Perimeter Setbacks.
 * Never claims structural or physical verification; always labels output as a preliminary area/perimeter estimate.
 */
export function roofFit({ length = 10, width = 6, usablePct = 70, moduleWatts = 450, moduleArea = 2.0, moduleLengthM = 1.762, moduleWidthM = 1.134, setbackM = 0.4 } = {}) {
  const nums = [length, width, usablePct, moduleWatts, moduleArea];
  if (nums.some(x => !Number.isFinite(Number(x))) || length <= 0 || width <= 0 || length > 200 || width > 200 || usablePct < 20 || usablePct > 95 || moduleWatts < 200 || moduleWatts > 800 || moduleArea < 1 || moduleArea > 4) {
    throw new RangeError('Invalid roof inputs');
  }
  const totalSqm = Number(length) * Number(width);
  const availableSqm = (totalSqm * Number(usablePct)) / 100;
  const areaBoundPanels = Math.floor(availableSqm / Number(moduleArea));

  // 2D row/column packing inside fire/wind perimeter setback
  const netL = Math.max(0, Number(length) - 2 * Number(setbackM));
  const netW = Math.max(0, Number(width) - 2 * Number(setbackM));
  const portraitCols = Math.floor(netL / moduleWidthM);
  const portraitRows = Math.floor(netW / moduleLengthM);
  const portraitMax = portraitCols * portraitRows;

  const landscapeCols = Math.floor(netL / moduleLengthM);
  const landscapeRows = Math.floor(netW / moduleWidthM);
  const landscapeMax = landscapeCols * landscapeRows;

  const geometricMax = Math.max(portraitMax, landscapeMax);
  const orientation = portraitMax >= landscapeMax ? 'Portrait' : 'Landscape';
  const rows = portraitMax >= landscapeMax ? portraitRows : landscapeRows;
  const cols = portraitMax >= landscapeMax ? portraitCols : landscapeCols;
  const panels = geometricMax <= 0 ? 0 : Math.min(areaBoundPanels, Math.floor(geometricMax * (Number(usablePct) / 100)));

  return {
    availableSqm,
    maxPanels: panels,
    maxKwp: (panels * Number(moduleWatts)) / 1000,
    totalSqm,
    moduleArea: Number(moduleArea),
    orientation,
    rows,
    cols,
    setbackM: Number(setbackM),
    badgeLabel: 'PRELIMINARY AREA & SETBACK ESTIMATE (SURVEY REQUIRED)'
  };
}

/**
 * C05: Array Sizer accepts the active scenario evaluatorFn so hourly and monthly modes stay 100% consistent.
 */
export function optimizeSizes(monthly, current, { sizes = [3, 4, 5, 6, 7, 8, 10, 12], evaluatorFn = null } = {}) {
  const input = validateInputs(current);
  if (!Array.isArray(sizes) || sizes.length === 0 || sizes.length > 40) throw new RangeError('Invalid options');
  const unitCost = input.systemCost / Math.max(0.1, input.peakKw);
  return sizes
    .filter(kw => Number.isFinite(kw) && kw >= 0.1 && kw <= 1000)
    .map(kw => {
      const ratio = kw / input.peakKw;
      const test = {
        ...input,
        peakKw: kw,
        systemCost: Math.round(unitCost * kw),
        grant: Math.min(input.grant, Math.round(unitCost * kw) + input.batteryCost)
      };
      // P0-1 Fix: evaluatorFn scales production from test.peakKw / basePeakKw automatically; pass yieldMultiplier = 1.0 (never ratio twice!)
      const result = evaluatorFn ? evaluatorFn(test, 1.0) : calculateForecast(monthly.map(v => v * ratio), test, 1.0);
      return {
        kw,
        systemCost: test.systemCost,
        npv: result.npv,
        payback: result.exactSimplePayback,
        firstPayback: result.firstSimplePayback,
        sustainedPayback: result.sustainedSimplePayback,
        independence: result.independencePct,
        annualKwh: result.years[0].generation,
        selfUse: result.selfUseSharePct
      };
    })
    .sort((a, b) => b.npv - a.npv);
}

export function dailyDispatch(forecast, { month = 5, pattern = 'home', shift = false } = {}) {
  if (!Number.isInteger(month) || month < 0 || month > 11 || !['home', 'day', 'business'].includes(pattern)) {
    throw new RangeError('Invalid daily pattern');
  }
  const d = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
  const m = forecast.year1Monthly[month];
  const solarKwh = m.generation / d, loadKwh = m.usage / d;
  const lat = forecast.inputs.lat;
  const day = 16 - (4 * Math.abs(lat)) / 90 + 2.3 * Math.sin(((month + 1 - 3) * Math.PI) / 6) * (lat >= 0 ? 1 : -1);
  const sunrise = 12 - Math.max(7, Math.min(16, day)) / 2, sunset = 12 + Math.max(7, Math.min(16, day)) / 2;
  const solarWeights = Array.from({ length: 24 }, (_, h) => Math.max(0, Math.sin((Math.PI * (h + 0.5 - sunrise)) / (sunset - sunrise))) ** 1.6);
  const ws = solarWeights.reduce((a, b) => a + b, 0);
  const solar = solarWeights.map(w => (w / ws) * solarKwh);
  const loadWeights = Array.from({ length: 24 }, (_, h) => {
    let w = pattern === 'business'
      ? (h >= 8 && h < 18 ? 1.6 : 0.22)
      : pattern === 'day'
        ? (h >= 9 && h < 18 ? 1.1 : 0.72)
        : 0.48 + 1.1 * Math.exp(-(((h - 20) / 3) ** 2)) + 0.65 * Math.exp(-(((h - 7) / 2) ** 2));
    if (shift && h >= 10 && h <= 15) w += 0.55;
    if (shift && h >= 18 && h <= 22) w = Math.max(0.17, w - 0.35);
    return w;
  });
  const wl = loadWeights.reduce((a, b) => a + b, 0), load = loadWeights.map(w => (w / wl) * loadKwh);
  const batteryCapacity = forecast.inputs.batteryKwh * 0.88;
  const eff = Math.sqrt(forecast.inputs.batteryEfficiencyPct / 100);
  let soc = 0, self = 0, exports = 0, imports = 0, battDelivered = 0;
  const hours = solar.map((pv, h) => {
    const demand = load[h], direct = Math.min(pv, demand);
    let surplus = pv - direct, shortage = demand - direct;
    if (batteryCapacity > 0 && surplus > 0) {
      const charge = Math.min(surplus, (batteryCapacity - soc) / eff);
      soc += charge * eff;
      surplus -= charge;
    }
    if (batteryCapacity > 0 && shortage > 0) {
      const discharge = Math.min(shortage, soc * eff);
      soc -= discharge / eff;
      shortage -= discharge;
      battDelivered += discharge;
    }
    self += direct;
    exports += surplus;
    imports += shortage;
    return { h, pv, demand, direct, exports: surplus, imports: shortage, soc };
  });
  return {
    hours,
    solarKwh,
    loadKwh,
    selfUsed: self + battDelivered,
    gridExport: exports,
    gridImport: imports,
    batteryShifted: battDelivered,
    source: 'Synthetic representative day — not measured hourly generation or load'
  };
}

/**
 * C01, C02, C06, C13: Strict Assumption & Provenance Auditor.
 * Only genuine 'pvgis' or 'pvgis-hourly' (with demo === false) is treated as a verified solar provider.
 */
export function scoreAssumptions(forecast, sourceType, { demo = false, hwWarnings = [] } = {}) {
  const flags = [];
  if (demo || sourceType === 'synthetic-demo' || forecast.demo) {
    flags.push('SYNTHETIC DEMO MODE ACTIVE: Both solar generation and load traces are synthetic illustrations, not measured or PVGIS-verified data.');
  } else if (sourceType !== 'pvgis' && sourceType !== 'pvgis-hourly') {
    flags.push(`Solar yield uses an unverified reference model (${sourceType || 'illustrative'}), not a live validated EU JRC PVGIS provider response.`);
  }
  if (forecast.mode === 'monthly-preliminary') {
    flags.push('Preliminary Monthly Mode: Self-consumption and battery economics are monthly approximations. Import a UTC-aligned 8,760-hour meter CSV for decision-grade interval dispatch.');
  }
  if (forecast.paybackInterrupted) {
    flags.push(`Interrupted Payback Warning: Cumulative cash flow first turns positive at ${forecast.firstSimplePayback} yrs, but dips negative during replacement capex before achieving sustained payback at ${forecast.sustainedSimplePayback ?? 'N/A'} yrs.`);
  }
  if (forecast.signChanges > 1) {
    flags.push(`Non-monotonic cash flows (${forecast.signChanges} sign changes due to mid-life replacement); evaluate MIRR (${forecast.mirrPct ?? '--'}%) alongside IRR.`);
  }
  if (forecast.inputs.selfUsePct > 65 && forecast.mode === 'monthly-preliminary') {
    flags.push('High direct self-consumption (>65%) assumed without interval meter verification.');
  }
  if (forecast.inputs.batteryKwh > 0 && forecast.mode === 'monthly-preliminary') {
    flags.push('Battery storage sized in monthly mode: confirm inverter charge/discharge kW, TOU tariff spread, and 8,760h load overlap before purchasing.');
  }
  if (forecast.inputs.grant > 0) {
    flags.push('Upfront grant/subsidy included; confirm program eligibility and whether incentive is a multi-year tax deduction vs upfront rebate.');
  }
  if (forecast.inputs.exportRate > forecast.inputs.importRate) {
    flags.push('Export rate exceeds avoided retail import rate; verify utility net-billing contract terms.');
  }
  for (const w of hwWarnings) flags.push(w);
  return flags;
}
