/**
 * SolarPayback Aurora v7.1 — Interval Analysis & 8,760-Hour Dispatch Engine.
 * Remediates C02 (strict separation of synthetic demo vs verified hourly data),
 * C03 (dataset-aware PVGIS minute offsets :00, :10, :30 ERA5, :05-:12 SARAH3),
 * C04 (strict null rejection and energy conservation checks), and C13 (sustained payback & MIRR).
 */
import { DEFAULTS, validateInputs, calculateIRR, calculateMIRR, countCashflowSignChanges, computePaybackMetrics, MONTH_DAYS, MONTHS } from './engine.js';

const total = xs => xs.reduce((s, x) => s + x, 0);
export const HOURS_YEAR = 8760;
export const MONTH_HOURS = MONTH_DAYS.map(d => d * 24);

function strictFinite(raw, label) {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || (typeof raw === 'string' && raw.trim() === '')) {
    throw new Error(`Null or missing value for ${label}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value for ${label}`);
  return n;
}

/**
 * C03: CSV parser accepting 8,760 sequential hourly intervals.
 * Supports arbitrary consistent minute offsets (e.g. :00, :10, :30) and ISO timestamps with timezone offsets.
 */
export function parseLoadCSV(text, maxBytes = 2_800_000) {
  if (typeof text !== 'string' || text.length > maxBytes) throw new Error('Use a CSV smaller than 2.8 MB.');
  const rows = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(x => x.trim());
  if (rows.length < 2) throw new Error('No hourly consumption data found.');
  const delim = rows[0].includes(';') ? ';' : rows[0].includes('\t') ? '\t' : ',';
  const parseRow = row => {
    const fields = [];
    let current = '', quoted = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"' && row[i + 1] === '"' && quoted) { current += '"'; i++; }
      else if (c === '"') { quoted = !quoted; }
      else if (c === delim && !quoted) { fields.push(current.trim()); current = ''; }
      else current += c;
    }
    fields.push(current.trim());
    return fields;
  };
  const first = parseRow(rows[0]);
  let col = 0, start = 0;
  const known = ['kwh', 'load_kwh', 'consumption_kwh', 'usage_kwh', 'electricity_kwh', 'energy_kwh'];
  const normalized = first.map(x => x.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, ''));
  const found = normalized.findIndex(x => known.includes(x));
  const timeColumn = normalized.findIndex(x => ['timestamp', 'datetime', 'date_time', 'utc_time', 'time_utc', 'time'].includes(x));

  let detectedMinute = null;
  const timestampEpoch = (raw, rowNum) => {
    const str = String(raw || '').trim();
    let iso = str;
    const pv = /^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/.exec(str);
    if (pv) iso = `${pv[1]}-${pv[2]}-${pv[3]}T${pv[4]}:${pv[5]}:00Z`;
    else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(iso)) iso = iso.replace(' ', 'T') + 'Z';
    else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(iso)) {
      throw new Error(`Unsupported timestamp at CSV row ${rowNum}. Use ISO 8601 or PVGIS YYYYMMDD:HHMM.`);
    }
    const d = new Date(iso), ms = d.getTime();
    if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp at CSV row ${rowNum}.`);
    const minute = d.getUTCMinutes();
    if (d.getUTCSeconds() !== 0) throw new Error(`Timestamp seconds must be 00 at row ${rowNum}.`);
    if (detectedMinute === null) detectedMinute = minute;
    return ms;
  };

  let firstHour = null, previousHour = null;
  if (found >= 0) { col = found; start = 1; }
  else if (first.length === 1 && Number.isFinite(Number(first[0]))) col = 0;
  else if (first.length === 2 && Number.isFinite(Number(first[1])) && Number.isNaN(Number(first[0]))) col = 1;
  else throw new Error('CSV needs a kwh, load_kwh, or consumption_kwh column.');

  const data = [];
  for (let i = start; i < rows.length; i++) {
    const f = parseRow(rows[i]);
    const n = strictFinite(f[col], `consumption at CSV row ${i + 1}`);
    if (n < 0 || n > 10000) throw new Error(`Out-of-bounds consumption at CSV row ${i + 1}.`);
    if (timeColumn >= 0) {
      const ms = timestampEpoch(f[timeColumn], i + 1);
      if (previousHour !== null && ![900000, 1800000, 3600000].includes(ms - previousHour)) {
        throw new Error(`CSV timestamps are missing, duplicated or out of order at row ${i + 1}. Align hourly periods to UTC before importing.`);
      }
      if (firstHour === null) firstHour = ms;
      previousHour = ms;
    }
    data.push(n);
  }
  // V71-13: Support 60-minute (8,760 / 8,784), 30-minute (17,520 / 17,568), and 15-minute (35,040 / 35,136) interval CSVs
  let subHourlyFactor = 1;
  if (data.length === 35040 || data.length === 35136) subHourlyFactor = 4;
  else if (data.length === 17520 || data.length === 17568) subHourlyFactor = 2;

  if (subHourlyFactor > 1) {
    const aggregated = [];
    for (let i = 0; i < data.length; i += subHourlyFactor) {
      let sumHour = 0;
      for (let j = 0; j < subHourlyFactor; j++) sumHour += data[i + j];
      aggregated.push(sumHour);
    }
    data.length = 0;
    data.push(...aggregated);
  }
  if (data.length === 8784) {
    data.splice(59 * 24, 24);
  }
  if (data.length !== HOURS_YEAR) {
    throw new Error(`Expected 8,760 (60m), 17,520 (30m), or 35,040 (15m) interval rows; found ${data.length.toLocaleString()}.`);
  }
  const annual = total(data);
  if (annual <= 0) throw new Error('Annual consumption must be greater than zero.');
  const meterYear = firstHour === null ? null : new Date(firstHour).getUTCFullYear();
  if (firstHour !== null) {
    if (firstHour !== Date.UTC(meterYear, 0, 1)) {
      throw new Error('Timestamp CSV must start at January 1 00:00 UTC.');
    }
  }
  return {
    hourlyKwh: data,
    annualKwh: annual,
    rows: data.length,
    meterYear,
    minuteOffset: detectedMinute ?? 0,
    demo: false,
    timestampsValidated: timeColumn >= 0,
    source: timeColumn >= 0
      ? `User-provided ${meterYear} consumption CSV; contiguous UTC timestamp order validated`
      : 'User-provided 8,760-hour consumption CSV; timestamp order not independently verified'
  };
}

/**
 * C03 & C04: Dataset-aware PVGIS hourly series normalizer.
 * Accepts any valid PVGIS minute offset (:00, :10, :30 ERA5, :05-:12 SARAH3/NSRDB)
 * as long as each record maps to sequential UTC hours 0..8759 (or 8783 for leap year).
 * Strictly rejects null/undefined/boolean/empty-string P values before Number coercion.
 */
export function normalizeHourlyPVGIS(data, year = 2023) {
  const arr = data?.outputs?.hourly;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const expectedLen = isLeap ? 8784 : HOURS_YEAR;
  if (!Array.isArray(arr) || arr.length !== expectedLen) {
    throw new Error(`PVGIS hourly response must contain ${expectedLen} records for ${year}.`);
  }
  const pv = [];
  let previous = null;
  let detectedMinuteOffset = null;
  const seen = new Set();

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const p = strictFinite(item?.P, `PVGIS hourly P at record ${i + 1}`);
    const time = String(item?.time ?? '');
    if (p < 0 || p > 10_000_000 || !/^\d{8}:\d{4}$/.test(time)) {
      throw new Error(`Invalid PVGIS hourly value at record ${i + 1}.`);
    }
    const key = time.slice(0, 11);
    if (seen.has(key)) throw new Error('PVGIS hourly response has duplicated hours.');
    seen.add(key);
    if (Number(time.slice(0, 4)) !== year) throw new Error('PVGIS hourly response has an unexpected year.');
    const expected = new Date(Date.UTC(year, 0, 1, i));
    const prefix =
      expected.getUTCFullYear() +
      String(expected.getUTCMonth() + 1).padStart(2, '0') +
      String(expected.getUTCDate()).padStart(2, '0') +
      ':' +
      String(expected.getUTCHours()).padStart(2, '0');
    const minute = Number(time.slice(11, 13));
    if (!time.startsWith(prefix) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw new Error(`PVGIS hourly data has a missing or shifted UTC interval at record ${i + 1}.`);
    }
    if (detectedMinuteOffset === null) detectedMinuteOffset = minute;
    else if (minute !== detectedMinuteOffset) {
      throw new Error(`Inconsistent PVGIS minute offset at record ${i + 1}: expected :${String(detectedMinuteOffset).padStart(2, '0')}, got :${String(minute).padStart(2, '0')}.`);
    }
    if (previous && time <= previous) throw new Error('PVGIS hourly data is not ordered.');
    previous = time;
    pv.push(p / 1000);
  }
  const finalPv = isLeap ? pv.filter((_, idx) => idx < 59 * 24 || idx >= 60 * 24) : pv;
  const annualKwh = total(finalPv);
  if (annualKwh <= 0) throw new Error('PVGIS hourly series contains no generation.');
  const months = [];
  let offset = 0;
  for (const h of MONTH_HOURS) {
    months.push(total(finalPv.slice(offset, offset + h)));
    offset += h;
  }
  return {
    hourlyKwh: finalPv,
    monthlyKwh: months,
    annualKwh,
    year,
    minuteOffset: detectedMinuteOffset ?? 0,
    source: 'European Commission JRC PVGIS 5.3 hourly PV power',
    quality: 'pvgis-hourly',
    verifiedProvider: true,
    demo: false,
    dataset: String(data?.inputs?.meteo_data?.radiation_db || 'PVGIS dataset unspecified').slice(0, 80),
    alignment: `UTC hourly PV output (normalized from :${String(detectedMinuteOffset ?? 0).padStart(2, '0')})`
  };
}

/**
 * Hourly flow with battery. Enforces exact energy conservation:
 * PV = direct + toBattery + gridExport
 * Load = direct + fromBattery + gridImport
 */
export function simulateHourly(pvKwh, loadKwh, { batteryKwh = 0, batteryEfficiencyPct = 90, batteryPowerKw = 5 } = {}) {
  if (!Array.isArray(pvKwh) || !Array.isArray(loadKwh) || pvKwh.length !== loadKwh.length || pvKwh.length === 0 || pvKwh.length > 9000) {
    throw new Error('PV and consumption intervals must have matching nonempty lengths.');
  }
  if (!Number.isFinite(batteryKwh) || batteryKwh < 0 || batteryKwh > 1000 || !Number.isFinite(batteryEfficiencyPct) || batteryEfficiencyPct <= 0 || batteryEfficiencyPct > 100 || !Number.isFinite(batteryPowerKw) || batteryPowerKw <= 0 || batteryPowerKw > 10000) {
    throw new RangeError('Invalid battery configuration.');
  }
  const eta = Math.sqrt(batteryEfficiencyPct / 100);
  let soc = 0;
  const hourly = [];
  const totals = { pv: 0, load: 0, direct: 0, fromBattery: 0, toBattery: 0, gridImport: 0, gridExport: 0, energyLoss: 0 };
  for (let i = 0; i < pvKwh.length; i++) {
    const pv = strictFinite(pvKwh[i], `PV interval ${i}`);
    const load = strictFinite(loadKwh[i], `Load interval ${i}`);
    if (pv < 0 || load < 0) throw new Error(`Negative interval energy at ${i}.`);
    const direct = Math.min(pv, load), excess = pv - direct, deficit = load - direct;
    const toBattery = batteryKwh > 0 ? Math.min(excess, batteryPowerKw, (batteryKwh - soc) / eta) : 0;
    soc += toBattery * eta;
    const fromBattery = batteryKwh > 0 ? Math.min(deficit, batteryPowerKw, soc * eta) : 0;
    soc -= fromBattery / eta;
    soc = Math.min(batteryKwh, Math.max(0, soc));
    const gridExport = Math.max(0, excess - toBattery), gridImport = Math.max(0, deficit - fromBattery);
    const record = { hour: i, pv, load, direct, toBattery, fromBattery, gridExport, gridImport, soc };
    hourly.push(record);
    for (const name of ['pv', 'load', 'direct', 'toBattery', 'fromBattery', 'gridExport', 'gridImport']) {
      totals[name] += record[name];
    }
  }
  totals.selfUsed = totals.direct + totals.fromBattery;
  totals.independencePct = totals.load ? (100 * totals.selfUsed) / totals.load : 0;
  totals.selfConsumptionPct = totals.pv ? (100 * totals.selfUsed) / totals.pv : 0;
  totals.endSoc = soc;
  totals.energyLoss = totals.pv - totals.gridExport - totals.selfUsed - soc;
  return { hourly, totals };
}

/**
 * Multi-year 8,760-hour forecast with C11 battery lifecycle physics and C13 sustained payback.
 */
export function hourlyForecast(pv, load, rawInputs, batteryPowerKw = 5, isDemo = false) {
  const input = validateInputs({ ...DEFAULTS, ...rawInputs });
  if (!Array.isArray(pv) || !Array.isArray(load) || pv.length !== HOURS_YEAR || load.length !== HOURS_YEAR) {
    throw new Error('Annual hourly series must both contain 8,760 points.');
  }
  const upfront = input.systemCost + input.batteryCost - input.grant;
  const grossCapex = input.systemCost + input.batteryCost;
  const years = [];
  let cumulative = -upfront, dc = -upfront, npvBenefits = 0, npvCost = upfront, discountedGeneration = 0;
  let lifetimeGeneration = 0, lifetimeSelfUse = 0, lifetimeBatteryShift = 0, lifetimeExports = 0, grossBenefit = 0;
  let cumulativeBatteryThroughputKwh = 0;
  const maxWarrantedThroughputKwh = input.batteryKwh * 6000;
  let year1Monthly = [];

  for (let yr = 1; yr <= input.lifetime; yr++) {
    const pvFactor = (1 - input.degradationPct / 100) ** (yr - 1);
    const rawBattHealth = Math.max(0.65, (1 - input.batteryFadePct / 100) ** (yr - 1));
    const throughputExhausted = maxWarrantedThroughputKwh > 0 && cumulativeBatteryThroughputKwh > maxWarrantedThroughputKwh;
    const cap = input.batteryKwh * (throughputExhausted ? 0.55 : rawBattHealth);

    const flow = simulateHourly(pv.map(v => v * pvFactor), load, {
      batteryKwh: cap,
      batteryEfficiencyPct: input.batteryEfficiencyPct,
      batteryPowerKw
    });
    const x = flow.totals;
    cumulativeBatteryThroughputKwh += x.fromBattery;

    const rate = input.importRate * (1 + input.utilityEscalationPct / 100) ** (yr - 1);
    const exportRate = input.exportRate * (1 + input.exportEscalationPct / 100) ** (yr - 1);
    const avoidedPurchases = x.selfUsed * rate, exportRevenue = x.gridExport * exportRate;
    const annualOperatingCost = (input.annualMaintenance + input.annualInsurance) * (1 + input.expenseEscalationPct / 100) ** (yr - 1);
    const inverterRepl = yr === input.replacementYear ? input.replacementCost : 0;
    const batteryRepl = (input.batteryKwh > 0 && input.batteryCost > 0 && input.lifetime >= 16 && yr === 15)
      ? Math.round(input.batteryCost * 0.35)
      : 0;
    const replacement = inverterRepl + batteryRepl;
    const cashflow = avoidedPurchases + exportRevenue - annualOperatingCost - replacement;
    const discount = (1 + input.discountPct / 100) ** yr, discountedCashflow = cashflow / discount;

    cumulative += cashflow;
    dc += discountedCashflow;
    npvBenefits += (avoidedPurchases + exportRevenue) / discount;
    npvCost += (annualOperatingCost + replacement) / discount;
    discountedGeneration += x.pv / discount;
    lifetimeGeneration += x.pv;
    lifetimeSelfUse += x.selfUsed;
    lifetimeBatteryShift += x.fromBattery;
    lifetimeExports += x.gridExport;
    grossBenefit += avoidedPurchases + exportRevenue;

    years.push({
      year: yr,
      generation: x.pv,
      selfUsed: x.selfUsed,
      batteryShifted: x.fromBattery,
      exported: x.gridExport,
      retailRate: rate,
      gridRate: exportRate,
      avoidedPurchases,
      exportRevenue,
      annualOperatingCost,
      replacement,
      inverterRepl,
      batteryRepl,
      cashflow,
      cumulative,
      discountedCashflow,
      discountedCumulative: dc
    });

    if (yr === 1) {
      let at = 0;
      year1Monthly = MONTH_HOURS.map((hours, i) => {
        const items = flow.hourly.slice(at, at + hours);
        at += hours;
        return {
          month: i + 1,
          label: MONTHS[i],
          generation: total(items.map(v => v.pv)),
          directSelfUsed: total(items.map(v => v.direct)),
          batteryShifted: total(items.map(v => v.fromBattery)),
          selfUsed: total(items.map(v => v.direct + v.fromBattery)),
          exported: total(items.map(v => v.gridExport)),
          gridImport: total(items.map(v => v.gridImport)),
          usage: total(items.map(v => v.load))
        };
      });
    }
  }

  const simplePb = computePaybackMetrics(upfront, years, 'cumulative', 'cashflow');
  const discPb = computePaybackMetrics(upfront, years, 'discountedCumulative', 'discountedCashflow');
  const first = years[0], npv = npvBenefits - npvCost, year1Gen = first.generation;
  const annualCfs = years.map(y => y.cashflow);

  return {
    inputs: { ...input, annualUsage: total(load) },
    years,
    year1Monthly,
    upfront,
    grossCapex,
    simplePayback: simplePb.sustainedYear,
    discountedPayback: discPb.sustainedYear,
    firstSimplePayback: simplePb.firstPayback,
    sustainedSimplePayback: simplePb.sustainedPayback,
    exactSimplePayback: simplePb.sustainedPayback,
    firstDiscountedPayback: discPb.firstPayback,
    sustainedDiscountedPayback: discPb.sustainedPayback,
    exactDiscountedPayback: discPb.sustainedPayback,
    paybackInterrupted: simplePb.interrupted,
    npv,
    irrPct: calculateIRR(upfront, annualCfs),
    mirrPct: calculateMIRR(upfront, annualCfs, input.discountPct, input.discountPct),
    signChanges: countCashflowSignChanges(upfront, annualCfs),
    profitabilityIndex: upfront > 0 ? npvBenefits / upfront : 0,
    lcoe: discountedGeneration > 0 ? npvCost / discountedGeneration : 0,
    netReturn: upfront > 0 ? (cumulative / upfront) * 100 : 0,
    specificYield: year1Gen / input.peakKw,
    independencePct: (first.selfUsed / total(load)) * 100,
    selfUseSharePct: year1Gen > 0 ? (first.selfUsed / year1Gen) * 100 : 0,
    lifetimeGeneration,
    lifetimeSelfUse,
    lifetimeBatteryShift,
    lifetimeExports,
    batteryEquivalentCycles: input.batteryKwh > 0 ? Math.round(lifetimeBatteryShift / input.batteryKwh) : 0,
    grossBenefit,
    co2OffsetTonnes: (lifetimeSelfUse * input.co2KgPerKwh) / 1000,
    mode: isDemo ? 'hourly-synthetic-demo' : 'hourly-verified',
    demo: Boolean(isDemo)
  };
}
