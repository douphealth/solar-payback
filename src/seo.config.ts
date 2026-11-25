// Site-wide SEO settings used by src/lib/seo-edge.ts, /sitemap.xml and /llms.txt.
export type SeoPage = { path: string; title: string; section?: string; desc?: string; lastmod?: string };
import { CITIES, COUNTRY_GUIDES } from "@/lib/cities";

export const SEO = {
  origin: "https://solarpayback.shop",
  pagesDevHost: "solar-payback-93s.pages.dev",
  name: "SolarPayback",
  description: "Independent solar payback calculator using live EU PVGIS data: compare European cities, check installer quotes and export a transparent investment report (payback, NPV, IRR).",
  lang: "en",
  // Pages in another language: sets <html lang> and JSON-LD inLanguage for that path.
  pathLang: { "/balkonkraftwerk-rechner": "de" } as Record<string, string>,
  logo: "/favicon.png" as string | undefined,
  sameAs: [] as string[],
  sectionNames: {} as Record<string, string>,
  keepTrailingSlash: false,
  // Google AdSense publisher ID ("ca-pub-…"). Empty = no ad code and no /ads.txt.
  adsenseClient: "",
};

export const LLMS_NOTES: string[] = [
  "Yields come live from the EU JRC PVGIS API; financial formulas are documented on /methodology.",
  "Results are estimates; installer quotes and local tariffs determine real payback."
];

export function seoPages(): SeoPage[] {
  return [
    { path: "/", title: "SolarPayback — When will solar panels pay for themselves?", section: "Tools" },
    { path: "/calculator", title: "Solar payback calculator (NPV & IRR)", section: "Tools" },
    { path: "/compare", title: "Compare solar yield by city", section: "Tools" },
    { path: "/balkonkraftwerk-rechner", title: "Balkonkraftwerk-Rechner (German): balcony solar yield and payback with the 800 W cap", section: "Tools" },
    { path: "/cities", title: "Solar yield by city", section: "Cities" },
    { path: "/methodology", title: "Methodology", section: "About" },
    { path: "/about", title: "About", section: "About" },
    ...COUNTRY_GUIDES.map((c) => ({ path: `/countries/${c.slug}`, title: `Solar panels in ${c.name}: payback guide`, section: "Country guides" })),
    ...CITIES.map((c) => ({ path: `/cities/${c.slug}`, title: `${c.name} solar yield & payback`, section: "Cities" })),
  ];
}
