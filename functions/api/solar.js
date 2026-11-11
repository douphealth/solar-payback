/**
 * Cloudflare Pages Function: trusted same-origin PVGIS 5.3 proxy.
 * JRC explicitly disallows browser AJAX. This proxy also validates all inputs,
 * normalizes the response, and caches successful model runs for one day.
 */
const SOURCE = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';

export function parseParams(searchParams) {
  const limits = {
    lat: [-90, 90], lon: [-180, 180], peakpower: [0.1, 1000],
    loss: [0, 45], angle: [0, 90], aspect: [-180, 180],
  };
  const result = {};
  for (const [key, [min, max]] of Object.entries(limits)) {
    const raw = searchParams.get(key);
    if (raw === null || raw.trim() === '') throw new RangeError(`Missing required parameter: ${key}`);
    const number = Number(raw);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new RangeError(`${key} must be between ${min} and ${max}`);
    }
    result[key] = Number(number.toFixed(5));
  }
  return result;
}

export function normalizePVGIS(data) {
  const rows = data?.outputs?.monthly?.fixed;
  const annual = Number(data?.outputs?.totals?.fixed?.E_y);
  if (!Array.isArray(rows) || rows.length !== 12 || !Number.isFinite(annual) || annual <= 0) {
    throw new Error('PVGIS returned an incomplete fixed-tilt production dataset');
  }
  const months = rows.map((row) => ({
    month: Number(row.month),
    kwh: Number(row.E_m),
    variabilityKwh: Number.isFinite(Number(row.SD_m)) ? Number(row.SD_m) : null,
  })).sort((a, b) => a.month - b.month);
  if (months.some((row, i) => row.month !== i + 1 || !Number.isFinite(row.kwh) || row.kwh < 0)) {
    throw new Error('PVGIS returned invalid monthly production values');
  }
  const summed = months.reduce((n, row) => n + row.kwh, 0);
  if (Math.abs(summed - annual) > Math.max(2, annual * .025)) {
    throw new Error('PVGIS annual and monthly totals disagree');
  }
  return {
    provider: 'European Commission JRC / PVGIS',
    version: '5.3',
    dataset: data?.inputs?.meteo_data?.radiation_db || 'PVGIS default for coordinates',
    weatherPeriod: {
      from: data?.inputs?.meteo_data?.year_min ?? null,
      to: data?.inputs?.meteo_data?.year_max ?? null,
    },
    monthly: months,
    annualKwh: summed,
    uncertainty: 'Historical resource model, not measured rooftop production or an installer guarantee',
  };
}

const reply = (data, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  },
});

export async function onRequestGet({ request }) {
  let params;
  try {
    params = parseParams(new URL(request.url).searchParams);
  } catch (err) {
    return reply({ error: err.message, code: 'BAD_INPUT' }, 400);
  }
  // Only the server constructs the upstream URL. Users cannot choose a host.
  const upstream = new URL(SOURCE);
  Object.entries(params).forEach(([key, value]) => upstream.searchParams.set(key, String(value)));
  upstream.searchParams.set('outputformat', 'json');
  upstream.searchParams.set('mountingplace', 'free');
  upstream.searchParams.set('usehorizon', '1');
  upstream.searchParams.set('pvtechchoice', 'crystSi');

  try {
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    const cacheKey = new Request(upstream.toString());
    if (cache) {
      // Cache availability must never decide whether a valid calculation succeeds.
      try {
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
      } catch { /* best-effort cache */ }
    }
    const response = await fetch(upstream.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(16000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      // 429 and 529 both signal a temporary capacity limit at JRC.
      const retry = response.status === 429 || response.status === 529;
      return reply({ error: retry ? 'Solar data provider is busy; retry shortly' : 'PVGIS could not calculate this location or configuration',
        code: retry ? 'PROVIDER_BUSY' : 'PROVIDER_ERROR', providerStatus: response.status },
      retry ? 503 : 502);
    }
    const raw = await response.json();
    const normalized = normalizePVGIS(raw);
    const result = reply({ ...normalized, inputs: params, retrievedAt: new Date().toISOString() },
      200, 'public, max-age=900, s-maxage=86400');
    if (cache) {
      try { await cache.put(cacheKey, result.clone()); }
      catch { /* best-effort cache */ }
    }
    return result;
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? 'PVGIS request timed out' : 'PVGIS is temporarily unavailable';
    return reply({ error: message, code: 'PROVIDER_UNAVAILABLE' }, 503);
  }
}
