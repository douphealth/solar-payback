import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Calculator } from "@/components/Calculator";
import { CITIES, citiesForCountry, currencyForCountry, getCity, SITE_URL } from "@/lib/cities";
import { getDirectoryProfiles, getSolarProfile } from "@/lib/pvgis.functions";
import { DEFAULTS, calculate, money, num } from "@/lib/solar";
import { Button } from "@/components/ui/button";
import { OfferSlot } from "@/components/OfferSlot";
import { AmazonPicks } from "@/components/AmazonPicks";
import { SOLAR_PICKS } from "@/lib/amazon-picks";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const Route = createFileRoute("/cities/$slug")({
  loader: async ({ params }) => {
    const city = getCity(params.slug);
    if (!city) throw notFound();
    const countryCities = citiesForCountry(city.countrySlug);
    const [profile, countryProfiles] = await Promise.all([
      getSolarProfile({ data: { lat: city.lat, lon: city.lon } }),
      getDirectoryProfiles({ data: { places: countryCities } }),
    ]);
    return { city, profile, countryProfiles };
  },
  staleTime: 24 * 60 * 60 * 1000,
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "City unavailable | SolarPayback" }, { name: "robots", content: "noindex" }] };
    const { city, profile } = loaderData;
    const t = `${city.name} solar yield & payback | SolarPayback`;
    const d = `${city.name} produces about ${num(profile.annualKwhPerKwp)} kWh/kWp/year (PVGIS). Compare monthly output and calculate payback with your own quote.`;
    const url = `${SITE_URL}/cities/${city.slug}`;
    return {
      meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "article" }, { property: "og:url", content: url }, { name: "twitter:card", content: "summary_large_image" }],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@graph": [
        { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` }, { "@type": "ListItem", position: 2, name: "Cities", item: `${SITE_URL}/cities` }, { "@type": "ListItem", position: 3, name: city.country, item: `${SITE_URL}/countries/${city.countrySlug}` }, { "@type": "ListItem", position: 4, name: city.name, item: url }] },
        { "@type": "Dataset", name: `${city.name} solar production profile`, url, description: d, license: "https://commission.europa.eu/legal-notice_en", isAccessibleForFree: true, dateModified: profile.fetchedAt, spatialCoverage: { "@type": "Place", name: `${city.name}, ${city.country}`, geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lon } }, variableMeasured: ["Annual photovoltaic output kWh/kWp", "Monthly photovoltaic output kWh/kWp"], measurementTechnique: `EU JRC PVGIS 5.3 ${profile.radiationDb}, fixed 30 degree south-facing system`, creator: { "@type": "Organization", name: "European Commission Joint Research Centre", url: "https://re.jrc.ec.europa.eu/pvgis.html" } },
      ] }) }],
    };
  },
  errorComponent: () => <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="text-3xl font-semibold">Solar data is temporarily unavailable</h1><p className="mt-3 text-muted-foreground">No cached profile is available for this city yet. Please retry, or calculate for another location.</p><Button asChild className="mt-6"><Link to="/calculator">Open the calculator</Link></Button></main><SiteFooter /></div>,
  notFoundComponent: () => <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="text-3xl font-semibold">City not found</h1><p className="mt-3 text-muted-foreground">Try the searchable directory or calculate for any supported location.</p><Button asChild className="mt-6"><Link to="/cities">Browse cities</Link></Button></main><SiteFooter /></div>,
  component: CityPage,
});

function CityPage() {
  const { city, profile, countryProfiles } = Route.useLoaderData();
  const best = [...profile.monthly].sort((a, b) => b.kwh - a.kwh)[0]!;
  const worst = [...profile.monthly].sort((a, b) => a.kwh - b.kwh)[0]!;
  const currency = currencyForCountry(city.country);
  const ref = calculate({ ...DEFAULTS, annualKwhPerKwp: profile.annualKwhPerKwp });
  const countryYields = countryProfiles.filter((p) => p.profile).map((p) => p.profile!.annualKwhPerKwp);
  const countryAverage = countryYields.length ? countryYields.reduce((a, b) => a + b, 0) / countryYields.length : profile.annualKwhPerKwp;
  const vsCountry = ((profile.annualKwhPerKwp / countryAverage) - 1) * 100;
  const seasonRatio = best.kwh / worst.kwh;
  const nearby = CITIES.filter((c) => c.slug !== city.slug).map((c) => ({ c, d: distance(city.lat, city.lon, c.lat, c.lon) })).sort((a, b) => a.d - b.d).slice(0, 5).map((x) => x.c);

  return <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-12">
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link to="/" className="hover:text-foreground">Home</Link> / <Link to="/cities" className="hover:text-foreground">Cities</Link> / <Link to="/countries/$slug" params={{ slug: city.countrySlug }} className="hover:text-foreground">{city.country}</Link> / <span className="text-foreground">{city.name}</span></nav>
    <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Live city solar profile</p><h1 className="mt-3 text-4xl font-semibold sm:text-6xl">Solar panels in {city.name}</h1>
    <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">Each kilowatt of south-facing panels at 30° in {city.name} generates about <strong className="text-foreground">{num(profile.annualKwhPerKwp)} kWh per year</strong>, ranging from {num(worst.kwh)} kWh in {MONTHS[worst.month - 1]} to {num(best.kwh)} kWh in {MONTHS[best.month - 1]}.</p>
    {profile.stale && <p className="mt-5 rounded-xl bg-accent p-4 text-sm text-accent-foreground">PVGIS is temporarily unavailable. This page is using its latest cached profile from {new Date(profile.fetchedAt).toLocaleDateString("en-GB")}.</p>}
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
      ["Annual yield", `${num(profile.annualKwhPerKwp)} kWh/kWp`], ["Best month", `${MONTHS[best.month - 1]} · ${num(best.kwh)} kWh`], ["Year-to-year variation", profile.yearToYearSdKwh ? `±${num(profile.yearToYearSdKwh)} kWh` : "—"], ["Reference payback*", ref.payback ? `${num(ref.payback, 1)} years` : `> ${DEFAULTS.lifetime} years`],
    ].map(([l, v]) => <div key={l} className="rounded-2xl border border-border bg-card p-5 shadow-soft"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 font-display text-2xl font-semibold tabular">{v}</p></div>)}</div>

    <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold">Monthly production per kWp</h2><p className="mt-1 text-sm text-muted-foreground">The strongest month produces {num(seasonRatio, 1)}× the weakest month.</p></div><Button asChild variant="outline" size="sm"><Link to="/compare" search={{ cities: [city.slug, ...nearby.slice(0, 2).map((c) => c.slug)] }}>Compare cities<ArrowRight /></Link></Button></div><div className="mt-4 h-64"><ResponsiveContainer><BarChart data={profile.monthly.map((m) => ({ m: MONTHS[m.month - 1], kwh: m.kwh }))}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="m" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} /><Tooltip formatter={(n: number) => `${num(n, 1)} kWh`} cursor={{ fill: "var(--muted)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)" }} /><Bar isAnimationActive={false} dataKey="kwh" fill="var(--primary)" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">View monthly data table</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{profile.monthly.map((m) => <p key={m.month} className="flex justify-between rounded-lg bg-secondary px-3 py-2 text-xs"><span>{MONTHS[m.month - 1]}</span><strong>{num(m.kwh, 1)} kWh</strong></p>)}</div></details>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Source: <a href="https://re.jrc.ec.europa.eu/pvgis.html" target="_blank" rel="noreferrer" className="underline">EU JRC PVGIS 5.3 <ExternalLink className="inline h-3 w-3" /></a>, {profile.radiationDb} ({profile.period}), {city.lat.toFixed(4)}, {city.lon.toFixed(4)}{profile.elevation != null ? `, ${num(profile.elevation)} m elevation` : ""}. Retrieved {new Date(profile.fetchedAt).toISOString().slice(0, 10)}. *Reference payback uses illustrative defaults ({DEFAULTS.systemKw} kWp, {money(DEFAULTS.costPerKw, currency)}/kWp, {money(DEFAULTS.importPrice, currency, 2)}/kWh) — not a local market price.</p>
    </section>

    <section className="mt-12 grid gap-6 md:grid-cols-3"><Insight title="What a 5 kWp system means">At this location's modelled yield, a 5 kWp first-year array would produce about <strong>{num(profile.annualKwhPerKwp * 5)} kWh</strong>. Your usable savings depend on when you consume electricity, not just this total.</Insight><Insight title={`Versus ${city.country}`}>This profile is <strong>{num(Math.abs(vsCountry), 1)}% {vsCountry >= 0 ? "above" : "below"}</strong> the average of the {countryYields.length} {city.country} {countryYields.length === 1 ? "city" : "cities"} currently in this directory. That is a comparison of modelled city-centre points, not roof suitability.</Insight><Insight title="Seasonality matters">Output peaks in {MONTHS[best.month - 1]} and bottoms in {MONTHS[worst.month - 1]}. A high annual total can still leave winter imports; batteries and tariffs need an hourly assessment.</Insight></section>

    <OfferSlot id="installer-quotes" itemKey={`city:${city.slug}`} context={city.name} />
    <AmazonPicks title={`Tools to sharpen your ${city.name} solar estimate`} intro="Knowing when you use electricity matters as much as panel size." picks={SOLAR_PICKS} />
    <section className="mt-16"><h2 className="text-3xl font-semibold">Estimate your own payback in {city.name}</h2><p className="mt-2 max-w-2xl text-muted-foreground">Replace every illustrative assumption with your own quote and bill. Adjust roof settings under Advanced.</p><div className="mt-6"><Calculator initial={{ place: { name: city.name, country: city.country, lat: city.lat, lon: city.lon }, profile }} /></div></section>
    <section className="mt-16"><h2 className="text-2xl font-semibold">Nearby solar profiles</h2><div className="mt-4 flex flex-wrap gap-2">{nearby.map((c) => <Link key={c.slug} to="/cities/$slug" params={{ slug: c.slug }} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary">{c.name}<span className="ml-1 text-muted-foreground">· {c.country}</span></Link>)}</div></section>
  </main><SiteFooter /></div>;
}

function Insight({ title, children }: { title: string; children: ReactNode }) { return <article className="rounded-2xl border border-border bg-secondary p-5"><h3 className="font-display text-xl font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p></article>; }
function distance(aLat: number, aLon: number, bLat: number, bLon: number) { const r = Math.PI / 180; const x = (bLon - aLon) * r * Math.cos((aLat + bLat) * r / 2); const y = (bLat - aLat) * r; return Math.hypot(x, y); }
