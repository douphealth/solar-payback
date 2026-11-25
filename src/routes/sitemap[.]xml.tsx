import { createFileRoute } from "@tanstack/react-router";
import { CITIES, COUNTRY_GUIDES, SITE_URL } from "@/lib/cities";

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: () => {
    const paths = ["/", "/calculator", "/cities", "/compare", "/balkonkraftwerk-rechner", "/methodology", "/about", "/privacy", "/terms", "/contact", ...COUNTRY_GUIDES.map((c) => `/countries/${c.slug}`), ...CITIES.map((c) => `/cities/${c.slug}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n")}\n</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
  } } },
});
