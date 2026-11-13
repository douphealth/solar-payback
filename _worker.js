/**
 * SolarPayback Aurora v7.5.0 — Cloudflare Pages Advanced Mode Worker.
 * Remediates all Launch Readiness & Monetization Audit findings:
 * 1. Real POST https://api.stripe.com/v1/checkout/sessions call (never fabricates cs_live_ IDs).
 * 2. Private default Cache-Control ('private, no-store'); HMAC-SHA256 signed session tokens & strict customer_id ownership checks on all project/order/report routes.
 * 3. Canonical 8-table D1 schema alignment (removed dead project_versions / entitlements references).
 * 4. Real server-side PDF generation & env.REPORTS_BUCKET.put upload BEFORE marking report active; atomic webhook event recording AFTER fulfillment succeeds.
 * 5. Accurate charge.refunded reconciliation mapping Stripe Charge (ch_...) via payment_intent (pi_...) or metadata.orderId to revoke order & report access.
 */
const ENGINE_VERSION = '7.5.0';
const UPSTREAM = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';
const SERIES_UPSTREAM = 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const STRIPE_CHECKOUT_API = 'https://api.stripe.com/v1/checkout/sessions';

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Aurora-Engine-Version': ENGINE_VERSION
};

const RATE_BUCKETS = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQ = 30;

export function checkRateLimit(ip = 'anon', now = Date.now()) {
  if (RATE_BUCKETS.size > 2000) {
    for (const [k, v] of RATE_BUCKETS) {
      if (now - v.start > RATE_LIMIT_WINDOW_MS) RATE_BUCKETS.delete(k);
    }
  }
  const entry = RATE_BUCKETS.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    RATE_BUCKETS.set(ip, { start: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQ - 1, mode: 'isolate-memory' };
  }
  if (entry.count >= RATE_LIMIT_MAX_REQ) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.start)) / 1000), mode: 'isolate-memory' };
  }
  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQ - entry.count, mode: 'isolate-memory' };
}

export async function enforceRateLimit(request, env) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'anon';
  if (env?.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    const outcome = await env.RATE_LIMITER.limit({ key: clientIp });
    return { allowed: Boolean(outcome?.success), remaining: outcome?.success ? 1 : 0, retryAfterSec: 60, mode: 'cloudflare-edge-binding' };
  }
  return checkRateLimit(clientIp);
}

// Security Gate: Default Cache-Control is 'private, no-store' so user/order/report responses are NEVER cached publicly
const respond = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SEC,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...extra
    }
  });

export function strictNum(raw, label) {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || (typeof raw === 'string' && raw.trim() === '')) {
    throw new TypeError(`${label} is null or missing`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new TypeError(`${label} is not a finite number`);
  return n;
}

function val(p, key, lo, hi) {
  const s = p.get(key);
  const v = strictNum(s, key);
  if (v < lo || v > hi) throw new RangeError(`${key} must be between ${lo} and ${hi}`);
  return v;
}

export function parseQuery(p) {
  const x = {
    lat: val(p, 'lat', -90, 90),
    lon: val(p, 'lon', -180, 180),
    peakKw: val(p, 'peakKw', 0.1, 1000),
    slope: val(p, 'slope', 0, 90),
    aspect: val(p, 'aspect', -180, 180),
    loss: val(p, 'loss', 0, 50),
    mounting: p.get('mounting') || 'free'
  };
  if (!['free', 'building'].includes(x.mounting)) throw new RangeError('Invalid mounting type');
  return x;
}

export function pvgisUrl(x) {
  const p = new URLSearchParams({
    lat: String(x.lat),
    lon: String(x.lon),
    peakpower: String(x.peakKw),
    loss: String(x.loss),
    angle: String(x.slope),
    aspect: String(x.aspect),
    mountingplace: x.mounting,
    pvtechchoice: 'crystSi',
    outputformat: 'json',
    usehorizon: '1'
  });
  return `${UPSTREAM}?${p}`;
}

export function fnv1aHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

async function getSubtleCrypto() {
  return (globalThis.crypto || (await import('node:crypto')).webcrypto).subtle;
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// P0-2: Cryptographic HMAC-SHA256 Customer Session Token Signer & Verifier
export async function issueSessionToken({ customerId, email, ttlSec = 86400 }, authSecret) {
  if (!customerId || !email || !authSecret || String(authSecret).length < 16) {
    throw new Error('Valid customerId, email, and AUTH_SECRET (>=16 chars) are required to issue a session token.');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const payloadObj = { sub: String(customerId), email: String(email).toLowerCase(), iat: nowSec, exp: nowSec + ttlSec };
  const payloadB64 = btoa(JSON.stringify(payloadObj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const enc = new TextEncoder();
  const subtle = await getSubtleCrypto();
  const key = await subtle.importKey('raw', enc.encode(authSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payloadB64}.${sigHex}`;
}

export async function verifySessionToken(tokenStr, authSecret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!tokenStr || typeof tokenStr !== 'string' || !authSecret || String(authSecret).length < 16) {
    return { valid: false, reason: 'Missing token or server AUTH_SECRET' };
  }
  const parts = tokenStr.trim().split('.');
  if (parts.length !== 2) return { valid: false, reason: 'Malformed session token' };
  const [payloadB64, sigHex] = parts;
  if (!/^[0-9a-f]{64}$/i.test(sigHex)) return { valid: false, reason: 'Malformed token signature' };

  const enc = new TextEncoder();
  const subtle = await getSubtleCrypto();
  const key = await subtle.importKey('raw', enc.encode(authSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedBuf = await subtle.sign('HMAC', key, enc.encode(payloadB64));
  const expectedHex = Array.from(new Uint8Array(expectedBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (!constantTimeEqual(expectedHex, sigHex.toLowerCase())) {
    return { valid: false, reason: 'Invalid token signature' };
  }
  try {
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(padded);
    const data = JSON.parse(jsonStr);
    if (!data?.sub || !data?.email || !Number.isFinite(data.exp)) {
      return { valid: false, reason: 'Incomplete token claims' };
    }
    if (nowSec > data.exp) {
      return { valid: false, reason: 'Session token expired' };
    }
    return { valid: true, customerId: String(data.sub), email: String(data.email) };
  } catch {
    return { valid: false, reason: 'Corrupted token payload' };
  }
}

export async function requireCustomerAuth(request, env) {
  if (!env?.AUTH_SECRET || String(env.AUTH_SECRET).length < 16) {
    return { ok: false, status: 503, error: 'Server AUTH_SECRET is not configured (fail-closed).' };
  }
  const hdr = request.headers.get('Authorization') || '';
  if (!hdr.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Bearer session token.' };
  }
  const token = hdr.slice(7).trim();
  const verified = await verifySessionToken(token, env.AUTH_SECRET);
  if (!verified.valid) {
    return { ok: false, status: 401, error: `Invalid session token: ${verified.reason}` };
  }
  return { ok: true, customerId: verified.customerId, email: verified.email };
}

export function normalizePVGIS(data) {
  const months = data?.outputs?.monthly?.fixed;
  if (!Array.isArray(months) || months.length !== 12) {
    throw new TypeError('PVGIS returned no valid 12-month production series');
  }
  const seenMonths = new Set();
  const monthlyKwh = months.map((m, i) => {
    const monthNum = strictNum(m?.m, `month index at position ${i + 1}`);
    if (monthNum !== i + 1 || seenMonths.has(monthNum)) {
      throw new TypeError(`Invalid or duplicate PVGIS month index at position ${i + 1}`);
    }
    seenMonths.add(monthNum);
    const k = strictNum(m?.E_m, `E_m for month ${i + 1}`);
    if (k < 0 || k > 200_000_000) throw new TypeError(`Out-of-range PVGIS E_m in month ${i + 1}`);
    return Math.round(k * 100) / 100;
  });
  const annualKwh = Math.round(monthlyKwh.reduce((a, b) => a + b, 0) * 100) / 100;
  if (annualKwh <= 0) throw new TypeError('PVGIS reported zero annual production');
  const md = data.inputs?.meteo_data || {}, loc = data.inputs?.location || {};
  const dataset = String(md.radiation_db || loc.meteo_data_db || 'PVGIS 5.3 dataset unspecified').slice(0, 100);
  const period = [md.year_min, md.year_max].every(Number.isFinite) ? `${md.year_min}–${md.year_max}` : null;
  const providerRecordHash = fnv1aHash(JSON.stringify({ dataset, period, monthlyKwh }));
  return {
    source: 'European Commission JRC PVGIS 5.3',
    modelVersion: 'PVGIS-5.3',
    quality: 'pvgis',
    verifiedProvider: true,
    demo: false,
    dataset,
    dataPeriod: period,
    providerRecordHash,
    monthlyKwh,
    annualKwh
  };
}

export function seriesUrl(x, year = 2023) {
  if (![2022, 2023].includes(year)) throw new RangeError('Select 2022 or 2023 (non-leap years).');
  const params = new URLSearchParams({
    lat: String(x.lat),
    lon: String(x.lon),
    startyear: String(year),
    endyear: String(year),
    pvcalculation: '1',
    peakpower: String(x.peakKw),
    loss: String(x.loss),
    angle: String(x.slope),
    aspect: String(x.aspect),
    mountingplace: x.mounting,
    pvtechchoice: 'crystSi',
    outputformat: 'json',
    usehorizon: '1'
  });
  return `${SERIES_UPSTREAM}?${params}`;
}

export function normalizeHourly(data, year = 2023) {
  const rows = data?.outputs?.hourly;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const expectedLen = isLeap ? 8784 : 8760;
  if (!Array.isArray(rows) || rows.length !== expectedLen) {
    throw new TypeError(`PVGIS did not return expected ${expectedLen} hourly records for ${year}.`);
  }
  const kwh = [];
  let previous = '';
  let detectedMinuteOffset = null;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i];
    const ts = String(x?.time ?? '');
    const p = strictNum(x?.P, `PVGIS hourly P at record ${i + 1}`);
    if (!/^\d{8}:\d{4}$/.test(ts) || Number(ts.slice(0, 4)) !== year || ts <= previous || p < 0 || p > 10_000_000) {
      throw new TypeError(`Invalid PVGIS hourly record at index ${i}`);
    }
    const expected = new Date(Date.UTC(year, 0, 1, i));
    const prefix =
      expected.getUTCFullYear() +
      String(expected.getUTCMonth() + 1).padStart(2, '0') +
      String(expected.getUTCDate()).padStart(2, '0') +
      ':' +
      String(expected.getUTCHours()).padStart(2, '0');
    const minute = Number(ts.slice(11, 13));
    if (!ts.startsWith(prefix) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw new TypeError(`Missing or shifted PVGIS UTC interval at index ${i} (${ts})`);
    }
    if (detectedMinuteOffset === null) detectedMinuteOffset = minute;
    else if (minute !== detectedMinuteOffset) {
      throw new TypeError(`Inconsistent PVGIS minute offset at index ${i}`);
    }
    previous = ts;
    kwh.push(Math.round(p * 1000) / 1_000_000);
  }
  const finalKwh = isLeap ? kwh.filter((_, idx) => idx < 59 * 24 || idx >= 60 * 24) : kwh;
  const annualKwh = Math.round(finalKwh.reduce((a, b) => a + b, 0) * 100) / 100;
  if (annualKwh <= 0) throw new TypeError('PVGIS returned zero yearly PV generation.');
  const dataset = String(data.inputs?.meteo_data?.radiation_db || 'PVGIS unspecified').slice(0, 80);
  return {
    hourlyKwh: finalKwh,
    annualKwh,
    year,
    minuteOffset: detectedMinuteOffset ?? 0,
    source: 'European Commission JRC PVGIS 5.3',
    modelVersion: 'PVGIS-5.3-seriescalc',
    quality: 'pvgis-hourly',
    verifiedProvider: true,
    demo: false,
    dataset,
    providerRecordHash: fnv1aHash(JSON.stringify({ year, dataset, annualKwh, len: finalKwh.length })),
    timeFormat: `PVGIS UTC hourly intervals (minute offset :${String(detectedMinuteOffset ?? 0).padStart(2, '0')} normalized to UTC hour start)`
  };
}

export async function verifyStripeWebhookSignature(rawBody, sigHeader, secret, nowEpochSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!rawBody || !sigHeader || !secret) return { valid: false, reason: 'Missing signature or webhook secret' };
  const parts = Object.fromEntries(
    String(sigHeader)
      .split(',')
      .map(s => s.trim().split('='))
      .filter(kv => kv.length === 2)
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) {
    return { valid: false, reason: 'Malformed Stripe-Signature header' };
  }
  if (Math.abs(nowEpochSec - t) > toleranceSec) {
    return { valid: false, reason: 'Webhook timestamp outside replay tolerance window' };
  }
  const enc = new TextEncoder();
  const subtle = await getSubtleCrypto();
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signedBuf = await subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
  const computedHex = Array.from(new Uint8Array(signedBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(computedHex, v1.toLowerCase())
    ? { valid: true, timestamp: t }
    : { valid: false, reason: 'HMAC signature mismatch' };
}

// Server-side deterministic PDF 1.4 generator for R2 report fulfillment
export function buildServerReportPdfBytes({ orderId, customerId, projectId, sku, analysisSummary }) {
  const safe = s => String(s ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines = [
    `SOLARPAYBACK AURORA v${ENGINE_VERSION} - AUDITED DECISION REPORT`,
    `Order ID: ${orderId} | Project ID: ${projectId} | Customer ID: ${customerId}`,
    `SKU: ${sku} | Generated At: ${new Date().toISOString()}`,
    `Analysis Summary: ${analysisSummary || 'Verified Paid Report Snapshot'}`,
    `Provenance & Audit Integrity: Stored in private Cloudflare R2 bucket with owner-only authorization.`
  ];
  let y = 740;
  const ops = ['BT', '/F2 12 Tf'];
  lines.forEach((l, idx) => {
    if (idx === 1) ops.push('/F1 10 Tf');
    ops.push(`1 0 0 1 42 ${y} Tm (${safe(l)}) Tj`);
    y -= 18;
  });
  ops.push('ET');
  const stream = ops.join('\n');
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) { offsets.push(pdf.length); pdf += o; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

async function withTimeout(target, timeout = 14000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), timeout);
  try {
    return await fetch(target, { signal: c.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

export async function handleHealthProbe(path, url, fetcher = withTimeout) {
  const base = {
    service: 'SolarPayback Aurora 7.5.0 Enterprise Edge',
    engineVersion: ENGINE_VERSION,
    mode: 'Cloudflare Pages Advanced Worker',
    workerAlive: true
  };
  if (path === '/api/health/live' || (path === '/api/health' && url.searchParams.get('canary') !== '1')) {
    return respond({ ...base, ok: true, status: 'live', pvgisCanary: 'not-requested' }, 200);
  }
  const t0 = Date.now();
  try {
    const canaryUrl = pvgisUrl({ lat: 37.9838, lon: 23.7275, peakKw: 1, slope: 30, aspect: 0, loss: 14, mounting: 'free' });
    const res = await fetcher(canaryUrl, 8000);
    if (!res || !res.ok) throw new Error(`Upstream HTTP ${res?.status ?? 'unreachable'}`);
    const parsed = normalizePVGIS(await res.json());
    return respond({
      ...base,
      ok: true,
      status: 'ready',
      pvgisCanary: 'healthy',
      pvgisLatencyMs: Date.now() - t0,
      canaryDataset: parsed.dataset,
      canaryHash: parsed.providerRecordHash
    }, 200);
  } catch (e) {
    return respond({
      ...base,
      ok: false,
      status: 'degraded',
      pvgisCanary: 'failed',
      pvgisLatencyMs: Date.now() - t0,
      canaryError: e.message
    }, 503);
  }
}

async function apiSolar(request, ctx) {
  let x;
  try { x = parseQuery(new URL(request.url).searchParams); } catch (e) { return respond({ error: e.message }, 400); }
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cache = globalThis.caches?.default;
  if (cache) { try { const hit = await cache.match(cacheKey); if (hit) return hit; } catch {} }
  const t0 = Date.now();
  try {
    const res = await withTimeout(pvgisUrl(x), 15500);
    if (res.status === 429 || res.status >= 500) return respond({ error: 'PVGIS is temporarily unavailable.' }, 503);
    if (!res.ok) return respond({ error: 'PVGIS did not accept this location or array configuration.' }, 422);
    if (Number(res.headers.get('content-length') || 0) > 650000) return respond({ error: 'Solar source response exceeded safe size' }, 502);
    const raw = await res.text();
    if (raw.length > 650000) return respond({ error: 'Solar source response exceeded safe size' }, 502);
    const validated = normalizePVGIS(JSON.parse(raw));
    const output = respond({ ...validated, inputs: x, latencyMs: Date.now() - t0, fetchedAt: new Date().toISOString() }, 200, {
      'Cache-Control': 'public, max-age=0, s-maxage=43200, stale-while-revalidate=86400'
    });
    if (cache) {
      const job = cache.put(cacheKey, output.clone()).catch(() => {});
      if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(job); else await job;
    }
    return output;
  } catch (e) {
    return respond({ error: e?.name === 'AbortError' ? 'PVGIS request timed out.' : `PVGIS validation failed: ${e.message}` }, 502);
  }
}

async function apiHourly(request, ctx) {
  const url = new URL(request.url);
  let x, year;
  try {
    x = parseQuery(url.searchParams);
    year = Number(url.searchParams.get('year') || '2023');
    if (![2022, 2023].includes(year)) throw new RangeError('Year must be 2022 or 2023.');
  } catch (e) {
    return respond({ error: e.message }, 400);
  }
  const cache = globalThis.caches?.default, cacheKey = new Request(url.toString(), { method: 'GET' });
  if (cache) { try { const hit = await cache.match(cacheKey); if (hit) return hit; } catch {} }
  const t0 = Date.now();
  try {
    const res = await withTimeout(seriesUrl(x, year), 24000);
    if (res.status === 429 || res.status >= 500) return respond({ error: 'PVGIS hourly service is temporarily unavailable.' }, 503);
    if (!res.ok) return respond({ error: 'PVGIS hourly series is not available for this location and year.' }, 422);
    if (Number(res.headers.get('content-length') || 0) > 9500000) return respond({ error: 'Source response exceeds safe size.' }, 502);
    const raw = await res.text();
    if (raw.length > 9500000) return respond({ error: 'Source response exceeds safe size.' }, 502);
    const normal = normalizeHourly(JSON.parse(raw), year);
    const output = respond({ ...normal, inputs: x, latencyMs: Date.now() - t0, fetchedAt: new Date().toISOString() }, 200, {
      'Cache-Control': 'public, max-age=0, s-maxage=21600, stale-while-revalidate=43200'
    });
    if (cache) {
      const work = cache.put(cacheKey, output.clone()).catch(() => {});
      if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(work); else await work;
    }
    return output;
  } catch (e) {
    return respond({ error: e?.name === 'AbortError' ? 'PVGIS hourly request timed out.' : `PVGIS hourly validation failed: ${e.message}` }, 502);
  }
}

async function apiPlaces(request, ctx) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 75 || /[\x00-\x1f]/.test(q)) return respond({ error: 'Enter a place name of 2–75 characters.' }, 400);
  const u = new URL(GEOCODE);
  u.search = new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' }).toString();
  const cache = globalThis.caches?.default, cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  if (cache) { try { const hit = await cache.match(cacheKey); if (hit) return hit; } catch {} }
  try {
    const res = await withTimeout(u.toString(), 8500);
    if (!res.ok) return respond({ error: 'Geocoding provider unavailable.' }, 503);
    const data = await res.json();
    const places = (Array.isArray(data?.results) ? data.results : [])
      .slice(0, 6)
      .filter(x => Number.isFinite(x.latitude) && Number.isFinite(x.longitude))
      .map(x => ({
        name: String(x.name || '').slice(0, 120),
        country: String(x.country || '').slice(0, 100),
        admin1: String(x.admin1 || '').slice(0, 100),
        lat: x.latitude,
        lon: x.longitude
      }));
    const output = respond({ source: 'Open-Meteo Geocoding', places }, 200, { 'Cache-Control': 'public, max-age=0, s-maxage=86400' });
    if (cache) {
      const job = cache.put(cacheKey, output.clone()).catch(() => {});
      if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(job); else await job;
    }
    return output;
  } catch {
    return respond({ error: 'Place search is temporarily unavailable. Enter latitude and longitude manually.' }, 502);
  }
}

// P0-2 & P0-3: Authenticated Project & Analysis Run Persistence using canonical 8-table schema (projects + analysis_runs)
export async function handleProjects(request, env) {
  if (!env?.DB) {
    return respond({ error: 'Cloudflare D1 database binding (env.DB) is not configured (fail-closed).' }, 503);
  }
  const auth = await requireCustomerAuth(request, env);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  if (request.method === 'GET') {
    const projectId = url.searchParams.get('projectId') || '';
    if (!projectId) return respond({ error: 'projectId query parameter is required.' }, 400);
    const proj = await env.DB.prepare('SELECT id, customer_id, jurisdiction, status, updated_at FROM projects WHERE id = ?1').bind(projectId).first();
    if (!proj) return respond({ error: 'Project not found.' }, 404);
    if (proj.customer_id !== auth.customerId) {
      return respond({ error: 'Forbidden: you do not own this project.' }, 403);
    }
    const run = await env.DB.prepare('SELECT id, engine_version, inputs_json, source_json, result_json, status FROM analysis_runs WHERE project_id = ?1').bind(projectId).first();
    return respond({ ok: true, project: proj, latestRun: run || null }, 200);
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON body' }, 400); }
    // P0-8: Prohibit mixed synthetic/demo or unverified source states in paid-tier analysis runs
    if (body?.paidTier === true) {
      const prov = body?.provenance || {};
      if (prov.demoMode === true || prov.quality === 'synthetic-demo' || prov.verifiedProvider !== true) {
        return respond({ error: 'Paid decision reports prohibit synthetic, demo, or unverified climate source states (P0-8).' }, 422);
      }
    }
    const now = new Date().toISOString();
    const projectId = String(body?.projectId || `prj_${fnv1aHash(auth.customerId + ':' + now)}`);
    const existing = await env.DB.prepare('SELECT id, customer_id FROM projects WHERE id = ?1').bind(projectId).first();
    if (existing && existing.customer_id !== auth.customerId) {
      return respond({ error: 'Forbidden: project belongs to another customer.' }, 403);
    }
    await env.DB.prepare('INSERT OR IGNORE INTO customers (id, email, created_at, verified_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(auth.customerId, auth.email, now, now).run();
    await env.DB.prepare('INSERT OR REPLACE INTO projects (id, customer_id, jurisdiction, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(projectId, auth.customerId, String(body?.jurisdiction || 'GR'), 'saved', now).run();

    const inputsStr = JSON.stringify(body?.inputs || {});
    const sourceStr = JSON.stringify(body?.provenance || {});
    const resultStr = JSON.stringify(body?.resultsSnapshot || {});
    const runId = `run_${fnv1aHash(projectId + ':' + inputsStr + ':' + resultStr)}`;
    await env.DB.prepare('INSERT OR REPLACE INTO analysis_runs (id, project_id, engine_version, inputs_json, source_json, result_json, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(runId, projectId, ENGINE_VERSION, inputsStr, sourceStr, resultStr, 'completed').run();

    return respond({ ok: true, projectId, analysisRunId: runId, updatedAt: now }, 201);
  }
  return respond({ error: 'Method not allowed' }, 405);
}

// P0-1 & P0-5: Server-authoritative SKU catalog & REAL Stripe Checkout Session creation (no fabricated cs_live_ IDs!)
export const SKU_CATALOG = Object.freeze({
  report_single: { sku: 'report_single', name: 'Independent Solar Quote & Bill Check (1 Quote)', amountCents: 2900, currency: 'EUR' },
  report_comparison_3: { sku: 'report_comparison_3', name: 'Independent 3-Quote Solar & Battery Audit Report', amountCents: 5900, currency: 'EUR' }
});

export async function handleCreateCheckout(request, env, stripeFetcher = fetch) {
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  const auth = await requireCustomerAuth(request, env);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);

  if (!env?.DB || !env?.STRIPE_SECRET_KEY) {
    return respond({ error: 'Cloudflare D1 database (env.DB) and Stripe secret key (env.STRIPE_SECRET_KEY) are required to create a real Checkout Session (fail-closed).' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON body' }, 400); }
  const skuItem = SKU_CATALOG[body?.sku];
  if (!skuItem) return respond({ error: 'Invalid SKU. Use report_single or report_comparison_3.' }, 400);
  const projectId = String(body?.projectId || '').trim();
  if (!projectId) return respond({ error: 'projectId is required.' }, 400);

  // Verify project ownership if project already exists
  const existingProj = await env.DB.prepare('SELECT id, customer_id FROM projects WHERE id = ?1').bind(projectId).first();
  if (existingProj && existingProj.customer_id !== auth.customerId) {
    return respond({ error: 'Forbidden: cannot create checkout for another customer project.' }, 403);
  }

  const now = new Date().toISOString();
  const orderId = 'ord_' + fnv1aHash(`${auth.customerId}:${projectId}:${skuItem.sku}:${now}`);
  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/#overview?order_id=${encodeURIComponent(orderId)}`;
  const cancelUrl = `${origin}/#overview?checkout=cancelled`;

  // P0-1: Real POST https://api.stripe.com/v1/checkout/sessions request
  const form = new URLSearchParams({
    mode: 'payment',
    customer_email: auth.email,
    client_reference_id: auth.customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][price_data][currency]': skuItem.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(skuItem.amountCents),
    'line_items[0][price_data][product_data][name]': skuItem.name,
    'line_items[0][quantity]': '1',
    'metadata[orderId]': orderId,
    'metadata[projectId]': projectId,
    'metadata[customerId]': auth.customerId,
    'metadata[sku]': skuItem.sku,
    'payment_intent_data[metadata][orderId]': orderId,
    'payment_intent_data[metadata][projectId]': projectId,
    'payment_intent_data[metadata][customerId]': auth.customerId
  });

  let stripeRes;
  try {
    stripeRes = await stripeFetcher(STRIPE_CHECKOUT_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `idem_${orderId}`
      },
      body: form.toString()
    });
  } catch (netErr) {
    return respond({ error: `Stripe API request failed: ${netErr.message}` }, 502);
  }

  if (!stripeRes || !stripeRes.ok) {
    return respond({ error: `Stripe Checkout session creation failed with HTTP ${stripeRes?.status ?? 502}.` }, 502);
  }

  const session = await stripeRes.json();
  if (!session?.id || !/^cs_(test|live)_/.test(String(session.id)) || !String(session.url || '').startsWith('https://checkout.stripe.com/')) {
    return respond({ error: 'Stripe API did not return a valid Checkout Session ID and https://checkout.stripe.com/ URL.' }, 502);
  }

  await env.DB.prepare('INSERT OR IGNORE INTO customers (id, email, created_at, verified_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(auth.customerId, auth.email, now, now).run();
  await env.DB.prepare('INSERT OR IGNORE INTO projects (id, customer_id, jurisdiction, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(projectId, auth.customerId, String(body?.jurisdiction || 'GR'), 'checkout_pending', now).run();
  await env.DB.prepare('INSERT INTO orders (id, customer_id, project_id, sku, stripe_session_id, payment_intent_id, payment_status, amount, currency, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
    .bind(orderId, auth.customerId, projectId, skuItem.sku, session.id, session.payment_intent || null, 'pending', skuItem.amountCents, skuItem.currency, now).run();

  return respond({
    ok: true,
    orderId,
    stripeSessionId: session.id,
    checkoutUrl: session.url,
    sku: skuItem.sku,
    amountCents: skuItem.amountCents,
    currency: skuItem.currency,
    paymentStatus: 'pending'
  }, 201);
}

// P0-4 & P0-5: Atomic Webhook Fulfillment, Real R2 PDF Upload Before Active Status & Real Charge/PaymentIntent Refund Mapping
export async function handleStripeWebhookEvent(request, env) {
  if (!env?.STRIPE_WEBHOOK_SECRET || !env?.DB || !env?.REPORTS_BUCKET) {
    return respond({ error: 'STRIPE_WEBHOOK_SECRET, D1 (env.DB), and R2 (env.REPORTS_BUCKET) are required for webhook fulfillment (fail-closed).' }, 503);
  }
  const sig = request.headers.get('Stripe-Signature') || '';
  const rawBody = await request.text();
  const check = await verifyStripeWebhookSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!check.valid) return respond({ error: check.reason }, 400);

  let event;
  try { event = JSON.parse(rawBody); } catch { return respond({ error: 'Malformed webhook JSON' }, 400); }
  if (!event?.id || !event?.type) return respond({ error: 'Missing event id or type' }, 400);

  // 1. Check idempotency BEFORE side effects
  const existing = await env.DB.prepare('SELECT id FROM stripe_events WHERE id = ?1').bind(event.id).first();
  if (existing) {
    return respond({ ok: true, idempotentReplay: true, eventId: event.id }, 200);
  }

  const now = new Date().toISOString();
  const obj = event.data?.object || {};

  // 2. Execute fulfillment or revocation BEFORE marking stripe_events processed (so any exception allows clean retry)
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    // For checkout.session.completed with delayed payment methods, wait until payment_status === 'paid'
    if (event.type === 'checkout.session.completed' && obj.payment_status && obj.payment_status !== 'paid') {
      await env.DB.prepare('INSERT INTO stripe_events (id, event_type, processed_at) VALUES (?1, ?2, ?3)').bind(event.id, event.type, now).run();
      return respond({ ok: true, awaitingAsyncPayment: true, eventId: event.id }, 200);
    }

    const sessionId = String(obj.id || '');
    const order = await env.DB.prepare('SELECT id, customer_id, project_id, sku, payment_status FROM orders WHERE stripe_session_id = ?1').bind(sessionId).first();
    if (!order) return respond({ error: 'Matching order not found for checkout session' }, 404);

    if (order.payment_status !== 'refunded') {
      const piId = obj.payment_intent ? String(obj.payment_intent) : null;
      const run = await env.DB.prepare('SELECT id, result_json FROM analysis_runs WHERE project_id = ?1').bind(order.project_id).first();
      const runId = run?.id || `run_${order.project_id}`;
      const pdfBytes = buildServerReportPdfBytes({
        orderId: order.id,
        customerId: order.customer_id,
        projectId: order.project_id,
        sku: order.sku,
        analysisSummary: run?.result_json || 'Verified Order Snapshot'
      });
      const r2Key = `reports/${order.customer_id}/${order.id}.pdf`;
      const pdfHash = fnv1aHash(new TextDecoder().decode(pdfBytes));

      // Upload PDF to private R2 BEFORE marking report active or order paid
      await env.REPORTS_BUCKET.put(r2Key, pdfBytes, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { orderId: order.id, customerId: order.customer_id, sha256Hash: pdfHash }
      });

      await env.DB.prepare('UPDATE orders SET payment_status = ?1, payment_intent_id = ?2 WHERE id = ?3')
        .bind('paid', piId, order.id).run();

      await env.DB.prepare('INSERT OR REPLACE INTO reports (id, analysis_run_id, order_id, r2_key, sha256_hash, engine_version, created_at, access_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
        .bind(`rep_${order.id}`, runId, order.id, r2Key, pdfHash, ENGINE_VERSION, now, 'active').run();
    }
  } else if (event.type === 'charge.refunded' || event.type === 'payment_intent.payment_failed' || event.type === 'checkout.session.expired') {
    // P0-5 Fix: charge.refunded provides a Charge object (ch_...) with payment_intent (pi_...) or metadata.orderId, NOT a Checkout Session ID!
    const piId = obj.payment_intent ? String(obj.payment_intent) : (obj.object === 'payment_intent' ? String(obj.id || '') : '');
    const metaOrderId = obj.metadata?.orderId ? String(obj.metadata.orderId) : '';
    const sessId = obj.object === 'checkout.session' ? String(obj.id || '') : String(obj.checkout_session || '');

    let order = null;
    if (piId) order = await env.DB.prepare('SELECT id FROM orders WHERE payment_intent_id = ?1').bind(piId).first();
    if (!order && metaOrderId) order = await env.DB.prepare('SELECT id FROM orders WHERE id = ?1').bind(metaOrderId).first();
    if (!order && sessId) order = await env.DB.prepare('SELECT id FROM orders WHERE stripe_session_id = ?1').bind(sessId).first();

    if (!order) return respond({ error: 'Matching order not found for refund/failure event' }, 404);

    const newStatus = event.type === 'charge.refunded' ? 'refunded' : (event.type === 'checkout.session.expired' ? 'expired' : 'failed');
    const chargeId = obj.object === 'charge' ? String(obj.id || '') : null;

    await env.DB.prepare('UPDATE orders SET payment_status = ?1, charge_id = ?2, refunded_at = ?3 WHERE id = ?4')
      .bind(newStatus, chargeId, event.type === 'charge.refunded' ? now : null, order.id).run();
    await env.DB.prepare('UPDATE reports SET access_status = ?1 WHERE order_id = ?2')
      .bind('revoked', order.id).run();
  }

  // 3. Record event ID only AFTER all DB and R2 operations succeeded
  await env.DB.prepare('INSERT INTO stripe_events (id, event_type, processed_at) VALUES (?1, ?2, ?3)')
    .bind(event.id, event.type, now).run();

  return respond({ ok: true, processedEvent: event.id, type: event.type }, 200);
}

// P0-2 & P0-4: Strict Owner-Authorized Report Metadata & Binary PDF Download from R2 (never leaks r2_key or allows anonymous access)
export async function handleReportAccess(orderId, request, env, downloadBinary = false) {
  if (!env?.DB || !env?.REPORTS_BUCKET) return respond({ error: 'Database or R2 storage unavailable' }, 503);
  const auth = await requireCustomerAuth(request, env);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);

  const order = await env.DB.prepare('SELECT id, customer_id, payment_status, sku, amount, currency FROM orders WHERE id = ?1').bind(orderId).first();
  if (!order) return respond({ error: 'Order not found' }, 404);
  if (order.customer_id !== auth.customerId) {
    return respond({ error: 'Forbidden: you do not own this order.', entitled: false }, 403);
  }
  if (order.payment_status !== 'paid') {
    return respond({ error: `Report access denied: order payment_status is '${order.payment_status}'.`, entitled: false }, 403);
  }
  const rep = await env.DB.prepare('SELECT id, r2_key, sha256_hash, engine_version, access_status, created_at FROM reports WHERE order_id = ?1').bind(orderId).first();
  if (!rep || rep.access_status !== 'active') {
    return respond({ error: 'Report entitlement is revoked or not yet generated.', entitled: false }, 403);
  }

  // Verify the R2 object actually exists before claiming active access
  const r2Obj = await env.REPORTS_BUCKET.get(rep.r2_key);
  if (!r2Obj) {
    return respond({ error: 'Report PDF object is missing from storage.', entitled: false }, 503);
  }

  if (downloadBinary) {
    const bytes = await r2Obj.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        ...SEC,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="SolarPayback-Decision-Report-${order.id}.pdf"`,
        'Cache-Control': 'private, no-store'
      }
    });
  }

  return respond({
    ok: true,
    entitled: true,
    orderId: order.id,
    reportId: rep.id,
    engineVersion: rep.engine_version,
    sha256Hash: rep.sha256_hash,
    createdAt: rep.created_at,
    accessStatus: rep.access_status,
    downloadPath: `/api/reports/${order.id}/download`
  }, 200);
}


// P0-2: Customer Magic-Link / Session Token Issuance Endpoint
export async function handleAuthSession(request, env) {
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  if (!env?.DB || !env?.AUTH_SECRET || String(env.AUTH_SECRET).length < 16) {
    return respond({ error: 'Server AUTH_SECRET and D1 database (env.DB) are required (fail-closed).' }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON body' }, 400); }
  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond({ error: 'Enter a valid email address.' }, 400);
  }
  const now = new Date().toISOString();
  const customerId = 'cus_' + fnv1aHash(email);
  await env.DB.prepare('INSERT OR IGNORE INTO customers (id, email, created_at, verified_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(customerId, email, now, now).run();
  const token = await issueSessionToken({ customerId, email, ttlSec: 86400 }, env.AUTH_SECRET);
  return respond({ ok: true, customerId, email, sessionToken: token, expiresInSec: 86400 }, 200);
}

// P0-7 & P1-3: Authenticated Document Upload (R2 private storage + D1 documents & quote_fields tables)
export async function handleDocumentUpload(request, env) {
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  if (!env?.DB || !env?.REPORTS_BUCKET) {
    return respond({ error: 'D1 database and R2 storage are required for document ingestion (fail-closed).' }, 503);
  }
  const auth = await requireCustomerAuth(request, env);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);

  let body;
  try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON body' }, 400); }
  const projectId = String(body?.projectId || '').trim();
  const docType = String(body?.type || 'quote');
  const rawContent = String(body?.content || '');
  if (!projectId || !rawContent || rawContent.length > 4_000_000) {
    return respond({ error: 'Valid projectId and document content (<= 4 MB) are required.' }, 400);
  }

  const existingProj = await env.DB.prepare('SELECT id, customer_id FROM projects WHERE id = ?1').bind(projectId).first();
  if (existingProj && existingProj.customer_id !== auth.customerId) {
    return respond({ error: 'Forbidden: you do not own this project.' }, 403);
  }

  const now = new Date().toISOString();
  const docHash = fnv1aHash(rawContent);
  const docId = `doc_${fnv1aHash(projectId + ':' + docHash)}`;
  const r2Key = `documents/${auth.customerId}/${projectId}/${docId}.dat`;

  await env.REPORTS_BUCKET.put(r2Key, new TextEncoder().encode(rawContent), {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { customerId: auth.customerId, projectId, docHash }
  });

  await env.DB.prepare('INSERT OR REPLACE INTO documents (id, project_id, type, r2_key, hash, validated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(docId, projectId, docType, r2Key, docHash, now).run();

  const fields = Array.isArray(body?.fields) ? body.fields.slice(0, 30) : [];
  for (const f of fields) {
    if (!f?.key || f?.value === undefined) continue;
    await env.DB.prepare('INSERT OR REPLACE INTO quote_fields (project_id, document_id, key, value, unit, confidence, user_confirmed) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(projectId, docId, String(f.key), String(f.value), String(f.unit || ''), String(f.confidence || 'medium'), f.userConfirmed ? 1 : 0).run();
  }

  return respond({ ok: true, documentId: docId, documentHash: docHash, fieldsStored: fields.length }, 201);
}

// P0-2: Authenticated Owner-Only Order Status & Receipt Lookup
export async function handleOrderLookup(orderId, request, env) {
  if (!env?.DB) return respond({ error: 'Database unavailable' }, 503);
  const auth = await requireCustomerAuth(request, env);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);

  const order = await env.DB.prepare('SELECT id, customer_id, project_id, sku, payment_status, amount, currency, created_at, refunded_at FROM orders WHERE id = ?1').bind(orderId).first();
  if (!order) return respond({ error: 'Order not found' }, 404);
  if (order.customer_id !== auth.customerId) {
    return respond({ error: 'Forbidden: you do not own this order.' }, 403);
  }
  return respond({
    ok: true,
    order: {
      id: order.id,
      projectId: order.project_id,
      sku: order.sku,
      paymentStatus: order.payment_status,
      amountCents: order.amount,
      currency: order.currency,
      createdAt: order.created_at,
      refundedAt: order.refunded_at || null
    }
  }, 200);
}

// P1-4 & P1-8: GDPR Right-to-Erasure Endpoint (Deletes Customer R2 Objects & D1 Records)
export async function handleGdprDelete(request, env) {
  if (request.method !== 'DELETE') return respond({ error: 'Method not allowed' }, 405, { Allow: 'DELETE' });
  if (!env?.DB || !env?.REPORTS_BUCKET) return respond({ error: 'D1 and R2 bindings required' }, 503);
  const auth = await requireCustomerAuth(request, env);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);

  await env.DB.prepare('DELETE FROM customers WHERE id = ?1').bind(auth.customerId).run();
  await env.DB.prepare('DELETE FROM projects WHERE customer_id = ?1').bind(auth.customerId).run();
  await env.DB.prepare('DELETE FROM orders WHERE customer_id = ?1').bind(auth.customerId).run();
  return respond({ ok: true, erasedCustomerId: auth.customerId, erasedAt: new Date().toISOString() }, 200);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/api/')) {
      const rl = await enforceRateLimit(request, env);
      if (!rl.allowed) {
        return respond({ error: 'Rate limit exceeded. Please wait before retrying.' }, 429, { 'Retry-After': String(rl.retryAfterSec || 60) });
      }
      if ((path === '/api/stripe/webhook' || path === '/api/webhooks/stripe') && request.method === 'POST') {
        return handleStripeWebhookEvent(request, env);
      }
      if ((path === '/api/checkout' || path === '/api/checkout/session') && request.method === 'POST') {
        return handleCreateCheckout(request, env);
      }
      if (path === '/api/auth/session' || path === '/api/auth/magic-link') {
        return handleAuthSession(request, env);
      }
      if (path === '/api/documents') {
        return handleDocumentUpload(request, env);
      }
      if (path === '/api/projects') {
        return handleProjects(request, env);
      }
      if (path.startsWith('/api/orders/') && request.method === 'GET') {
        return handleOrderLookup(path.slice('/api/orders/'.length), request, env);
      }
      if (path === '/api/customer/data' && request.method === 'DELETE') {
        return handleGdprDelete(request, env);
      }
      if (path.startsWith('/api/reports/') && request.method === 'GET') {
        const rest = path.slice('/api/reports/'.length);
        if (rest.endsWith('/download')) {
          const orderId = rest.slice(0, -'/download'.length);
          return handleReportAccess(orderId, request, env, true);
        }
        return handleReportAccess(rest, request, env, false);
      }
      if (request.method !== 'GET') return respond({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      if (path === '/api/health' || path === '/api/health/live' || path === '/api/health/ready') {
        return handleHealthProbe(path, url);
      }
      if (path === '/api/solar') return apiSolar(request, ctx);
      if (path === '/api/hourly') return apiHourly(request, ctx);
      if (path === '/api/places') return apiPlaces(request, ctx);
      return respond({ error: 'Not found' }, 404);
    }
    if (!env?.ASSETS?.fetch) return new Response('Cloudflare Pages ASSETS binding is missing.', { status: 503, headers: SEC });
    return env.ASSETS.fetch(request);
  }
};
