/**
 * SolarPayback Aurora v7.1 — Deterministic Solar PV, Battery & Financial Engine.
 * Remediates C01, C04, C05, C06, C08, C09, C10, C11, C13, C15, C20.
 * Zero networking or DOM dependencies. Reference-city values are explicitly marked
 * 'benchmark-reference' (illustrative) and never impersonate live PVGIS provider responses.
 */
export const ENGINE_VERSION = '7.5.0';
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// C10: Dated reference FX rates relative to EUR (2026-11 reference only; user quotes take precedence)
export const REFERENCE_FX_FROM_EUR = Object.freeze({
  EUR: 1.00,
  USD: 1.08,
  GBP: 0.84,
  AUD: 1.65,
  CAD: 1.50,
  INR: 91.00
});

export function convertFromEur(amountEur, targetCurrency = 'EUR') {
  const rate = REFERENCE_FX_FROM_EUR[targetCurrency] || 1.0;
  return Math.round(Number(amountEur) * rate);
}

export const DEFAULTS = Object.freeze({
  lat: 37.9838,
  lon: 23.7275,
  location: 'Athens, Greece',
  peakKw: 5.5,
  slope: 32,
  aspect: 0,
  loss: 14,
  mounting: 'free',
  annualUsage: 6500,
  usageProfile: 'flat',
  selfUsePct: 45,
  importRate: 0.24,
  exportRate: 0.07,
  systemCost: 7800,
  grant: 0,
  batteryKwh: 0,
  batteryCost: 0,
  batteryEfficiencyPct: 90,
  batteryFadePct: 2,
  annualMaintenance: 120,
  annualInsurance: 0,
  replacementYear: 12,
  replacementCost: 1100,
  degradationPct: 0.5,
  utilityEscalationPct: 2,
  exportEscalationPct: 0,
  expenseEscalationPct: 2,
  discountPct: 4,
  lifetime: 25,
  co2KgPerKwh: 0.38,
  currency: 'EUR'
});

/**
 * C01: Regional reference coordinates and indicative planning values.
 * Every record carries verifiedProvider: false and quality: 'benchmark-reference'.
 * Never present these static reference values as live PVGIS/NLR provider responses.
 */
export const CITY_BENCHMARKS = Object.freeze([
  { id: 'faro', name: 'Faro, Portugal', country: 'Portugal', region: 'south_eu', lat: 37.0200, lon: -7.9300, ghiKwhM2: 1930, pshDay: 5.29, optimalTilt: 34, yieldKwhPerKwp: 1747, importRate: 0.283, exportRate: 0.070, currency: 'EUR', co2KgPerKwh: 0.20, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'seville', name: 'Seville, Spain', country: 'Spain', region: 'south_eu', lat: 37.3900, lon: -5.9800, ghiKwhM2: 1904, pshDay: 5.22, optimalTilt: 35, yieldKwhPerKwp: 1672, importRate: 0.251, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.22, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'malaga', name: 'Málaga, Spain', country: 'Spain', region: 'south_eu', lat: 36.7200, lon: -4.4200, ghiKwhM2: 1897, pshDay: 5.20, optimalTilt: 34, yieldKwhPerKwp: 1698, importRate: 0.251, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.22, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'almeria', name: 'Almería, Spain', country: 'Spain', region: 'south_eu', lat: 36.8400, lon: -2.4600, ghiKwhM2: 1884, pshDay: 5.16, optimalTilt: 35, yieldKwhPerKwp: 1723, importRate: 0.251, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.22, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'cordoba', name: 'Córdoba, Spain', country: 'Spain', region: 'south_eu', lat: 37.8900, lon: -4.7800, ghiKwhM2: 1879, pshDay: 5.15, optimalTilt: 35, yieldKwhPerKwp: 1651, importRate: 0.251, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.22, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'granada', name: 'Granada, Spain', country: 'Spain', region: 'south_eu', lat: 37.1800, lon: -3.6000, ghiKwhM2: 1867, pshDay: 5.11, optimalTilt: 34, yieldKwhPerKwp: 1676, importRate: 0.251, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.22, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'valletta', name: 'Valletta, Malta', country: 'Malta', region: 'south_eu', lat: 35.9000, lon: 14.5100, ghiKwhM2: 1854, pshDay: 5.08, optimalTilt: 31, yieldKwhPerKwp: 1634, importRate: 0.240, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.39, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'athens', name: 'Athens, Greece', country: 'Greece', region: 'south_eu', lat: 37.9838, lon: 23.7275, ghiKwhM2: 1800, pshDay: 4.93, optimalTilt: 32, yieldKwhPerKwp: 1575, importRate: 0.240, exportRate: 0.070, currency: 'EUR', co2KgPerKwh: 0.38, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'madrid', name: 'Madrid, Spain', country: 'Spain', region: 'south_eu', lat: 40.4200, lon: -3.7000, ghiKwhM2: 1779, pshDay: 4.87, optimalTilt: 37, yieldKwhPerKwp: 1620, importRate: 0.251, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.22, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'lisbon', name: 'Lisbon, Portugal', country: 'Portugal', region: 'south_eu', lat: 38.7200, lon: -9.1400, ghiKwhM2: 1758, pshDay: 4.82, optimalTilt: 33, yieldKwhPerKwp: 1580, importRate: 0.283, exportRate: 0.070, currency: 'EUR', co2KgPerKwh: 0.20, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'barcelona', name: 'Barcelona, Spain', country: 'Spain', region: 'south_eu', lat: 41.3900, lon: 2.1700, ghiKwhM2: 1662, pshDay: 4.55, optimalTilt: 38, yieldKwhPerKwp: 1571, importRate: 0.251, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.22, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'rome', name: 'Rome, Italy', country: 'Italy', region: 'south_eu', lat: 41.9000, lon: 12.5000, ghiKwhM2: 1643, pshDay: 4.50, optimalTilt: 37, yieldKwhPerKwp: 1493, importRate: 0.314, exportRate: 0.090, currency: 'EUR', co2KgPerKwh: 0.33, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'milan', name: 'Milan, Italy', country: 'Italy', region: 'north_eu', lat: 45.4600, lon: 9.1900, ghiKwhM2: 1466, pshDay: 4.02, optimalTilt: 39, yieldKwhPerKwp: 1359, importRate: 0.314, exportRate: 0.090, currency: 'EUR', co2KgPerKwh: 0.33, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'bucharest', name: 'Bucharest, Romania', country: 'Romania', region: 'north_eu', lat: 44.4300, lon: 26.1000, ghiKwhM2: 1431, pshDay: 3.92, optimalTilt: 36, yieldKwhPerKwp: 1298, importRate: 0.284, exportRate: 0.080, currency: 'EUR', co2KgPerKwh: 0.28, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'budapest', name: 'Budapest, Hungary', country: 'Hungary', region: 'north_eu', lat: 47.5000, lon: 19.0400, ghiKwhM2: 1318, pshDay: 3.61, optimalTilt: 38, yieldKwhPerKwp: 1227, importRate: 0.114, exportRate: 0.050, currency: 'EUR', co2KgPerKwh: 0.26, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'vienna', name: 'Vienna, Austria', country: 'Austria', region: 'north_eu', lat: 48.2100, lon: 16.3700, ghiKwhM2: 1255, pshDay: 3.44, optimalTilt: 39, yieldKwhPerKwp: 1177, importRate: 0.326, exportRate: 0.085, currency: 'EUR', co2KgPerKwh: 0.16, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'zurich', name: 'Zurich, Switzerland', country: 'Switzerland', region: 'north_eu', lat: 47.3700, lon: 8.5400, ghiKwhM2: 1248, pshDay: 3.42, optimalTilt: 37, yieldKwhPerKwp: 1151, importRate: 0.290, exportRate: 0.090, currency: 'EUR', co2KgPerKwh: 0.06, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'paris', name: 'Paris, France', country: 'France', region: 'north_eu', lat: 48.8600, lon: 2.3500, ghiKwhM2: 1219, pshDay: 3.34, optimalTilt: 39, yieldKwhPerKwp: 1149, importRate: 0.249, exportRate: 0.100, currency: 'EUR', co2KgPerKwh: 0.08, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'munich', name: 'Munich, Germany', country: 'Germany', region: 'north_eu', lat: 48.1400, lon: 11.5800, ghiKwhM2: 1211, pshDay: 3.32, optimalTilt: 39, yieldKwhPerKwp: 1141, importRate: 0.362, exportRate: 0.081, currency: 'EUR', co2KgPerKwh: 0.36, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'prague', name: 'Prague, Czechia', country: 'Czechia', region: 'north_eu', lat: 50.0800, lon: 14.4400, ghiKwhM2: 1168, pshDay: 3.20, optimalTilt: 39, yieldKwhPerKwp: 1095, importRate: 0.170, exportRate: 0.065, currency: 'EUR', co2KgPerKwh: 0.42, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'berlin', name: 'Berlin, Germany', country: 'Germany', region: 'north_eu', lat: 52.5200, lon: 13.4000, ghiKwhM2: 1115, pshDay: 3.06, optimalTilt: 40, yieldKwhPerKwp: 1061, importRate: 0.362, exportRate: 0.081, currency: 'EUR', co2KgPerKwh: 0.36, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'warsaw', name: 'Warsaw, Poland', country: 'Poland', region: 'north_eu', lat: 52.2300, lon: 21.0100, ghiKwhM2: 1115, pshDay: 3.06, optimalTilt: 39, yieldKwhPerKwp: 1053, importRate: 0.300, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.65, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'brussels', name: 'Brussels, Belgium', country: 'Belgium', region: 'north_eu', lat: 50.8500, lon: 4.3500, ghiKwhM2: 1108, pshDay: 3.03, optimalTilt: 39, yieldKwhPerKwp: 1045, importRate: 0.358, exportRate: 0.070, currency: 'EUR', co2KgPerKwh: 0.17, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'amsterdam', name: 'Amsterdam, Netherlands', country: 'Netherlands', region: 'north_eu', lat: 52.3700, lon: 4.9000, ghiKwhM2: 1081, pshDay: 2.96, optimalTilt: 39, yieldKwhPerKwp: 1026, importRate: 0.244, exportRate: 0.075, currency: 'EUR', co2KgPerKwh: 0.31, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'copenhagen', name: 'Copenhagen, Denmark', country: 'Denmark', region: 'north_eu', lat: 55.6800, lon: 12.5700, ghiKwhM2: 1075, pshDay: 2.95, optimalTilt: 42, yieldKwhPerKwp: 1054, importRate: 0.340, exportRate: 0.080, currency: 'EUR', co2KgPerKwh: 0.15, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'london', name: 'London, United Kingdom', country: 'United Kingdom', region: 'north_eu', lat: 51.5100, lon: -0.1300, ghiKwhM2: 1070, pshDay: 2.93, optimalTilt: 40, yieldKwhPerKwp: 1023, importRate: 0.270, exportRate: 0.120, currency: 'GBP', co2KgPerKwh: 0.21, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'dublin', name: 'Dublin, Ireland', country: 'Ireland', region: 'north_eu', lat: 53.3500, lon: -6.2600, ghiKwhM2: 1007, pshDay: 2.76, optimalTilt: 42, yieldKwhPerKwp: 988, importRate: 0.387, exportRate: 0.185, currency: 'EUR', co2KgPerKwh: 0.29, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'stockholm', name: 'Stockholm, Sweden', country: 'Sweden', region: 'north_eu', lat: 59.3300, lon: 18.0700, ghiKwhM2: 990, pshDay: 2.71, optimalTilt: 44, yieldKwhPerKwp: 992, importRate: 0.180, exportRate: 0.065, currency: 'EUR', co2KgPerKwh: 0.04, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'helsinki', name: 'Helsinki, Finland', country: 'Finland', region: 'north_eu', lat: 60.1700, lon: 24.9400, ghiKwhM2: 984, pshDay: 2.70, optimalTilt: 44, yieldKwhPerKwp: 974, importRate: 0.170, exportRate: 0.060, currency: 'EUR', co2KgPerKwh: 0.07, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'oslo', name: 'Oslo, Norway', country: 'Norway', region: 'north_eu', lat: 59.9100, lon: 10.7500, ghiKwhM2: 949, pshDay: 2.60, optimalTilt: 45, yieldKwhPerKwp: 958, importRate: 0.160, exportRate: 0.055, currency: 'EUR', co2KgPerKwh: 0.02, dataset: 'Reference curve (PVGIS-SARAH3 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'phoenix', name: 'Phoenix, AZ, USA', country: 'United States', region: 'global', lat: 33.4484, lon: -112.0740, ghiKwhM2: 2372, pshDay: 6.50, optimalTilt: 30, yieldKwhPerKwp: 2050, importRate: 0.182, exportRate: 0.065, currency: 'USD', co2KgPerKwh: 0.37, dataset: 'Reference curve (NLR PVWatts v8 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'los_angeles', name: 'Los Angeles, CA, USA', country: 'United States', region: 'global', lat: 34.0522, lon: -118.2437, ghiKwhM2: 2008, pshDay: 5.50, optimalTilt: 31, yieldKwhPerKwp: 1820, importRate: 0.320, exportRate: 0.060, currency: 'USD', co2KgPerKwh: 0.23, dataset: 'Reference curve (NLR PVWatts v8 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'denver', name: 'Denver, CO, USA', country: 'United States', region: 'global', lat: 39.7392, lon: -104.9903, ghiKwhM2: 1825, pshDay: 5.00, optimalTilt: 35, yieldKwhPerKwp: 1400, importRate: 0.170, exportRate: 0.065, currency: 'USD', co2KgPerKwh: 0.45, dataset: 'Reference curve (NLR PVWatts v8 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'new_york', name: 'New York, NY, USA', country: 'United States', region: 'global', lat: 40.7128, lon: -74.0060, ghiKwhM2: 1497, pshDay: 4.10, optimalTilt: 36, yieldKwhPerKwp: 1400, importRate: 0.245, exportRate: 0.095, currency: 'USD', co2KgPerKwh: 0.25, dataset: 'Reference curve (NLR PVWatts v8 regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'alice_springs', name: 'Alice Springs, NT, Australia', country: 'Australia', region: 'global', lat: -23.6980, lon: 133.8807, ghiKwhM2: 2263, pshDay: 6.20, optimalTilt: 24, yieldKwhPerKwp: 1900, importRate: 0.320, exportRate: 0.070, currency: 'AUD', co2KgPerKwh: 0.52, dataset: 'Reference curve (Aus regional proxy)', quality: 'benchmark-reference', verifiedProvider: false },
  { id: 'melbourne', name: 'Melbourne, VIC, Australia', country: 'Australia', region: 'global', lat: -37.8136, lon: 144.9631, ghiKwhM2: 1533, pshDay: 4.20, optimalTilt: 34, yieldKwhPerKwp: 1500, importRate: 0.320, exportRate: 0.060, currency: 'AUD', co2KgPerKwh: 0.55, dataset: 'Reference curve (Aus regional proxy)', quality: 'benchmark-reference', verifiedProvider: false }
]);

const PVGIS_DAILY_PROFILES = {
  seville: [3.88, 4.26, 4.56, 4.81, 5.06, 5.17, 5.32, 5.25, 4.89, 4.29, 3.79, 3.64],
  almeria: [3.90, 4.48, 4.79, 5.13, 5.25, 5.38, 5.38, 5.32, 4.93, 4.39, 3.86, 3.82],
  berlin: [1.09, 2.06, 2.98, 4.06, 4.20, 4.33, 4.11, 3.90, 3.48, 2.36, 1.34, 0.96],
  amsterdam: [1.13, 1.88, 2.97, 4.06, 4.18, 4.22, 4.01, 3.67, 3.18, 2.14, 1.32, 0.93]
};

const limits = {
  lat: [-90, 90],
  lon: [-180, 180],
  peakKw: [0.1, 1000],
  slope: [0, 90],
  aspect: [-180, 180],
  loss: [0, 50],
  annualUsage: [0, 10000000],
  selfUsePct: [0, 100],
  importRate: [0, 10],
  exportRate: [0, 10],
  systemCost: [0, 10000000],
  grant: [0, 10000000],
  batteryKwh: [0, 500],
  batteryCost: [0, 5000000],
  batteryEfficiencyPct: [50, 100],
  batteryFadePct: [0, 8],
  annualMaintenance: [0, 10000000],
  annualInsurance: [0, 10000000],
  replacementYear: [0, 40],
  replacementCost: [0, 10000000],
  degradationPct: [0, 5],
  utilityEscalationPct: [-10, 30],
  exportEscalationPct: [-10, 30],
  expenseEscalationPct: [-10, 30],
  discountPct: [0, 30],
  lifetime: [1, 40],
  co2KgPerKwh: [0, 3]
};

const usageWeights = {
  flat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  summer: [0.76, 0.76, 0.83, 0.91, 1.03, 1.31, 1.48, 1.45, 1.16, 0.91, 0.72, 0.68],
  winter: [1.46, 1.32, 1.13, 0.86, 0.72, 0.68, 0.74, 0.78, 0.83, 1.0, 1.18, 1.3]
};

export function validateInputs(value) {
  const input = { ...DEFAULTS, ...value };
  for (const [name, [min, max]] of Object.entries(limits)) {
    if (typeof input[name] !== 'number' || !Number.isFinite(input[name]) || input[name] < min || input[name] > max) {
      throw new RangeError(`${name} must be between ${min} and ${max}`);
    }
  }
  if (!Number.isInteger(input.lifetime) || !Number.isInteger(input.replacementYear)) {
    throw new RangeError('Years must be integers');
  }
  if (input.grant > input.systemCost + input.batteryCost) {
    throw new RangeError('Grant cannot exceed installation price');
  }
  if (!usageWeights[input.usageProfile]) {
    throw new RangeError('Invalid household demand profile');
  }
  if (!['EUR', 'USD', 'GBP', 'AUD', 'CAD', 'INR'].includes(input.currency)) {
    throw new RangeError('Unsupported currency');
  }
  if (!['free', 'building'].includes(input.mounting)) {
    throw new RangeError('Unsupported mounting type');
  }
  return input;
}

export function getMonthlyUsage(annualUsage, profile = 'flat') {
  const weights = usageWeights[profile];
  if (!weights) throw new RangeError('Unknown usage profile');
  const dailyWeighted = weights.map((w, i) => w * MONTH_DAYS[i]);
  const sum = dailyWeighted.reduce((a, b) => a + b, 0);
  return dailyWeighted.map(w => (annualUsage * w) / sum);
}

/**
 * C01: Estimates 12-month PV generation (kWh) from approximate regional curves only.
 * Always marked verifiedProvider: false and quality: 'benchmark-reference' or 'illustrative'.
 */
export function estimateMonthlyProduction(rawInputs = {}) {
  const input = validateInputs(rawInputs);
  const absLat = Math.abs(input.lat);

  let matchedCity = null;
  let minDistance = Infinity;
  for (const city of CITY_BENCHMARKS) {
    const dist = Math.hypot(city.lat - input.lat, city.lon - input.lon);
    if (dist < minDistance) {
      minDistance = dist;
      matchedCity = city;
    }
  }

  const isNearBenchmark = matchedCity && minDistance <= 1.5;
  const baseOptimalTilt = isNearBenchmark ? matchedCity.optimalTilt : Math.min(55, Math.max(15, Math.round(absLat * 0.82 + 3)));
  const baseAnnualYieldPerKwp = isNearBenchmark
    ? matchedCity.yieldKwhPerKwp
    : Math.max(850, Math.min(2050, Math.round(2120 - absLat * 19.5)));

  const northWeight = Math.min(1, Math.max(0, (absLat - 37) / (52.5 - 37)));
  const southCurve = matchedCity?.id === 'almeria' ? PVGIS_DAILY_PROFILES.almeria : PVGIS_DAILY_PROFILES.seville;
  const northCurve = matchedCity?.id === 'amsterdam' ? PVGIS_DAILY_PROFILES.amsterdam : PVGIS_DAILY_PROFILES.berlin;

  const rawMonthlyPerKwp = MONTH_DAYS.map((days, idx) => {
    const dailyKwhPerKwp = southCurve[idx] * (1 - northWeight) + northCurve[idx] * northWeight;
    return dailyKwhPerKwp * days;
  });

  const hemisphereAdjusted = input.lat < 0
    ? rawMonthlyPerKwp.map((_, idx) => rawMonthlyPerKwp[(idx + 6) % 12])
    : rawMonthlyPerKwp;

  const rawSum = hemisphereAdjusted.reduce((a, b) => a + b, 0);

  const lossRatio = (1 - input.loss / 100) / (1 - 0.14);
  const tiltDelta = Math.abs(input.slope - baseOptimalTilt);
  const tiltFactor = Math.max(0.72, 1 - 0.00011 * tiltDelta * tiltDelta);
  const aspectRad = (Math.abs(input.aspect) * Math.PI) / 180;
  const aspectFactor = Math.max(0.62, 1 - 0.22 * Math.pow(Math.sin(aspectRad / 2), 1.6));
  const mountingFactor = input.mounting === 'building' ? 0.965 : 1.0;

  const effectiveYieldPerKwp = baseAnnualYieldPerKwp * lossRatio * tiltFactor * aspectFactor * mountingFactor;
  const monthlyKwh = hemisphereAdjusted.map(v =>
    Math.round(((v / rawSum) * effectiveYieldPerKwp * input.peakKw) * 100) / 100
  );
  const annualKwh = Math.round(monthlyKwh.reduce((a, b) => a + b, 0) * 100) / 100;

  return {
    monthlyKwh,
    annualKwh,
    specificYield: Math.round((annualKwh / input.peakKw) * 10) / 10,
    matchedCity: isNearBenchmark ? matchedCity : null,
    baseOptimalTilt,
    tiltFactor,
    aspectFactor,
    lossRatio,
    mountingFactor,
    quality: isNearBenchmark ? 'benchmark-reference' : 'illustrative',
    verifiedProvider: false,
    dataset: isNearBenchmark ? `Illustrative regional reference: ${matchedCity.name} (unverified)` : 'Illustrative latitude-based seasonal model (unverified)'
  };
}

/**
 * C13: Deterministic Internal Rate of Return (IRR) solver + sign-change detector & MIRR.
 */
export function countCashflowSignChanges(upfront, annualCashflows) {
  const series = [-Math.abs(upfront), ...annualCashflows].filter(x => x !== 0);
  let changes = 0;
  for (let i = 1; i < series.length; i++) {
    if ((series[i - 1] < 0 && series[i] > 0) || (series[i - 1] > 0 && series[i] < 0)) changes++;
  }
  return changes;
}

export function calculateIRR(upfront, annualCashflows) {
  if (!(upfront > 0) || !Array.isArray(annualCashflows) || annualCashflows.length === 0) return null;
  const totalNominal = annualCashflows.reduce((a, b) => a + b, 0);
  if (totalNominal <= 0) return null;

  const npvAt = rate => {
    let sum = -upfront;
    for (let i = 0; i < annualCashflows.length; i++) {
      sum += annualCashflows[i] / Math.pow(1 + rate, i + 1);
    }
    return sum;
  };

  let low = -0.5;
  let high = 3.0;
  let fLow = npvAt(low);
  let fHigh = npvAt(high);
  if (fLow * fHigh > 0) return null;

  for (let iter = 0; iter < 80; iter++) {
    const mid = (low + high) / 2;
    const fMid = npvAt(mid);
    if (Math.abs(fMid) < 1e-6) return Math.round(mid * 10000) / 100;
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return Math.round(((low + high) / 2) * 10000) / 100;
}

// C13: Modified Internal Rate of Return (MIRR) handles non-monotonic cashflows (e.g. heavy replacement years)
export function calculateMIRR(upfront, annualCashflows, financeRatePct = 4, reinvestRatePct = 4) {
  if (!(upfront > 0) || !Array.isArray(annualCashflows) || annualCashflows.length === 0) return null;
  const n = annualCashflows.length;
  const rFin = financeRatePct / 100;
  const rRein = reinvestRatePct / 100;
  let pvNeg = upfront;
  let fvPos = 0;
  for (let i = 0; i < n; i++) {
    const cf = annualCashflows[i];
    if (cf < 0) {
      pvNeg += Math.abs(cf) / Math.pow(1 + rFin, i + 1);
    } else if (cf > 0) {
      fvPos += cf * Math.pow(1 + rRein, n - 1 - i);
    }
  }
  if (fvPos <= 0 || pvNeg <= 0) return null;
  const mirr = Math.pow(fvPos / pvNeg, 1 / n) - 1;
  return Math.round(mirr * 10000) / 100;
}

/**
 * C13: Computes both First-Crossing Payback and Sustained Payback (where cumulative stays >= 0).
 */
export function computePaybackMetrics(upfront, years, field = 'cumulative', flowField = 'cashflow') {
  if (!Array.isArray(years) || years.length === 0) {
    return { firstPayback: null, sustainedPayback: null, interrupted: false, sustainedYear: null };
  }
  if (upfront <= 0) {
    return { firstPayback: 0, sustainedPayback: 0, interrupted: false, sustainedYear: 1 };
  }
  let firstPayback = null;
  for (let i = 0; i < years.length; i++) {
    const cur = years[i][field];
    const prev = i === 0 ? -upfront : years[i - 1][field];
    const cf = years[i][flowField];
    if (firstPayback === null && cur >= 0) {
      firstPayback = cf > 0 ? Math.round((i + Math.abs(prev) / cf) * 100) / 100 : i + 1;
      break;
    }
  }
  // Find the last year where cumulative balance was < 0
  if (years[years.length - 1][field] < 0) {
    return { firstPayback, sustainedPayback: null, interrupted: firstPayback !== null, sustainedYear: null };
  }
  let lastNegIdx = -1;
  for (let i = 0; i < years.length; i++) {
    if (years[i][field] < 0) lastNegIdx = i;
  }
  const crossIdx = lastNegIdx + 1;
  const prevBal = lastNegIdx === -1 ? -upfront : years[lastNegIdx][field];
  const crossFlow = years[crossIdx][flowField];
  const sustainedPayback = crossFlow > 0
    ? Math.round((crossIdx + Math.abs(prevBal) / crossFlow) * 100) / 100
    : crossIdx + 1;
  const interrupted = firstPayback !== null && sustainedPayback > firstPayback + 0.01;
  return {
    firstPayback,
    sustainedPayback,
    interrupted,
    sustainedYear: crossIdx + 1
  };
}

/**
 * Computes multi-year solar + battery cash flow, NPV, IRR, MIRR, LCOE, first & sustained payback, and monthly energy balance.
 */
export function calculateForecast(monthlyProduction, rawInputs, productionMultiplier = 1) {
  const input = validateInputs(rawInputs);
  if (
    !Array.isArray(monthlyProduction) ||
    monthlyProduction.length !== 12 ||
    monthlyProduction.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e8)
  ) {
    throw new RangeError('Expected 12 finite, non-negative monthly production values');
  }
  if (!Number.isFinite(productionMultiplier) || productionMultiplier <= 0 || productionMultiplier > 10) {
    throw new RangeError('Invalid multiplier');
  }

  const monthUsage = getMonthlyUsage(input.annualUsage, input.usageProfile);
  const grossCapex = input.systemCost + input.batteryCost;
  const upfront = grossCapex - input.grant;
  let cumulative = -upfront;
  let discountedCumulative = -upfront;
  let npvBenefits = 0;
  let npvCost = upfront;
  let discountedGeneration = 0;
  let lifetimeGeneration = 0;
  let lifetimeSelfUse = 0;
  let lifetimeBatteryShift = 0;
  let lifetimeExports = 0;
  let grossBenefit = 0;
  let cumulativeBatteryThroughputKwh = 0;

  // C11: Warranted throughput & EoL capacity floor for LFP battery
  const warrantedCycles = 6000;
  const maxWarrantedThroughputKwh = input.batteryKwh * warrantedCycles;

  const years = [];
  let year1Monthly = [];

  for (let year = 1; year <= input.lifetime; year++) {
    const factor = productionMultiplier * Math.pow(1 - input.degradationPct / 100, year - 1);
    // C11: Battery degrades linearly down to 65% floor, or drops if warranted throughput is exhausted
    const rawBattHealth = Math.max(0.65, Math.pow(1 - input.batteryFadePct / 100, year - 1));
    const throughputExhausted = maxWarrantedThroughputKwh > 0 && cumulativeBatteryThroughputKwh > maxWarrantedThroughputKwh;
    const batteryDegradation = throughputExhausted ? 0.55 : rawBattHealth;

    let generation = 0;
    let selfUsed = 0;
    let batteryShifted = 0;
    let exported = 0;

    const perMonth = monthlyProduction.map((base, idx) => {
      const energy = base * factor;
      const directOwn = Math.min((energy * input.selfUsePct) / 100, monthUsage[idx]);
      const surplus = Math.max(0, energy - directOwn);
      const unmetDemand = Math.max(0, monthUsage[idx] - directOwn);

      let storedDelivered = 0;
      if (input.batteryKwh > 0 && surplus > 0 && unmetDemand > 0) {
        // C06 & C11: Respect 10%-95% usable daily cycling window (0.85 DoD) and degradation
        const monthlyCycleCap = input.batteryKwh * MONTH_DAYS[idx] * 0.85 * batteryDegradation;
        const rawStored = Math.min(surplus, monthlyCycleCap);
        const usableFromBattery = rawStored * (input.batteryEfficiencyPct / 100);
        storedDelivered = Math.min(unmetDemand, usableFromBattery);
      }

      const rawBatteryConsumed =
        storedDelivered > 0 ? storedDelivered / (input.batteryEfficiencyPct / 100) : 0;
      const own = directOwn + storedDelivered;
      const sentToGrid = Math.max(0, energy - directOwn - rawBatteryConsumed);

      generation += energy;
      selfUsed += own;
      batteryShifted += storedDelivered;
      exported += sentToGrid;
      cumulativeBatteryThroughputKwh += storedDelivered;

      return {
        month: idx + 1,
        label: MONTHS[idx],
        generation: energy,
        directSelfUsed: directOwn,
        batteryShifted: storedDelivered,
        selfUsed: own,
        exported: sentToGrid,
        usage: monthUsage[idx],
        gridImport: Math.max(0, monthUsage[idx] - own)
      };
    });

    if (year === 1) {
      year1Monthly = perMonth;
    }

    const retailRate = input.importRate * Math.pow(1 + input.utilityEscalationPct / 100, year - 1);
    const gridRate = input.exportRate * Math.pow(1 + input.exportEscalationPct / 100, year - 1);
    const avoidedPurchases = selfUsed * retailRate;
    const exportRevenue = exported * gridRate;
    const annualOperatingCost =
      (input.annualMaintenance + input.annualInsurance) *
      Math.pow(1 + input.expenseEscalationPct / 100, year - 1);
    const inverterRepl = input.replacementYear === year ? input.replacementCost : 0;
    // C11: If battery is present and project runs >= 16 years, model mid-life battery cell refurbishment/replacement at Year 15 (35% of initial pack cost)
    const batteryRepl = (input.batteryKwh > 0 && input.batteryCost > 0 && input.lifetime >= 16 && year === 15)
      ? Math.round(input.batteryCost * 0.35)
      : 0;
    const replacement = inverterRepl + batteryRepl;
    const cashflow = avoidedPurchases + exportRevenue - annualOperatingCost - replacement;
    const discount = Math.pow(1 + input.discountPct / 100, year);
    const discountedCashflow = cashflow / discount;

    cumulative += cashflow;
    discountedCumulative += discountedCashflow;

    npvBenefits += (avoidedPurchases + exportRevenue) / discount;
    npvCost += (annualOperatingCost + replacement) / discount;
    discountedGeneration += generation / discount;
    lifetimeGeneration += generation;
    lifetimeSelfUse += selfUsed;
    lifetimeBatteryShift += batteryShifted;
    lifetimeExports += exported;
    grossBenefit += avoidedPurchases + exportRevenue;

    years.push({
      year,
      generation,
      selfUsed,
      batteryShifted,
      exported,
      retailRate,
      gridRate,
      avoidedPurchases,
      exportRevenue,
      annualOperatingCost,
      replacement,
      inverterRepl,
      batteryRepl,
      cashflow,
      cumulative,
      discountedCashflow,
      discountedCumulative
    });
  }

  // C13: Compute both First-Crossing and Sustained Payback
  const simplePb = computePaybackMetrics(upfront, years, 'cumulative', 'cashflow');
  const discPb = computePaybackMetrics(upfront, years, 'discountedCumulative', 'discountedCashflow');

  const npv = npvBenefits - npvCost;
  const lcoe = discountedGeneration > 0 ? npvCost / discountedGeneration : 0;
  const netReturn = upfront > 0 ? (cumulative / upfront) * 100 : 0;
  const profitabilityIndex = upfront > 0 ? npvBenefits / upfront : 0;
  const annualCfs = years.map(y => y.cashflow);
  const irrPct = calculateIRR(upfront, annualCfs);
  const mirrPct = calculateMIRR(upfront, annualCfs, input.discountPct, input.discountPct);
  const signChanges = countCashflowSignChanges(upfront, annualCfs);
  const co2OffsetTonnes = (lifetimeSelfUse * input.co2KgPerKwh) / 1000;
  const year1Gen = years[0]?.generation ?? 0;
  const year1SelfUse = years[0]?.selfUsed ?? 0;
  const specificYield = input.peakKw > 0 ? year1Gen / input.peakKw : 0;
  const independencePct = input.annualUsage > 0 ? Math.min(100, (year1SelfUse / input.annualUsage) * 100) : 0;
  const selfUseSharePct = year1Gen > 0 ? Math.min(100, (year1SelfUse / year1Gen) * 100) : 0;

  return {
    inputs: input,
    years,
    year1Monthly,
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
    irrPct,
    mirrPct,
    signChanges,
    profitabilityIndex,
    lcoe,
    netReturn,
    specificYield,
    independencePct,
    selfUseSharePct,
    lifetimeGeneration,
    lifetimeSelfUse,
    lifetimeBatteryShift,
    lifetimeExports,
     batteryEquivalentCycles: input.batteryKwh > 0 ? Math.round(lifetimeBatteryShift / input.batteryKwh) : 0,
    grossBenefit,
    co2OffsetTonnes,
    upfront,
    grossCapex,
    mode: 'monthly-preliminary'
  };
}

export function calculateLevers(monthlyProduction, rawInputs, evaluatorFn = null) {
  const evalForecast = evaluatorFn || ((inp, mult = 1) => calculateForecast(monthlyProduction, inp, mult));
  const base = evalForecast(rawInputs, 1);
  const input = base.inputs;

  const higherSelfUse = evalForecast({
    ...input,
    selfUsePct: Math.min(100, input.selfUsePct + 10)
  }, 1);
  const lowerCost = evalForecast({
    ...input,
    systemCost: Math.max(input.grant, input.systemCost * 0.9)
  }, 1);
  const higherTariff = evalForecast({
    ...input,
    importRate: Math.min(10, input.importRate * 1.1)
  }, 1);

  return {
    baseNpv: base.npv,
    useDeltaNpv: higherSelfUse.npv - base.npv,
    costDeltaNpv: lowerCost.npv - base.npv,
    priceDeltaNpv: higherTariff.npv - base.npv
  };
}

/**
 * C05: Generates a 3x3 sensitivity matrix using the active scenario evaluator (hourly or monthly)
 * so the center cell (1.0x yield, +0.0% escalation shift) ALWAYS matches the main displayed NPV & Payback.
 */
export function calculateSensitivityMatrix(monthlyProduction, rawInputs, evaluatorFn = null) {
  const input = validateInputs(rawInputs);
  const evalForecast = evaluatorFn || ((inp, mult = 1) => calculateForecast(monthlyProduction, inp, mult));
  const yieldMultipliers = [0.9, 1.0, 1.1];
  const escalationShifts = [-1.5, 0, 1.5];

  return escalationShifts.map(shift => {
    const esc = Math.max(-10, Math.min(30, input.utilityEscalationPct + shift));
    return {
      escalationPct: esc,
      cells: yieldMultipliers.map(mult => {
        const res = evalForecast({ ...input, utilityEscalationPct: esc }, mult);
        return {
          multiplier: mult,
          npv: res.npv,
          exactSimplePayback: res.exactSimplePayback,
          firstSimplePayback: res.firstSimplePayback,
          exactDiscountedPayback: res.exactDiscountedPayback,
          irrPct: res.irrPct,
          mirrPct: res.mirrPct
        };
      })
    };
  });
}

// C15: Self-documenting provenance CSV export
export function asCSV(forecast, provenance = {}) {
  const meta = [
    `# SolarPayback Aurora v${ENGINE_VERSION} Financial Audit Ledger`,
    `# Generated_At: ${provenance.generatedAt || new Date().toISOString()}`,
    `# Data_Provenance_Mode: ${provenance.quality || forecast.mode || 'illustrative'}`,
    `# Verified_Provider_Data: ${provenance.verifiedProvider === true ? 'YES' : 'NO (Illustrative / Reference Only)'}`,
    `# Dataset: ${provenance.dataset || 'Unspecified'}`,
    `# Currency: ${forecast.inputs.currency} | Upfront_Net_Capex: ${forecast.upfront.toFixed(2)} | Discount_Rate_Pct: ${forecast.inputs.discountPct}`,
    `# First_Simple_Payback_Yrs: ${forecast.firstSimplePayback ?? 'Not reached'} | Sustained_Simple_Payback_Yrs: ${forecast.sustainedSimplePayback ?? 'Not reached'} | NPV: ${forecast.npv.toFixed(2)}`
  ];
  const header = 'year,production_kwh,self_consumed_kwh,battery_shifted_kwh,exported_kwh,avoided_grid_cost,export_revenue,operating_cost,replacement_cost,annual_cashflow,cumulative_cashflow,discounted_cumulative_cashflow';
  const lines = [...meta, header];
  for (const y of forecast.years) {
    lines.push(
      [
        y.year,
        y.generation,
        y.selfUsed,
        y.batteryShifted || 0,
        y.exported,
        y.avoidedPurchases,
        y.exportRevenue,
        y.annualOperatingCost,
        y.replacement,
        y.cashflow,
        y.cumulative,
        y.discountedCumulative
      ]
        .map(v => Number(v.toFixed(4)))
        .join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}

export function solarSignature(input) {
  return ['lat', 'lon', 'peakKw', 'slope', 'aspect', 'loss', 'mounting'].map(key => String(input[key])).join('|');
}

/**
 * C09: Hardware Reference Catalog with SKU, Datasheet Revision, Electrical Constraints, and Reference EUR Cost
 */
export const HARDWARE_DIRECTORY = Object.freeze({
  modules: [
    {
      id: 'maxeon7',
      brand: 'SunPower / Maxeon',
      model: 'Maxeon 7 (SPR-MAX7-445)',
      sku: 'SPR-MAX7-445-BLK',
      datasheetRev: 'Rev 2024.01 / IEC 61215',
      tech: 'IBC N-Type Back-Contact',
      watts: 445,
      efficiencyPct: 24.1,
      tempCoeffPctPerC: -0.27,
      degradationPct: 0.25,
      firstYearDegPct: 1.0,
      areaSqm: 1.85,
      lengthM: 1.795,
      widthM: 1.031,
      vocV: 82.0,
      warrantyYears: 40,
      costDeltaPerKwpEur: 220,
      badge: '24.1% Module Efficiency (Datasheet Reference)',
      notes: 'Copper-backed IBC cell architecture; high Voc (82V) requires string-length check on 600V inverters.',
      sourceTitle: 'SunPower Maxeon 7 Technical Datasheet',
      sourceUrl: 'https://cdn.prod.website-files.com/6627b4a16340c535bfabf896/668bef1148a5bfbf75c79fbe_Sunpower.pdf'
    },
    {
      id: 'rec_alpha_pure_rx',
      brand: 'REC Group',
      model: 'Alpha Pure-RX 470W',
      sku: 'REC470AA-PURE-RX',
      datasheetRev: 'Rev D 2024.08 / IEC 61215',
      tech: 'HJT Heterojunction Gapless',
      watts: 470,
      efficiencyPct: 22.6,
      tempCoeffPctPerC: -0.24,
      degradationPct: 0.25,
      firstYearDegPct: 1.0,
      areaSqm: 2.08,
      lengthM: 1.728,
      widthM: 1.205,
      vocV: 65.7,
      warrantyYears: 25,
      costDeltaPerKwpEur: 140,
      badge: '-0.24%/°C Temp Coefficient (Datasheet Reference)',
      notes: 'Lead-free RoHS-compliant HJT module warranted for >=92% nameplate power at Year 25.',
      sourceTitle: 'REC Alpha Pure-RX Official Page',
      sourceUrl: 'https://www.recgroup.com/en-us/rec-alpha-pure-rx'
    },
    {
      id: 'trina_vertex_s_plus',
      brand: 'Trina Solar',
      model: 'Vertex S+ (TSM-450NEG9R.28)',
      sku: 'TSM-450NEG9R.28',
      datasheetRev: 'Rev 2024.08 / IEC 61215',
      tech: 'Dual-Glass N-Type i-TOPCon',
      watts: 450,
      efficiencyPct: 22.5,
      tempCoeffPctPerC: -0.29,
      degradationPct: 0.40,
      firstYearDegPct: 1.0,
      areaSqm: 1.998,
      lengthM: 1.762,
      widthM: 1.134,
      vocV: 52.9,
      warrantyYears: 25,
      costDeltaPerKwpEur: 0,
      badge: '1.6+1.6mm Dual-Glass i-TOPCon Reference',
      notes: '1% first-year and 0.40% annual linear degradation warranty over 30 years.',
      sourceTitle: 'Trina Vertex S+ NEG9R.28 Datasheet',
      sourceUrl: 'https://vertexsplus.trinasolar.com/wp-content/uploads/2024/09/240831_Datasheet_Vertex-S_NEG9R.28_EN_2024_C_web.pdf'
    },
    {
      id: 'jinko_tiger_neo',
      brand: 'Jinko Solar',
      model: 'Tiger Neo N-Type 440W (54HL4R)',
      sku: 'JKM440N-54HL4R-V',
      datasheetRev: 'Rev 2024 / IEC 61215',
      tech: 'N-Type TOPCon SMBB',
      watts: 440,
      efficiencyPct: 22.2,
      tempCoeffPctPerC: -0.29,
      degradationPct: 0.40,
      firstYearDegPct: 1.0,
      areaSqm: 1.998,
      lengthM: 1.762,
      widthM: 1.134,
      vocV: 39.38,
      warrantyYears: 25,
      costDeltaPerKwpEur: -35,
      badge: 'N-Type TOPCon 54-Cell Reference',
      notes: 'Low Voc (39.4V) permits longer residential string lengths; 87.4% warranted output at Year 30.',
      sourceTitle: 'Jinko Solar Tiger Neo Official Page',
      sourceUrl: 'https://www.jinkosolar.com/en/site/tigerneo'
    },
    {
      id: 'longi_himo7',
      brand: 'LONGi Solar',
      model: 'Hi-MO 7 (LR7-66HTH-620M)',
      sku: 'LR7-66HTH-620M',
      datasheetRev: 'Rev 2025 / IEC 61215',
      tech: 'HPDC N-Type TaiRay Wafer',
      watts: 620,
      efficiencyPct: 23.0,
      tempCoeffPctPerC: -0.28,
      degradationPct: 0.40,
      firstYearDegPct: 1.0,
      areaSqm: 2.701,
      lengthM: 2.382,
      widthM: 1.134,
      vocV: 48.5,
      warrantyYears: 30,
      costDeltaPerKwpEur: -50,
      badge: 'Large-Format Commercial/Ground 620W Reference',
      notes: '2.38m commercial format (>2.0m²); verify local residential rooftop handling and wind-load rules.',
      sourceTitle: 'LONGi Hi-MO 7 Official Specifications',
      sourceUrl: 'https://eu.longi.com/large-scale-utility-solutions/hi-mo-7'
    }
  ],
  inverters: [
    {
      id: 'enphase_iq8',
      brand: 'Enphase Energy',
      model: 'IQ8 Series Microinverters (IQ8M/IQ8HC)',
      sku: 'IQ8M-72-2-INT',
      coupling: 'AC-Micro',
      type: 'Panel-Level AC Microinverter',
      weightedEffPct: 97.0,
      maxEffPct: 97.6,
      systemLossPct: 11.5,
      warrantyYears: 25,
      replacementYear: 25,
      replacementCostEur: 0,
      compatibleBatteries: ['enphase_iq_5p_dual', 'tesla_pw3', 'none'],
      badge: '25-Year Limited Warranty (AC Micro)',
      notes: 'Panel-level MPPT avoids string shading mismatch; pairs natively with AC-coupled batteries (Enphase 5P / PW3).',
      sourceTitle: 'NLR SAM PV Inverter Reference',
      sourceUrl: 'https://sam.nlr.gov/photovoltaic'
    },
    {
      id: 'solaredge_home_wave',
      brand: 'SolarEdge',
      model: 'Home Wave + DC Power Optimizers',
      sku: 'SE5000H-RW000BNN4',
      coupling: 'DC-Optimized',
      type: 'DC-Optimized String Inverter',
      weightedEffPct: 99.0,
      maxEffPct: 99.2,
      systemLossPct: 10.5,
      warrantyYears: 12,
      replacementYear: 15,
      replacementCostEur: 1150,
      compatibleBatteries: ['tesla_pw3', 'enphase_iq_5p_dual', 'none'],
      badge: '99.0% Weighted Efficiency Reference',
      notes: 'Fixed-string voltage architecture with module-level DC optimizers; 12-yr inverter & 25-yr optimizer warranty.',
      sourceTitle: 'NLR SAM PV System Modeling',
      sourceUrl: 'https://sam.nlr.gov/photovoltaic'
    },
    {
      id: 'fronius_primo_gen24',
      brand: 'Fronius International',
      model: 'Primo GEN24 5.0 Plus Hybrid',
      sku: '4,210,143,001',
      coupling: 'Hybrid-HV',
      type: 'Single-Phase Hybrid Inverter',
      weightedEffPct: 97.2,
      maxEffPct: 97.6,
      systemLossPct: 12.5,
      warrantyYears: 10,
      replacementYear: 13,
      replacementCostEur: 1100,
      compatibleBatteries: ['byd_hvs_10_2', 'tesla_pw3', 'enphase_iq_5p_dual', 'none'],
      badge: '80V Start Voltage / HV Hybrid Port',
      notes: 'Native DC high-voltage battery port compatible with BYD Battery-Box Premium HVS/HVM; IP66 active cooling.',
      sourceTitle: 'ComparePV Fronius GEN24 Datasheet Index',
      sourceUrl: 'https://comparepv.com/inverter/fronius-international-fronius-primo-gen24-5-0-plus'
    },
    {
      id: 'huawei_sun2000_l1',
      brand: 'Huawei FusionSolar',
      model: 'SUN2000-4.6KTL-L1 Hybrid',
      sku: 'SUN2000-4.6KTL-L1',
      coupling: 'Hybrid-Huawei',
      type: 'Single-Phase Hybrid String',
      weightedEffPct: 98.0,
      maxEffPct: 98.6,
      systemLossPct: 11.8,
      warrantyYears: 10,
      replacementYear: 12,
      replacementCostEur: 950,
      compatibleBatteries: ['huawei_luna2000_10', 'tesla_pw3', 'enphase_iq_5p_dual', 'none'],
      badge: '98.0% Euro Efficiency / LUNA2000 Bus',
      notes: 'Dedicated high-voltage DC bus for Huawei LUNA2000 storage; fanless natural-convection IP65 enclosure.',
      sourceTitle: 'ComparePV SUN2000-4.6KTL-L1 Specs',
      sourceUrl: 'https://comparepv.com/compare-inverters/fronius-international-fronius-primo-gen24-4-6-plus/huawei-sun2000l-4-6ktl'
    }
  ],
  batteries: [
    {
      id: 'tesla_pw3',
      brand: 'Tesla Energy',
      model: 'Powerwall 3 (Integrated Hybrid)',
      sku: '1707000-XX-Y',
      coupling: 'AC/DC-Hybrid',
      chemistry: 'LFP (Lithium Iron Phosphate)',
      usableKwh: 13.5,
      powerKw: 11.5,
      roundTripEffPct: 89,
      annualFadePct: 1.8,
      warrantedCycles: 6000,
      warrantyYears: 10,
      estimatedCostEur: 8900,
      badge: '13.5 kWh Usable / 11.5 kW Continuous',
      notes: 'Integrated solar/battery inverter with 89% solar-to-home round-trip efficiency and 10-year warranty.',
      sourceTitle: 'Batterijsimulator Home Battery Specs',
      sourceUrl: 'https://www.batterijsimulator.be/en/home-batteries'
    },
    {
      id: 'byd_hvs_10_2',
      brand: 'BYD Battery-Box',
      model: 'Premium HVS 10.2 (4 Modules)',
      sku: 'BYD-HVS-10.2',
      coupling: 'DC-HV',
      chemistry: 'LFP High-Voltage Modular',
      usableKwh: 10.2,
      powerKw: 9.0,
      roundTripEffPct: 96,
      annualFadePct: 1.8,
      warrantedCycles: 6000,
      warrantyYears: 10,
      estimatedCostEur: 6200,
      badge: '>=96% DC Round-Trip Efficiency (Datasheet)',
      notes: 'Requires compatible HV hybrid inverter (e.g. Fronius Primo/Symo GEN24 Plus, GoodWe, SMA Sunny Boy Storage).',
      sourceTitle: 'BYD Battery-Box Premium HVS Datasheet',
      sourceUrl: 'https://www.europe-solarstore.com/download/byd/BYD-Battery-Box-Premium-HVS-datasheet.pdf'
    },
    {
      id: 'enphase_iq_5p_dual',
      brand: 'Enphase Energy',
      model: '2x IQ Battery 5P (10.0 kWh Pack)',
      sku: 'IQBATTERY-5P-1P-INT (x2)',
      coupling: 'AC-Coupled',
      chemistry: 'LFP AC-Coupled Modular',
      usableKwh: 10.0,
      powerKw: 7.68,
      roundTripEffPct: 90,
      annualFadePct: 1.5,
      warrantedCycles: 6000,
      warrantyYears: 15,
      estimatedCostEur: 7400,
      badge: '15-Year / 6,000-Cycle LFP Warranty',
      notes: 'AC-coupled architecture with six integrated IQ8D-BAT microinverters per 5 kWh module (90% AC RTE).',
      sourceTitle: 'Batterijsimulator Enphase IQ 5P',
      sourceUrl: 'https://www.batterijsimulator.be/en/home-batteries'
    },
    {
      id: 'huawei_luna2000_10',
      brand: 'Huawei FusionSolar',
      model: 'LUNA2000-10-S0 (2x 5 kWh)',
      sku: 'LUNA2000-10-S0',
      coupling: 'DC-Huawei',
      chemistry: 'LFP Modular DC Stack',
      usableKwh: 10.0,
      powerKw: 5.0,
      roundTripEffPct: 95,
      annualFadePct: 1.8,
      warrantedCycles: 6000,
      warrantyYears: 10,
      estimatedCostEur: 5600,
      badge: 'Modular 10 kWh DC Pack (SUN2000 Bus)',
      notes: 'Requires Huawei SUN2000 L1/M1 hybrid inverter; 100% depth of discharge with pack-level optimization.',
      sourceTitle: 'SolarScout Battery Specifications',
      sourceUrl: 'https://solarscout.co.nz/solar-guides/solar-battery-storage-nz/'
    }
  ]
});

// C09: Hardware Compatibility Checker
export function checkHardwareCompatibility(moduleId, inverterId, batteryId, peakKw = 5.5) {
  const mod = HARDWARE_DIRECTORY.modules.find(m => m.id === moduleId);
  const inv = HARDWARE_DIRECTORY.inverters.find(i => i.id === inverterId);
  const bat = HARDWARE_DIRECTORY.batteries.find(b => b.id === batteryId);
  const warnings = [];
  if (inv && bat && batteryId !== 'none') {
    if (!inv.compatibleBatteries.includes(batteryId)) {
      warnings.push(`Inverter/Battery Coupling Warning: ${bat.brand} ${bat.model} (${bat.coupling}) is not natively compatible with ${inv.brand} ${inv.model} (${inv.coupling}). Select a compatible hybrid inverter or AC-coupled battery.`);
    }
  }
  if (mod && mod.areaSqm > 2.1) {
    warnings.push(`Large-Format Module Notice: ${mod.model} (${mod.areaSqm} m²) exceeds 2.0 m² residential glass rules in some EU jurisdictions (e.g. DIBt). Verify local rooftop regulations.`);
  }
  if (inv && inv.id === 'huawei_sun2000_l1' && peakKw > 6.9) {
    warnings.push(`DC/AC Sizing Notice: ${peakKw.toFixed(1)} kWp exceeds 1.5x DC:AC ratio for a single 4.6 kW single-phase inverter; consider three-phase or dual inverters to avoid midday clipping.`);
  }
  return warnings;
}

/**
 * C08: Versioned Policy Directory with Effective Dates, Sunset Expiry, and Primary Regulator Citations.
 * Fixes the Dutch Salderingsregeling end date to 2027-01-01 per Rijksoverheid.nl.
 */
export const POLICY_DIRECTORY = Object.freeze([
  {
    id: 'greece_net_billing',
    country: 'Greece',
    flag: 'GR',
    version: '2026.1',
    effectiveFrom: '2024-05-01',
    expiresOn: 'Active (20-yr contract)',
    regime: 'Net Billing (20-Year Contract / ΔΕΔΔΗΕ)',
    cityId: 'athens',
    currency: 'EUR',
    typicalCostPerKwp: 1350,
    importRate: 0.240,
    exportRate: 0.070,
    selfUseTargetPct: 50,
    summary: 'Classic net metering closed in May 2024. New residential installations use 20-year Net Billing contracts: self-consumed solar offsets variable retail charges (~€0.24/kWh), while exported surplus settles at wholesale day-ahead clearing prices (~€0.07/kWh).',
    keyRule: 'Verify non-avoidable regulated network/municipal charges on your bill before assuming 100% retail offset.',
    sourceTitle: 'HEDNO / ΔΕΔΔΗΕ: Official Net-Billing & PV Connection Rules',
    sourceUrl: 'https://www.deddie.gr/el/themata-stathmon-ape-sithia/autonomoi-paragogoi-net-metering/'
  },
  {
    id: 'germany_eeg_2026',
    country: 'Germany',
    flag: 'DE',
    version: '2026.1',
    effectiveFrom: '2023-01-01',
    expiresOn: 'Semi-annual degression',
    regime: 'EEG Feed-in Tariff + 0% VAT (§12 UStG)',
    cityId: 'munich',
    currency: 'EUR',
    typicalCostPerKwp: 1450,
    importRate: 0.362,
    exportRate: 0.077,
    selfUseTargetPct: 45,
    summary: '0% VAT applies to eligible residential PV and battery systems under 30 kWp. Surplus exports earn a fixed EEG feed-in tariff (~7.70 ct/kWh reference), subject to semi-annual degression and smart-meter curtailment rules for negative-price hours.',
    keyRule: 'Germany has proposed phasing out fixed feed-in tariffs for new small PV in upcoming EEG revisions; verify current BNetzA rates.',
    sourceTitle: 'Bundesnetzagentur (BNetzA): Official EEG Tariffs & Rules',
    sourceUrl: 'https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/ErneuerbareEnergien/EEG_Foerderung/start.html'
  },
  {
    id: 'benelux_transition',
    country: 'Netherlands',
    flag: 'NL',
    version: '2026.2',
    effectiveFrom: '2023-01-01',
    expiresOn: '2027-01-01 (Salderingsregeling Ends)',
    regime: 'Salderingsregeling Ends 1 Jan 2027 (Rijksoverheid)',
    cityId: 'amsterdam',
    currency: 'EUR',
    typicalCostPerKwp: 1320,
    importRate: 0.285,
    exportRate: 0.075,
    selfUseTargetPct: 38,
    summary: 'Per official Dutch government policy (Rijksoverheid), the net-metering scheme (Salderingsregeling) ends on 1 January 2027 (NOT through end of 2027). Starting 1 January 2027, households no longer net annual exports against imports and instead receive only supplier export compensation minus any grid return costs.',
    keyRule: 'Model post-2027 cash flows using realistic net-export compensation (~€0.05–€0.08/kWh) rather than 1:1 net metering.',
    sourceTitle: 'Rijksoverheid: Salderingsregeling stopt per 1 januari 2027',
    sourceUrl: 'https://www.rijksoverheid.nl/themas/klimaat-milieu-en-natuur/energie-thuis/salderingsregeling'
  },
  {
    id: 'spain_autoconsumo',
    country: 'Spain',
    flag: 'ES',
    version: '2026.1',
    effectiveFrom: '2019-04-05',
    expiresOn: 'Active (RD 244/2019)',
    regime: 'Compensación Simplificada de Excedentes (RD 244/2019)',
    cityId: 'madrid',
    currency: 'EUR',
    typicalCostPerKwp: 1050,
    importRate: 0.251,
    exportRate: 0.075,
    selfUseTargetPct: 48,
    summary: 'Monthly bill surplus compensation offsets the variable energy portion of your bill down to zero within each monthly billing cycle (no rollover across months). Municipal IBI and regional IRPF deductions depend on municipality eligibility.',
    keyRule: 'Surplus credits cannot exceed the monthly variable energy charge or offset fixed power-capacity (potencia contratada) fees.',
    sourceTitle: 'IDAE (Ministerio para la Transición Ecológica): Autoconsumo RD 244/2019',
    sourceUrl: 'https://www.idae.es/ayudas-y-financiacion/autoconsumo'
  },
  {
    id: 'italy_bonus_casa',
    country: 'Italy',
    flag: 'IT',
    version: '2026.1',
    effectiveFrom: '2025-01-01',
    expiresOn: '2026-12-31',
    regime: 'Detrazione Fiscale 50% (Prima Casa) + GSE RID',
    cityId: 'rome',
    currency: 'EUR',
    typicalCostPerKwp: 1250,
    importRate: 0.314,
    exportRate: 0.090,
    selfUseTargetPct: 45,
    summary: 'Primary residences (prima casa) qualify for a 50% income tax deduction spread across 10 annual installments (36% for non-primary homes), subject to sufficient IRPEF tax liability and GSE Ritiro Dedicato (RID) export taxation.',
    keyRule: 'The 50% deduction is a 10-year tax credit, not an upfront cash rebate; enter only confirmed upfront grants in the Grant field.',
    sourceTitle: 'GSE (Gestore dei Servizi Energetici): Official Ritiro Dedicato Portal',
    sourceUrl: 'https://www.gse.it/servizi-per-te/fotovoltaico/ritiro-dedicato'
  },
  {
    id: 'uk_seg_zero_vat',
    country: 'United Kingdom',
    flag: 'GB',
    version: '2026.1',
    effectiveFrom: '2024-02-01',
    expiresOn: '2027-03-31 (0% VAT window)',
    regime: '0% VAT on Solar & Storage + Smart Export Guarantee (SEG)',
    cityId: 'london',
    currency: 'GBP',
    typicalCostPerKwp: 1450,
    importRate: 0.270,
    exportRate: 0.120,
    selfUseTargetPct: 45,
    summary: '0% VAT applies to residential solar and battery storage installations through March 2027. Export tariffs under the Smart Export Guarantee (SEG) vary widely by supplier and DNO G98/G99 export approval.',
    keyRule: 'Standing daily charges (~60p/day) cannot be avoided unless disconnecting from the grid entirely.',
    sourceTitle: 'Ofgem: Official Smart Export Guarantee (SEG) Regulator Portal',
    sourceUrl: 'https://www.ofgem.gov.uk/environmental-and-social-schemes/smart-export-guarantee-seg'
  },
  {
    id: 'us_ca_nem3',
    country: 'United States (California)',
    flag: 'US',
    version: '2026.1',
    effectiveFrom: '2026-01-01',
    expiresOn: 'Active (CPUC NBT / Post-25D)',
    regime: 'California Net Billing Tariff (NEM 3.0) — Post-25D',
    cityId: 'los_angeles',
    currency: 'USD',
    typicalCostPerKwp: 3100,
    importRate: 0.320,
    exportRate: 0.060,
    selfUseTargetPct: 55,
    summary: 'Under CPUC Net Billing (NEM 3.0), midday Avoided Cost Calculator (ACC) export credits average ~$0.05–$0.07/kWh while retail TOU rates exceed $0.32/kWh. Note: the 30% federal Section 25D homeowner credit expired for expenditures after Dec 31, 2025.',
    keyRule: 'Do not apply the expired 30% federal 25D credit to 2026 customer-owned purchases; verify utility-specific TOU schedules.',
    sourceTitle: 'CPUC: Official California Net Billing Tariff (NEM 3.0) Decision',
    sourceUrl: 'https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/demand-side-management/customer-generation/net-energy-metering-and-net-billing'
  },
  {
    id: 'australia_stc',
    country: 'Australia',
    flag: 'AU',
    version: '2026.1',
    effectiveFrom: '2026-01-01',
    expiresOn: '2030-12-31 (STC deeming phase-down)',
    regime: 'Federal STC Point-of-Sale Discount + State FiTs',
    cityId: 'melbourne',
    currency: 'AUD',
    typicalCostPerKwp: 1150,
    importRate: 0.320,
    exportRate: 0.060,
    selfUseTargetPct: 48,
    summary: 'Small-scale Technology Certificates (STCs) reduce turnkey upfront costs, though the deeming period steps down each January through 2030. Daytime minimum feed-in tariffs in VIC/NSW/SA are low (~A$0.03–A$0.07/kWh).',
    keyRule: 'Check DNSP export limits (often 5 kW per phase) and solar sponge daytime tariffs.',
    sourceTitle: 'Clean Energy Regulator (Gov.au): Small-scale Renewable Energy Scheme',
    sourceUrl: 'https://cer.gov.au/schemes/renewable-energy-target/small-scale-renewable-energy-scheme'
  }
]);



/**
 * V71-01: Strict Utility Bill Decomposer.
 * Preserves fixedAnnual === 0 without coercing 0 to a default fallback!
 * Example: annualBill = 1200, fixedAnnual = 0, annualUsage = 6500 -> trueAvoidableRate = 1200 / 6500 = 0.18461538461538463.
 */
function strictBillNumber(val, name) {
  if (val === null || val === undefined || typeof val === 'boolean' || (typeof val === 'string' && val.trim() === '')) {
    throw new RangeError(`${name} cannot be blank or null`);
  }
  const n = Number(val);
  if (!Number.isFinite(n)) throw new RangeError(`${name} must be a valid number`);
  return n;
}

export function decomposeUtilityBill(params = {}) {
  const gross = strictBillNumber(params.annualBill, 'Annual bill');
  const fixed = strictBillNumber(params.fixedAnnual, 'Fixed annual fees');
  const usage = strictBillNumber(params.annualUsage, 'Annual usage');
  if (gross < 0) throw new RangeError('Annual bill cannot be negative');
  if (fixed < 0) throw new RangeError('Fixed annual fees cannot be negative');
  if (usage <= 0) throw new RangeError('Annual usage must be greater than zero');
  if (fixed > gross) throw new RangeError('Fixed annual charges cannot exceed total gross annual bill');
  const avoidablePool = gross - fixed;
  const grossRatePerKwh = gross / usage;
  const trueAvoidableRatePerKwh = avoidablePool / usage;
  const fixedSharePct = gross > 0 ? (fixed / gross) * 100 : 0;
  return {
    annualBill: gross,
    fixedAnnual: fixed,
    annualUsage: usage,
    avoidablePool,
    grossRatePerKwh,
    trueAvoidableRatePerKwh,
    fixedSharePct
  };
}

/**
 * V71-06: Comprehensive Installer Quote Line-Item & Exclusion Auditor.
 * Evaluates quoted price, equipment compatibility, hidden omissions (scaffolding, AC/DC surge protection, DNO filing, VAT),
 * downside/base/upside NPV, sustained payback, and buyer negotiation questions.
 */
export function auditInstallerQuote(quote, baseInputs, evalForecastFn = null) {
  const kw = Math.max(0.5, Number(quote.kw ?? 5.5));
  const quotedPvCost = Math.max(0, Number(quote.pvCost ?? 7000));
  const battKwh = Math.max(0, Number(quote.batteryKwh ?? 0));
  const quotedBattCost = Math.max(0, Number(quote.batteryCost ?? 0));
  const vatIncluded = quote.vatIncluded !== false;
  const vatPct = Number.isFinite(Number(quote.vatPct)) ? Number(quote.vatPct) : 0;
  const includesScaffolding = quote.includesScaffolding !== false;
  const includesElectricalSpd = quote.includesElectricalSpd !== false;
  const includesGridPermit = quote.includesGridPermit !== false;
  const workmanshipWarrantyYrs = Math.max(0, Number(quote.workmanshipWarrantyYrs ?? 5));

  const fx = REFERENCE_FX_FROM_EUR[baseInputs.currency] || 1;
  let hiddenOmissions = 0;
  const omissionsList = [];
  const negotiationQuestions = [];

  if (!includesScaffolding) {
    const c = Math.round(650 * fx);
    hiddenOmissions += c;
    omissionsList.push(`Scaffolding / Roof Safety Access (+${c} ${baseInputs.currency})`);
    negotiationQuestions.push('Confirm in writing whether roof scaffolding, edge fall-protection, and crane/hoist lift are included in the turnkey price.');
  }
  if (!includesElectricalSpd) {
    const c = Math.round(420 * fx);
    hiddenOmissions += c;
    omissionsList.push(`AC/DC Type-2 Surge Protection & Sub-panel (+${c} ${baseInputs.currency})`);
    negotiationQuestions.push('Does the quote include both DC and AC Type-1/2 Surge Protection Devices (SPD), smart meter CT clamp wiring, and main board upgrades?');
  }
  if (!includesGridPermit) {
    const c = Math.round(350 * fx);
    hiddenOmissions += c;
    omissionsList.push(`DNO / Net-Billing Connection Filing (+${c} ${baseInputs.currency})`);
    negotiationQuestions.push('Is the utility grid-connection application (e.g. ΔΕΔΔΗΕ / DNO G98-G99 / Net-Billing contract engineering stamp) included turnkey?');
  }
  if (!vatIncluded && vatPct > 0) {
    const vatAdd = Math.round((quotedPvCost + quotedBattCost) * (vatPct / 100));
    hiddenOmissions += vatAdd;
    omissionsList.push(`Unquoted VAT ${vatPct}% (+${vatAdd} ${baseInputs.currency})`);
    negotiationQuestions.push(`Clarify whether the quoted figure includes ${vatPct}% VAT or qualifies for statutory VAT exemption.`);
  }
  if (workmanshipWarrantyYrs < 5) {
    negotiationQuestions.push(`Workmanship warranty is only ${workmanshipWarrantyYrs} yrs; ask for at least a 5-to-10 year roof-penetration and labor warranty.`);
  }
  if (negotiationQuestions.length === 0) {
    negotiationQuestions.push('Request exact manufacturer SKU numbers on the final contract so lower-tier substitute panels/inverters cannot be swapped on install day.');
  }

  const effectivePvCost = quotedPvCost + hiddenOmissions;
  const ratio = kw / Math.max(0.1, baseInputs.peakKw);
  const testInputs = {
    ...baseInputs,
    peakKw: kw,
    systemCost: effectivePvCost,
    batteryKwh: battKwh,
    batteryCost: quotedBattCost,
    grant: Math.min(baseInputs.grant, effectivePvCost + quotedBattCost)
  };

  const runEval = evalForecastFn || ((inp, mult = 1) => {
    const est = estimateMonthlyProduction(inp);
    return calculateForecast(est.monthlyKwh, inp, mult);
  });

  const baseFc = runEval(testInputs, 1.0);
  const downsideFc = runEval({ ...testInputs, importRate: testInputs.importRate * 0.9 }, 0.9);
  const upsideFc = runEval({ ...testInputs, importRate: testInputs.importRate * 1.1 }, 1.1);

  return {
    name: String(quote.name || 'Installer Quote'),
    kw,
    quotedPvCost,
    battKwh,
    quotedBattCost,
    hiddenOmissions,
    effectiveTotalCapex: effectivePvCost + quotedBattCost,
    pricePerWatt: effectivePvCost / (kw * 1000),
    omissionsList,
    negotiationQuestions,
    completenessScorePct: Math.max(40, 100 - omissionsList.length * 15),
    baseFc,
    downsideNpv: downsideFc.npv,
    baseNpv: baseFc.npv,
    upsideNpv: upsideFc.npv,
    sustainedPayback: baseFc.sustainedSimplePayback,
    firstPayback: baseFc.firstSimplePayback,
    mirrPct: baseFc.mirrPct
  };
}


/**
 * P0-6: Document & Text Field Extractor with Field-Level Confidence Scoring.
 * Parses uploaded or pasted contractor quote / electricity bill text, JSON, or CSV lines
 * and flags every extracted value with confidence ('high' | 'medium' | 'low') and userConfirmed: false.
 */
export function extractQuoteFieldsFromText(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('Empty document or quote text.');
  const fields = [];
  const addField = (key, value, unit, confidence, sourceSnippet) => {
    fields.push({ key, value, unit, confidence, userConfirmed: false, sourceSnippet: String(sourceSnippet || '').slice(0, 80) });
  };

  // Check if JSON
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (Number.isFinite(Number(obj.kw || obj.peakKw))) addField('peakKw', Number(obj.kw || obj.peakKw), 'kWp', 'high', 'JSON peakKw');
      if (Number.isFinite(Number(obj.pvCost || obj.systemCost))) addField('pvCost', Number(obj.pvCost || obj.systemCost), 'currency', 'high', 'JSON pvCost');
      if (Number.isFinite(Number(obj.batteryKwh))) addField('batteryKwh', Number(obj.batteryKwh), 'kWh', 'high', 'JSON batteryKwh');
      if (Number.isFinite(Number(obj.batteryCost))) addField('batteryCost', Number(obj.batteryCost), 'currency', 'high', 'JSON batteryCost');
      if (Number.isFinite(Number(obj.annualBill))) addField('annualBill', Number(obj.annualBill), 'currency/yr', 'high', 'JSON annualBill');
      if (Number.isFinite(Number(obj.fixedAnnual))) addField('fixedAnnual', Number(obj.fixedAnnual), 'currency/yr', 'high', 'JSON fixedAnnual');
      return { format: 'json', fields, requiresUserConfirmation: true };
    } catch {}
  }

  // Regex extraction from unstructured quote/bill text
  const kwMatch = /(\d+(?:[.,]\d+)?)\s*(?:kWp|kwp|kW\s+peak|kW\s+solar|kW\s+PV)/i.exec(text);
  if (kwMatch) addField('peakKw', Number(kwMatch[1].replace(',', '.')), 'kWp', 'high', kwMatch[0]);

  const battMatch = /(\d+(?:[.,]\d+)?)\s*kWh\s*(?:battery|storage|LFP|usable|\u03bc\u03c0\u03b1\u03c4\u03b1\u03c1\u03af\u03b1)/i.exec(text);
  if (battMatch) addField('batteryKwh', Number(battMatch[1].replace(',', '.')), 'kWh', 'medium', battMatch[0]);

  const costMatch = /(?:total|turnkey|pv\s+price|system\s+cost|\u03c3\u03cd\u03bd\u03bf\u03bb\u03bf|\u03ba\u03cc\u03c3\u03c4\u03bf\u03c2)[^0-9\n]{0,25}(?:[\u20ac$\u00a3]\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{4,6})/i.exec(text);
  if (costMatch) {
    const normalized = Number(costMatch[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    if (Number.isFinite(normalized) && normalized > 300) addField('pvCost', normalized, 'currency', 'medium', costMatch[0]);
  }

  const scafExcluded = /(?:exclude[sd]?|not\s+included|without|\u03b4\u03b5\u03bd\s+\u03c0\u03b5\u03c1\u03b9\u03bb\u03b1\u03bc\u03b2\u03ac\u03bd\u03b5\u03b9)[^.\n]{0,40}(?:scaffold|crane|\u03c3\u03ba\u03b1\u03bb\u03c9\u03c3\u03b9)|(?:scaffold\w*|crane|\u03c3\u03ba\u03b1\u03bb\u03c9\u03c3\u03b9\w*)[^.\n]{0,40}(?:exclude[sd]?|not\s+included|extra)/i.test(text);
  if (scafExcluded) addField('includesScaffolding', false, 'boolean', 'high', 'Scaffolding excluded notice');

  const spdExcluded = /(?:exclude[sd]?|not\s+included|without)[^.\n]{0,40}(?:SPD|surge|\u03b1\u03bd\u03c4\u03b9\u03ba\u03b5\u03c1\u03b1\u03c5\u03bd)|(?:SPD|surge|\u03b1\u03bd\u03c4\u03b9\u03ba\u03b5\u03c1\u03b1\u03c5\u03bd\w*)[^.\n]{0,40}(?:exclude[sd]?|not\s+included|extra)/i.test(text);
  if (spdExcluded) addField('includesElectricalSpd', false, 'boolean', 'high', 'SPD excluded notice');

  return {
    format: 'text',
    fields,
    requiresUserConfirmation: true
  };
}

/**
 * P0-6 & V71-10: Pure Dependency-Free Binary PDF 1.4 Report Generator.
 * Produces a valid, multi-section downloadable PDF file (Uint8Array) containing:
 * - Header & Provenance Status (Dataset, Hash, Model Version, Verified vs Illustrative status)
 * - Utility Bill Decomposition (Gross, Fixed Non-Avoidable, True Avoidable /kWh)
 * - Side-by-Side 3-Quote Comparison (Capex, Hidden Exclusions, Downside/Base/Upside NPV, Sustained Payback)
 * - 25-Year Cash-Flow Summary & Key Installer Questions
 */
export function generateDecisionReportPDF(report) {
  const ascii = str => String(str ?? '')
    .replace(/\u20ac/g, 'EUR ')
    .replace(/\u00a3/g, 'GBP ')
    .replace(/\u00b2/g, '2')
    .replace(/\u00b0/g, ' deg')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?');

  const pdfEscape = str => ascii(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const lines = [];
  const addLine = (text, size = 10, bold = false, indent = 40, gap = 14) => {
    lines.push({ text: pdfEscape(text), size, bold, indent, gap });
  };

  addLine(`SOLARPAYBACK AURORA v${ENGINE_VERSION} - INDEPENDENT SOLAR QUOTE & BILL REPORT`, 13, true, 40, 18);
  addLine(`Location: ${report.location || 'Athens, Greece'} | Generated: ${report.generatedAt || new Date().toISOString()}`, 9, false, 40, 13);
  addLine(`Data Provenance: ${report.provenanceLabel || 'Illustrative Reference'} | Verified Provider: ${report.verifiedProvider ? 'YES' : 'NO (Illustrative)'}`, 9, true, 40, 16);
  addLine(`Dataset: ${report.dataset || 'Reference Curve'} | Array: ${report.peakKw} kWp | Storage: ${report.batteryKwh} kWh | Currency: ${report.currency}`, 9, false, 40, 18);

  addLine('1. EXECUTIVE VERDICT & PAYBACK CONTINUITY', 11, true, 40, 16);
  addLine(`- Sustained Simple Payback: ${report.sustainedPayback} | First-Cross Payback: ${report.firstPayback} | Interrupted: ${report.paybackInterrupted ? 'YES' : 'NO'}`, 9.5, false, 48, 13);
  addLine(`- 25-Year Net Present Value (NPV): ${report.npvText} | IRR: ${report.irrText} | MIRR: ${report.mirrText} | Solar LCOE: ${report.lcoeText}`, 9.5, false, 48, 13);
  addLine(`- Evidence Confirmation Status: ${report.evidenceStatus || 'Preliminary - User Confirmation Required'}`, 9.5, false, 48, 18);

  addLine('2. UTILITY BILL DECOMPOSITION (AVOIDABLE VS NON-AVOIDABLE)', 11, true, 40, 16);
  addLine(`- Gross Annual Bill: ${report.billGrossText} | Fixed Non-Avoidable Charges: ${report.billFixedText} (${report.billFixedShareText})`, 9.5, false, 48, 13);
  addLine(`- Gross Apparent Rate: ${report.billGrossRateText} -> True Avoidable Volumetric Rate: ${report.billAvoidableRateText}`, 9.5, true, 48, 18);

  addLine('3. SIDE-BY-SIDE INSTALLER QUOTE & HIDDEN EXCLUSION AUDIT', 11, true, 40, 16);
  for (const q of (report.quotes || [])) {
    addLine(`* ${q.name}: ${q.kw} kWp PV + ${q.batteryKwh} kWh Batt | Quoted: ${q.quotedText} | Hidden Omissions: ${q.omissionsText} -> Effective: ${q.effectiveText}`, 9, true, 48, 12);
    addLine(`  Downside / Base / Upside NPV: ${q.downsideText} / ${q.baseText} / ${q.upsideText} | Sustained Payback: ${q.paybackText}`, 9, false, 54, 14);
  }

  addLine('4. KEY QUESTIONS TO ASK INSTALLERS BEFORE SIGNING', 11, true, 40, 16);
  for (const qText of (report.questions || []).slice(0, 5)) {
    addLine(`- ${qText.slice(0, 105)}`, 8.8, false, 48, 12);
  }

  addLine('5. SELECTED MILESTONE YEARS FROM 25-YEAR CASH-FLOW LEDGER', 11, true, 40, 16);
  addLine('Year | PV Output (kWh) | Self-Used (kWh) | Exported (kWh) | Net Cash Flow | Cumulative Balance | Discounted Cum.', 8.5, true, 48, 12);
  for (const yr of (report.milestoneYears || [])) {
    addLine(`Yr ${String(yr.year).padStart(2, ' ')} | ${String(Math.round(yr.generation)).padStart(14, ' ')} | ${String(Math.round(yr.selfUsed)).padStart(14, ' ')} | ${String(Math.round(yr.exported)).padStart(13, ' ')} | ${String(yr.cashflowText).padStart(13, ' ')} | ${String(yr.cumulativeText).padStart(18, ' ')} | ${String(yr.discCumulativeText).padStart(15, ' ')}`, 8.2, false, 48, 11);
  }

  addLine('Disclaimer: Mathematical model based on stated inputs. Does not replace an on-site structural roof survey or utility contract.', 8, false, 40, 14);

  // Build content stream
  let y = 760;
  const streamOps = ['BT'];
  for (const item of lines) {
    y -= item.gap;
    if (y < 40) break;
    const font = item.bold ? '/F2' : '/F1';
    streamOps.push(`${font} ${item.size} Tf`);
    streamOps.push(`1 0 0 1 ${item.indent} ${y} Tm`);
    streamOps.push(`(${item.text}) Tj`);
  }
  streamOps.push('ET');
  const streamContent = streamOps.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}


/**
 * P0-7: Binary PDF Text Stream Parser (extracts text from uploaded .pdf invoices & installer quotes).
 * Parses PDF parenthesized literals (...) Tj and [...] TJ arrays and computes a deterministic document hash.
 */
export function extractTextFromPdfBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 8) throw new Error('File is too small to be a valid PDF.');
  const raw = new TextDecoder('latin1').decode(u8);
  if (!raw.startsWith('%PDF-')) throw new Error('Uploaded file does not have a valid %PDF- header.');

  const chunks = [];
  // Extract text from parenthesized PDF string literals inside BT ... ET blocks or general streams
  const literalRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|")/g;
  let m;
  while ((m = literalRegex.exec(raw)) !== null) {
    const cleaned = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (cleaned.trim()) chunks.push(cleaned.trim());
  }
  // Also extract TJ array literals: [(text) -20 (more)] TJ
  const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
  while ((m = tjArrayRegex.exec(raw)) !== null) {
    const inner = m[1];
    const subLit = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
    let sm;
    const parts = [];
    while ((sm = subLit.exec(inner)) !== null) {
      parts.push(sm[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')'));
    }
    if (parts.length) chunks.push(parts.join(''));
  }

  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) {
    h ^= u8[i];
    h = Math.imul(h, 0x01000193);
  }
  const docHash = ('0000000' + (h >>> 0).toString(16)).slice(-8);
  const extractedText = chunks.join(' ').trim();
  return {
    documentHash: docHash,
    byteLength: u8.length,
    extractedText,
    extractedFields: extractedText ? extractQuoteFieldsFromText(extractedText) : { format: 'pdf-empty', fields: [], requiresUserConfirmation: true }
  };
}
