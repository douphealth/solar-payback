import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { seoPreflight, seoRewrite } from "./lib/seo-edge";
import { withEdgeCache } from "./lib/edge-cache";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
// Edge HTML cache for public, query-free pages. City/country pages are CPU-heavy to SSR and the
// Worker CPU limit was producing intermittent 503s (error 1102) for crawlers. Pages hold no
// per-user data (scenarios live in the browser), so a short shared cache is safe.
const HTML_CACHE_SECONDS = 6 * 60 * 60;
const CACHEABLE_PREFIXES = ["/cities", "/countries", "/compare", "/methodology", "/about", "/privacy", "/terms", "/contact"];
function isCacheable(request: Request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.hostname === "solarpayback.shop" && !url.search && (url.pathname === "/" || CACHEABLE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`)));
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const redirect = seoPreflight(request);
    if (redirect) return redirect;
    const render = async () => {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return seoRewrite(request, await normalizeCatastrophicSsrResponse(response));
    };
    try {
      // Data changes only on deploy: fresh for 6 h, then served instantly while re-rendering for up to
      // 7 days. The cache key includes the build id, so a deploy starts a clean cache. See lib/edge-cache.ts.
      if (!isCacheable(request)) return await render();
      return await withEdgeCache(request, ctx, { ttl: HTML_CACHE_SECONDS, swr: 7 * 24 * 60 * 60 }, render);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
