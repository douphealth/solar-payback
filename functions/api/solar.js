import { createPvgisUrl, parsePvgis, parseSolarQuery } from '../../src/pvgis.js';

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff',...headers}});
}

export async function onRequestGet({ request, waitUntil }) {
  let input;
  try { input = parseSolarQuery(new URL(request.url).searchParams); }
  catch (error) { return json({error:error.message},400,{'Cache-Control':'no-store'}); }
  // The CDN cache avoids repeating computationally expensive JRC requests for identical systems.
  const cache = globalThis.caches?.default;
  if (cache) {
    try { const cached = await cache.match(request); if (cached) return cached; }
    catch { /* Cache failure must not block live data */ }
  }
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 16000);
  try {
    // PVGIS explicitly disallows browser-side AJAX; all calls are executed server-side.
    const response = await fetch(createPvgisUrl(input), {
      method:'GET', signal:abort.signal,
      headers: {Accept:'application/json', 'User-Agent':'SolarPayback/1.0 (PVGIS data attribution in UI)'}
    });
    if (response.status === 429 || response.status === 529 || response.status >= 500) {
      return json({error:'PVGIS is temporarily busy. Retry the calculation shortly.'},503,{'Cache-Control':'no-store','Retry-After':'30'});
    }
    if (!response.ok) return json({error:'PVGIS could not calculate this location or system.'},422,{'Cache-Control':'no-store'});
    const size = Number(response.headers.get('content-length') || 0);
    if (size > 500000) throw new TypeError('PVGIS response exceeded expected size');
    const payloadText = await response.text();
    if (payloadText.length > 500000) throw new TypeError('PVGIS response exceeded expected size');
    const body = JSON.parse(payloadText);
    const result = parsePvgis(body);
    const output = json({...result,inputs:input,fetchedAt:new Date().toISOString()},200,
      {'Cache-Control':'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400'});
    if (cache) {
      const write = cache.put(request, output.clone()).catch(() => {});
      if (typeof waitUntil === 'function') waitUntil(write); else await write;
    }
    return output;
  } catch (error) {
    return json({error: error?.name === 'AbortError' ? 'PVGIS did not respond in time. Please retry.' :
      'Solar data could not be validated. No estimate has been substituted.'},502,{'Cache-Control':'no-store'});
  } finally { clearTimeout(timeout); }
}
