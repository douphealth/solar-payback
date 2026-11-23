// Edge cache for server-rendered public HTML (Cloudflare Cache API), with stale-while-revalidate.
// A page younger than `ttl` is served as is. Between `ttl` and `ttl + swr` the cached copy is served
// immediately and re-rendered in the background, so visitors and crawlers almost never wait for a
// full render. Only anonymous GET requests for HTML that rendered with 200 and set no cookie are stored.

// Unique per build (vite.config.ts `define`). Part of the cache key, so a deploy never serves HTML that
// points at the previous build's JS/CSS files (Pages keeps only the current deployment's assets).
declare const __BUILD_ID__: string;
const BUILD = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

type Ctx = { waitUntil?(p: Promise<unknown>): void } | undefined;
type CacheStorageCF = { default: Cache };
type Opts = { ttl: number; swr?: number; skip?: (path: string) => boolean; ttlFor?: (path: string) => { ttl: number; swr?: number } | null };

export async function withEdgeCache(request: Request, ctx: unknown, opts: Opts, render: () => Promise<Response>): Promise<Response> {
  const cache = (globalThis as unknown as { caches?: CacheStorageCF }).caches?.default;
  const url = new URL(request.url);
  if (!cache || request.method !== "GET" || request.headers.has("authorization") || opts.skip?.(url.pathname)) {
    return render();
  }
  const { ttl, swr = 0 } = opts.ttlFor?.(url.pathname) ?? opts;
  const keyUrl = new URL(url);
  keyUrl.searchParams.set("__build", BUILD);
  const key = new Request(keyUrl.toString(), { method: "GET" });
  const c = ctx as Ctx;

  const store = async (response: Response): Promise<void> => {
    const type = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !type.includes("text/html") || response.headers.has("set-cookie")) return;
    const stored = new Response(response.body, response);
    stored.headers.set("cache-control", `public, max-age=${ttl + swr}`);
    stored.headers.set("x-cached-at", String(Date.now()));
    await cache.put(key, stored).catch(() => undefined);
  };

  try {
    const hit = await cache.match(key);
    if (hit) {
      const age = (Date.now() - Number(hit.headers.get("x-cached-at") ?? 0)) / 1000;
      const res = new Response(hit.body, hit);
      res.headers.delete("x-cached-at");
      res.headers.set("cache-control", "public, max-age=0, must-revalidate");
      if (age < ttl) {
        res.headers.set("x-edge-cache", "HIT");
        return res;
      }
      if (age < ttl + swr && c?.waitUntil) {
        res.headers.set("x-edge-cache", "STALE");
        c.waitUntil(render().then(store).catch(() => undefined)); // refresh for the next visitor
        return res;
      }
    }
  } catch { /* cache unavailable: render normally */ }

  const response = await render();
  const toStore = response.clone();
  const put = store(toStore);
  if (c?.waitUntil) c.waitUntil(put); else await put;
  const res = new Response(response.body, response);
  res.headers.set("x-edge-cache", "MISS");
  return res;
}
