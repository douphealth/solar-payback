// Edge SEO layer (runs in src/server.ts around the TanStack Start handler).
// - 301s the production *.pages.dev host to the canonical domain (duplicate-content fix)
// - 301s trailing-slash URLs to the slash-less canonical form
// - Ensures every indexable HTML page has a self-referencing canonical + og:url on the canonical host
// - Adds a site-wide JSON-LD graph (Organization, WebSite, WebPage, BreadcrumbList) when missing
// - Removes leftover Lovable template meta (author / twitter:site)
// Site-specific values live in src/seo.config.ts.
import { SEO } from "../seo.config";

type Rewriter = {
  on(selector: string, handlers: Record<string, (x: never) => void>): Rewriter;
  transform(r: Response): Response;
};
type RewriterCtor = new () => Rewriter;

const ORIGIN = SEO.origin.replace(/\/$/, "");
// Optional Google AdSense (auto ads). Set SEO.adsenseClient = "ca-pub-…" in src/seo.config.ts to enable the
// head script and /ads.txt; empty = no ad code shipped at all.
const ADSENSE = String((SEO as { adsenseClient?: string }).adsenseClient ?? "").trim();
const CANON_HOST = new URL(ORIGIN).hostname;
// Site-wide social preview image (1200x630, public/og-image.png). Used only on pages that set no og:image.
const OG_IMAGE = `${ORIGIN}${(SEO as { ogImage?: string }).ogImage ?? "/og-image.png"}`;
const PATH_LANG: Record<string, string> = (SEO as { pathLang?: Record<string, string> }).pathLang ?? {};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function canonicalPath(pathname: string) {
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

/** Redirects that must happen before rendering. Returns null when the request should continue. */
export function seoPreflight(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (ADSENSE && url.pathname === "/ads.txt") {
    return new Response(`google.com, ${ADSENSE.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0
`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }
  const redirectHosts = [SEO.pagesDevHost, `www.${CANON_HOST}`].filter(Boolean) as string[];
  if (redirectHosts.includes(host)) {
    return Response.redirect(`${ORIGIN}${url.pathname}${url.search}`, 301);
  }
  if (host === CANON_HOST && url.pathname.length > 1 && url.pathname.endsWith("/") && !SEO.keepTrailingSlash) {
    return Response.redirect(`${ORIGIN}${canonicalPath(url.pathname)}${url.search}`, 301);
  }
  return null;
}

const humanize = (s: string) => decodeURIComponent(s).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const cleanTitle = (t: string) => t.replace(new RegExp(`\\s*[|—–-]\\s*${SEO.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$`, "i"), "").trim() || t.trim();
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function graph(url: URL, title: string, description: string, existing: string) {
  const path = canonicalPath(url.pathname);
  const pageUrl = `${ORIGIN}${path}`;
  const nodes: Record<string, unknown>[] = [];
  if (!/"Organization"/.test(existing)) nodes.push({
    "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: SEO.name, url: `${ORIGIN}/`,
    ...(SEO.logo ? { logo: { "@type": "ImageObject", url: `${ORIGIN}${SEO.logo}` } } : {}),
    ...(SEO.sameAs?.length ? { sameAs: SEO.sameAs } : {}),
  });
  if (!/"WebSite"/.test(existing)) nodes.push({
    "@type": "WebSite", "@id": `${ORIGIN}/#website`, name: SEO.name, url: `${ORIGIN}/`, description: SEO.description,
    inLanguage: SEO.lang, publisher: { "@id": `${ORIGIN}/#organization` },
  });
  const segs = path.split("/").filter(Boolean);
  const crumbs = [{ name: "Home", item: `${ORIGIN}/` }, ...segs.map((s, i) => ({
    name: i === segs.length - 1 && title ? cleanTitle(title) : (SEO.sectionNames?.[segs.slice(0, i + 1).join("/")] ?? humanize(s)),
    item: `${ORIGIN}/${segs.slice(0, i + 1).join("/")}`,
  }))];
  const hasCrumbs = segs.length > 0 && !/"BreadcrumbList"/.test(existing);
  if (!/"WebPage"|"CollectionPage"|"AboutPage"|"FAQPage"|"Article"/.test(existing)) nodes.push({
    "@type": "WebPage", "@id": `${pageUrl}#webpage`, url: pageUrl, name: cleanTitle(title), ...(description ? { description } : {}),
    isPartOf: { "@id": `${ORIGIN}/#website` }, inLanguage: PATH_LANG[path] ?? SEO.lang, ...(hasCrumbs ? { breadcrumb: { "@id": `${pageUrl}#breadcrumb` } } : {}),
  });
  if (hasCrumbs) nodes.push({
    "@type": "BreadcrumbList", "@id": `${pageUrl}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
  });
  return nodes.length ? JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c") : "";
}

/** Rewrites successful HTML responses. Safe no-op where HTMLRewriter is unavailable (dev/tests). */
export function seoRewrite(request: Request, response: Response): Response {
  const Ctor = (globalThis as unknown as { HTMLRewriter?: RewriterCtor }).HTMLRewriter;
  if (!Ctor || request.method !== "GET" || response.status !== 200) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const url = new URL(request.url);
  if (url.hostname !== CANON_HOST) return response;
  const canonical = `${ORIGIN}${canonicalPath(url.pathname)}`;
  const s = { canonical: false, ogUrl: false, robots: false, noindex: false, ogImage: false, twCard: false, title: "", desc: "", ld: "" };
  const onCanon = (h: string | null) => !h || !h.startsWith(ORIGIN);
  const lang = PATH_LANG[canonicalPath(url.pathname)];
  return new Ctor()
    .on("html", { element: (el: { setAttribute(n: string, v: string): void }) => { if (lang) el.setAttribute("lang", lang); } })
    .on('link[rel="canonical"]', { element: (el: { getAttribute(n: string): string | null; setAttribute(n: string, v: string): void }) => { s.canonical = true; if (onCanon(el.getAttribute("href"))) el.setAttribute("href", canonical); } })
    .on('meta[property="og:url"]', { element: (el: { getAttribute(n: string): string | null; setAttribute(n: string, v: string): void }) => { s.ogUrl = true; if (onCanon(el.getAttribute("content"))) el.setAttribute("content", canonical); } })
    .on('meta[name="robots"]', { element: (el: { getAttribute(n: string): string | null }) => { s.robots = true; if (/noindex/i.test(el.getAttribute("content") ?? "")) s.noindex = true; } })
    .on('meta[name="author"][content="Lovable"]', { element: (el: { remove(): void }) => el.remove() })
    .on('meta[name="twitter:site"][content="@Lovable"]', { element: (el: { remove(): void }) => el.remove() })
    .on('meta[property="og:image"]', { element: () => { s.ogImage = true; } })
    .on('meta[name="twitter:card"]', { element: (el: { getAttribute(n: string): string | null; setAttribute(n: string, v: string): void }) => {
      s.twCard = true;
      // Pages without their own image get the large site image, so the card should be large too.
      if (!s.ogImage && el.getAttribute("content") === "summary") el.setAttribute("content", "summary_large_image");
    } })
    .on('meta[name="description"]', { element: (el: { getAttribute(n: string): string | null }) => { s.desc = el.getAttribute("content") ?? ""; } })
    .on("title", { text: (t: { text: string }) => { s.title += t.text; } })
    .on('script[type="application/ld+json"]', { text: (t: { text: string }) => { s.ld += t.text; } })
    .on("head", { element: (el: { onEndTag(cb: (end: { before(html: string, o: { html: boolean }): void }) => void): void }) => {
      el.onEndTag((end) => {
        if (s.noindex) return;
        let html = "";
        if (!s.canonical) html += `<link rel="canonical" href="${canonical}"/>`;
        if (!s.ogUrl) html += `<meta property="og:url" content="${canonical}"/>`;
        if (!s.ogImage) {
          const alt = esc(decode(s.title) || SEO.name);
          html += `<meta property="og:image" content="${OG_IMAGE}"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta property="og:image:alt" content="${alt}"/><meta name="twitter:image" content="${OG_IMAGE}"/>`;
          if (!s.twCard) html += `<meta name="twitter:card" content="summary_large_image"/>`;
        }
        if (!s.robots) html += `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/>`;
        if (ADSENSE) html += `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>`;
        if (html) end.before(html, { html: true });
      });
    } })
    .on("body", { element: (el: { onEndTag(cb: (end: { before(html: string, o: { html: boolean }): void }) => void): void }) => {
      el.onEndTag((end) => {
        if (s.noindex) return;
        const json = graph(url, decode(s.title), decode(s.desc), s.ld);
        if (json) end.before(`<script type="application/ld+json">${json}</script>`, { html: true });
      });
    } })
    .transform(response);
}
