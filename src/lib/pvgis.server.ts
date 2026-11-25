import { z } from "zod";

export type SolarProfile = {
  lat: number;
  lon: number;
  elevation: number | null;
  radiationDb: string;
  period: string;
  angle: number;
  aspect: number;
  loss: number;
  annualKwhPerKwp: number;
  monthly: { month: number; kwh: number; irradiation: number }[];
  yearToYearSdKwh: number | null;
  fetchedAt: string;
  stale: boolean;
};

export type ProfileQuery = { lat: number; lon: number; angle: number; aspect: number; loss: number };
type CacheEntry = { profile: SolarProfile; storedAt: number };
const profileCache = new Map<string, CacheEntry>();
const geoCache = new Map<string, { at: number; results: GeoPlace[] }>();
const FRESH_MS = 24 * 60 * 60 * 1000;

const pvgisSchema = z.object({
  inputs: z.object({
    location: z.object({ elevation: z.number().nullish() }).optional(),
    meteo_data: z.object({ radiation_db: z.string().optional(), year_min: z.number().optional(), year_max: z.number().optional() }).optional(),
  }).optional(),
  outputs: z.object({
    totals: z.object({ fixed: z.object({ E_y: z.number().positive(), SD_y: z.number().nullish() }) }),
    monthly: z.object({ fixed: z.array(z.object({ month: z.number().int().min(1).max(12), E_m: z.number().nonnegative(), "H(i)_m": z.number().nonnegative() })).length(12) }),
  }),
});

const geoSchema = z.object({ results: z.array(z.object({
  name: z.string(), admin1: z.string().optional(), country: z.string().optional(), latitude: z.number(), longitude: z.number(),
})).optional() });
export type GeoPlace = { name: string; country: string; lat: number; lon: number };

function remember(map: Map<string, CacheEntry>, key: string, entry: CacheEntry) {
  if (map.size >= 500) map.delete(map.keys().next().value!);
  map.set(key, entry);
}

// Edge-shared cache (Cloudflare Cache API) so live PVGIS results survive across isolates.
// Prevents crawler-visible 500s when PVGIS rate-limits or times out. Data is still fetched live
// from PVGIS; this only stores the last good live response.
const EDGE_CACHE_HOST = "https://pvgis-cache.internal/";
function edgeCache(): Cache | null {
  try { return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null; } catch { return null; }
}
async function edgeGet(key: string): Promise<CacheEntry | null> {
  const c = edgeCache(); if (!c) return null;
  try { const r = await c.match(EDGE_CACHE_HOST + encodeURIComponent(key)); return r ? ((await r.json()) as CacheEntry) : null; } catch { return null; }
}
async function edgePut(key: string, entry: CacheEntry) {
  const c = edgeCache(); if (!c) return;
  try { await c.put(EDGE_CACHE_HOST + encodeURIComponent(key), new Response(JSON.stringify(entry), { headers: { "content-type": "application/json", "cache-control": "public, max-age=2592000" } })); } catch { /* best effort */ }
}
async function fetchWithRetry(u: URL, signal: AbortSignal): Promise<Response> {
  const res = await fetch(u, { signal, headers: { accept: "application/json" } });
  if (res.ok || signal.aborted) return res;
  await new Promise((r) => setTimeout(r, 600));
  return fetch(u, { signal, headers: { accept: "application/json" } });
}

export async function fetchSolarProfile(q: ProfileQuery): Promise<SolarProfile> {
  const key = [q.lat.toFixed(4), q.lon.toFixed(4), q.angle, q.aspect, q.loss].join(":");
  let cached = profileCache.get(key);
  if (!cached) { const e = await edgeGet(key); if (e) { cached = e; remember(profileCache, key, e); } }
  if (cached && Date.now() - cached.storedAt < FRESH_MS) return { ...cached.profile, stale: false };
  const u = new URL("https://re.jrc.ec.europa.eu/api/v5_3/PVcalc");
  u.search = new URLSearchParams({ lat: q.lat.toFixed(4), lon: q.lon.toFixed(4), peakpower: "1", loss: String(q.loss), angle: String(q.angle), aspect: String(q.aspect), outputformat: "json" }).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetchWithRetry(u, ctrl.signal);
    if (!res.ok) throw new Error(`PVGIS responded ${res.status}`);
    const parsed = pvgisSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("PVGIS returned an unexpected response");
    const j = parsed.data;
    const md = j.inputs?.meteo_data ?? {};
    const profile: SolarProfile = {
      lat: q.lat, lon: q.lon, elevation: j.inputs?.location?.elevation ?? null,
      radiationDb: md.radiation_db ?? "PVGIS", period: md.year_min ? `${md.year_min}–${md.year_max}` : "",
      angle: q.angle, aspect: q.aspect, loss: q.loss, annualKwhPerKwp: j.outputs.totals.fixed.E_y,
      yearToYearSdKwh: j.outputs.totals.fixed.SD_y ?? null,
      monthly: j.outputs.monthly.fixed.map((m) => ({ month: m.month, kwh: m.E_m, irradiation: m["H(i)_m"] })),
      fetchedAt: new Date().toISOString(), stale: false,
    };
    const entry = { profile, storedAt: Date.now() };
    remember(profileCache, key, entry);
    await edgePut(key, entry);
    return profile;
  } catch (error) {
    if (cached) return { ...cached.profile, stale: true };
    throw error;
  } finally { clearTimeout(timer); }
}

export async function fetchGeocode(query: string): Promise<GeoPlace[]> {
  const key = query.trim().toLowerCase();
  const cached = geoCache.get(key);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.results;
  const u = `https://geocoding-api.open-meteo.com/v1/search?count=6&format=json&name=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(u, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("Geocoding unavailable");
    const parsed = geoSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("Unexpected geocoding response");
    const results = (parsed.data.results ?? []).map((r) => ({ name: [r.name, r.admin1].filter(Boolean).join(", "), country: r.country ?? "", lat: r.latitude, lon: r.longitude }));
    if (geoCache.size >= 200) geoCache.delete(geoCache.keys().next().value!);
    geoCache.set(key, { at: Date.now(), results });
    return results;
  } catch (error) {
    if (cached) return cached.results;
    throw error;
  } finally { clearTimeout(timer); }
}

export async function fetchDirectoryProfiles(places: { slug: string; lat: number; lon: number }[]) {
  const out: { slug: string; profile: SolarProfile | null }[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < places.length) {
      const place = places[cursor++]!;
      try { out.push({ slug: place.slug, profile: await fetchSolarProfile({ lat: place.lat, lon: place.lon, angle: 30, aspect: 0, loss: 14 }) }); }
      catch { out.push({ slug: place.slug, profile: null }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, places.length) }, worker));
  return out;
}

// ---- Inverter clipping (balcony solar) ----
// Plug-in systems in Germany are capped at 800 W inverter output while panels may total up to 2,000 Wp,
// so annual yield depends on how often hourly output exceeds the cap. PVGIS seriescalc gives one year of
// hourly output for 1 kWp; from it we store the share of energy kept at each cap/panel ratio.
export type ClipCurve = { year: number; ratios: number[]; retained: number[]; fetchedAt: string };
export const CLIP_YEAR = 2023;
export const CLIP_RATIOS = Array.from({ length: 19 }, (_, i) => Math.round((0.1 + i * 0.05) * 100) / 100);
const clipCache = new Map<string, { curve: ClipCurve; storedAt: number }>();
const seriesSchema = z.object({ outputs: z.object({ hourly: z.array(z.object({ P: z.number() })).min(8000) }) });

export function clipCurveFromHourly(watts: number[]): Omit<ClipCurve, "fetchedAt"> {
  const kw = watts.map((w) => Math.max(0, w) / 1000);
  const total = kw.reduce((s, p) => s + p, 0) || 1;
  return { year: CLIP_YEAR, ratios: CLIP_RATIOS, retained: CLIP_RATIOS.map((r) => Math.round((kw.reduce((s, p) => s + Math.min(p, r), 0) / total) * 10000) / 10000) };
}

export async function fetchClipCurve(q: ProfileQuery): Promise<ClipCurve | null> {
  const key = "clip:" + [q.lat.toFixed(3), q.lon.toFixed(3), q.angle, q.aspect, q.loss].join(":");
  const mem = clipCache.get(key);
  if (mem) return mem.curve;
  const c = edgeCache();
  if (c) {
    try { const r = await c.match(EDGE_CACHE_HOST + encodeURIComponent(key)); if (r) { const e = (await r.json()) as { curve: ClipCurve; storedAt: number }; clipCache.set(key, e); return e.curve; } } catch { /* miss */ }
  }
  const u = new URL("https://re.jrc.ec.europa.eu/api/v5_3/seriescalc");
  u.search = new URLSearchParams({ lat: q.lat.toFixed(3), lon: q.lon.toFixed(3), peakpower: "1", loss: String(q.loss), angle: String(q.angle), aspect: String(q.aspect), pvcalculation: "1", startyear: String(CLIP_YEAR), endyear: String(CLIP_YEAR), outputformat: "json" }).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetchWithRetry(u, ctrl.signal);
    if (!res.ok) return null;
    const parsed = seriesSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    const curve: ClipCurve = { ...clipCurveFromHourly(parsed.data.outputs.hourly.map((h) => h.P)), fetchedAt: new Date().toISOString() };
    const entry = { curve, storedAt: Date.now() };
    if (clipCache.size >= 300) clipCache.delete(clipCache.keys().next().value!);
    clipCache.set(key, entry);
    if (c) { try { await c.put(EDGE_CACHE_HOST + encodeURIComponent(key), new Response(JSON.stringify(entry), { headers: { "content-type": "application/json", "cache-control": "public, max-age=2592000" } })); } catch { /* best effort */ } }
    return curve;
  } catch { return null; } finally { clearTimeout(timer); }
}
