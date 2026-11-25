import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, FileCheck2, Languages, WalletCards } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { citiesForCountry, getCountry, SITE_URL } from "@/lib/cities";
import { getDirectoryProfiles } from "@/lib/pvgis.functions";
import { calculate, DEFAULTS, num } from "@/lib/solar";
import { Button } from "@/components/ui/button";
import { OfferSlot } from "@/components/OfferSlot";
import { BalkonLink } from "@/components/BalkonLink";
import { AmazonPicks } from "@/components/AmazonPicks";
import { SOLAR_PICKS } from "@/lib/amazon-picks";

export const Route = createFileRoute("/countries/$slug")({
  loader: async ({ params }) => {
    const country = getCountry(params.slug);
    if (!country) throw notFound();
    const cities = citiesForCountry(country.slug);
    const profiles = await getDirectoryProfiles({ data: { places: cities } });
    return { country, entries: cities.map((city) => ({ city, profile: profiles.find((p) => p.slug === city.slug)?.profile ?? null })) };
  },
  staleTime: 24 * 60 * 60 * 1000,
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Country unavailable | SolarPayback" }, { name: "robots", content: "noindex" }] };
    const { country, entries } = loaderData;
    const t = `Solar panels in ${country.name}: city yield guide | SolarPayback`;
    const d = `Compare live PVGIS solar yield in ${entries.map((e) => e.city.name).join(", ")}. Calculate payback in ${country.currency} and check official energy guidance.`;
    const url = `${SITE_URL}/countries/${country.slug}`;
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "article" }, { property: "og:url", content: url }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: url }], scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Cities", item: `${SITE_URL}/cities` }, { "@type": "ListItem", position: 2, name: country.name, item: url }] }) }] };
  },
  errorComponent: () => <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-2xl px-5 py-24"><h1 className="text-4xl font-semibold">Country data is temporarily unavailable</h1></main><SiteFooter /></div>,
  notFoundComponent: () => <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-2xl px-5 py-24"><h1 className="text-4xl font-semibold">Country not found</h1><Button asChild className="mt-6"><Link to="/cities">Browse all cities</Link></Button></main><SiteFooter /></div>,
  component: CountryPage,
});

function CountryPage() {
  const { country, entries } = Route.useLoaderData();
  const available = entries.filter((e) => e.profile);
  const average = available.length ? available.reduce((s, e) => s + e.profile!.annualKwhPerKwp, 0) / available.length : 0;
  return <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-12">
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link to="/" className="hover:text-foreground">Home</Link> / <Link to="/cities" className="hover:text-foreground">Cities</Link> / <span className="text-foreground">{country.name}</span></nav>
    <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Country solar guide</p><h1 className="mt-3 text-4xl font-semibold sm:text-6xl">Solar panels in {country.name}</h1><p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">{country.intro}</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><Info icon={WalletCards} label="Calculator currency" value={country.currency} /><Info icon={Languages} label="Local language" value={country.language} /><Info icon={FileCheck2} label="Cities compared" value={`${entries.length} · average ${average ? num(average) : "—"} kWh/kWp`} /></div>
    <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-3xl font-semibold">City solar yields</h2><p className="mt-1 text-sm text-muted-foreground">Consistent PVGIS assumptions make differences easier to interpret.</p></div><Button asChild variant="outline"><Link to="/compare" search={{ cities: entries.map((e) => e.city.slug).slice(0, 3) }}>Compare these cities<ArrowRight /></Link></Button></div><div className="mt-6 space-y-3">{entries.map(({ city, profile }) => { const result = profile ? calculate({ ...DEFAULTS, annualKwhPerKwp: profile.annualKwhPerKwp }) : null; return <Link key={city.slug} to="/cities/$slug" params={{ slug: city.slug }} className="grid gap-3 rounded-2xl border border-border p-4 transition hover:border-primary sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center"><span className="font-display text-xl font-semibold">{city.name}</span><span className="text-sm"><span className="text-muted-foreground">Yield </span><strong>{profile ? `${num(profile.annualKwhPerKwp)} kWh/kWp` : "Unavailable"}</strong></span><span className="text-sm"><span className="text-muted-foreground">Reference payback </span><strong>{result?.payback != null ? `${num(result.payback, 1)} years` : "—"}</strong></span><ArrowRight className="hidden h-5 w-5 text-primary sm:block" /></Link>; })}</div><p className="mt-4 text-xs text-muted-foreground">Reference payback is illustrative and not a local market quote. Use each city's calculator for your own figures.</p></section>
    {country.slug === "germany" && <BalkonLink />}
    <OfferSlot id="installer-quotes" itemKey={`country:${country.slug}`} context={country.name} />
    <OfferSlot id="balcony-solar" itemKey={`balcony:country:${country.slug}`} context={country.name} />
    <AmazonPicks title={`Tools to sharpen your ${country.name} solar estimate`} intro="Knowing when you use electricity matters as much as panel size." picks={SOLAR_PICKS} />
    <CountryInsights country={country} entries={entries} />
    <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="rounded-3xl bg-night p-7 text-night-foreground shadow-soft"><h2 className="text-3xl font-semibold">Before you trust a payback quote</h2><ul className="mt-5 space-y-4">{country.checklist.map((item, i) => <li key={item} className="flex gap-3 text-night-muted"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun text-xs font-bold text-night">{i + 1}</span><span>{item}</span></li>)}</ul></section>
      <aside className="rounded-3xl border border-border bg-card p-7 shadow-soft"><h2 className="text-2xl font-semibold">Verify the current rules</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Incentives, export arrangements and eligibility can change. We do not claim a grant or tariff without a current, installation-specific source.</p><a href={country.officialSource} target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm font-semibold hover:border-primary hover:text-primary">{country.officialSourceLabel}<ExternalLink className="h-4 w-4 shrink-0" /></a><p className="mt-3 text-xs text-muted-foreground">Official starting point, not a determination of eligibility. Confirm the exact scheme and effective date for your address.</p></aside>
    </div>
  </main><SiteFooter /></div>;
}
function Info({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) { return <div className="rounded-2xl border border-border bg-card p-5 shadow-soft"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Entry = { city: { slug: string; name: string }; profile: { annualKwhPerKwp: number; monthly: { month: number; kwh: number }[] } | null };

/** Answer-first summary, production table, monthly profile and FAQ — all computed from live PVGIS profiles and the calculator's reference inputs. */
function CountryInsights({ country, entries }: { country: { name: string; officialSourceLabel: string; officialSource: string; checklist: string[] }; entries: Entry[] }) {
  const rows = entries.filter((e) => e.profile).map((e) => {
    const p = e.profile!; const r = calculate({ ...DEFAULTS, annualKwhPerKwp: p.annualKwhPerKwp });
    const sorted = [...p.monthly].sort((a, b) => b.kwh - a.kwh);
    return { name: e.city.name, slug: e.city.slug, y: p.annualKwhPerKwp, payback: r.payback, best: sorted[0], worst: sorted[sorted.length - 1] };
  }).sort((a, b) => b.y - a.y);
  if (!rows.length) return null;
  const top = rows[0]!, low = rows[rows.length - 1]!;
  const pb = rows.map((r) => r.payback).filter((x): x is number => x != null);
  const avgMonthly = MONTHS.map((_, i) => { const v = entries.filter((e) => e.profile).map((e) => e.profile!.monthly.find((m) => m.month === i + 1)?.kwh ?? 0); return v.reduce((s, x) => s + x, 0) / v.length; });
  const maxM = Math.max(...avgMonthly);
  const ref = `a ${DEFAULTS.systemKw} kWp system at ${num(DEFAULTS.costPerKw)} per kWp installed, ${DEFAULTS.importPrice} per kWh import price, ${DEFAULTS.exportPrice} per kWh export and ${DEFAULTS.selfUsePct}% self-consumption`;
  const answer = `PVGIS estimates ${num(low.y)}–${num(top.y)} kWh per installed kWp per year across the ${rows.length} ${country.name} cities we track, with ${top.name} the sunniest. ${pb.length ? `Using our reference assumptions (${ref}), simple payback ranges from about ${num(Math.min(...pb), 1)} to ${num(Math.max(...pb), 1)} years.` : ""} Your own tariff, roof and quote matter more than the city average, so run the calculator with your figures.`;
  const faq = [
    { q: `Is solar worth it in ${country.name}?`, a: answer },
    { q: `Which city in ${country.name} gets the most solar output?`, a: `${top.name}, at about ${num(top.y)} kWh per kWp per year in PVGIS. The lowest of the cities we track is ${low.name} at about ${num(low.y)} kWh per kWp.` },
    { q: `How much electricity does a 5 kWp solar system produce in ${country.name}?`, a: `Roughly ${num(low.y * 5)}–${num(top.y * 5)} kWh per year depending on the city, before panel degradation, for a south-facing system at 30° tilt with 14% system losses (the PVGIS settings used on this page).` },
    { q: `Which month produces the most solar power in ${country.name}?`, a: `${MONTHS[avgMonthly.indexOf(maxM)]} is the strongest month on average, at about ${num(maxM)} kWh per kWp. ${MONTHS[avgMonthly.indexOf(Math.min(...avgMonthly))]} is the weakest, at about ${num(Math.min(...avgMonthly))} kWh per kWp.` },
    { q: `Where can I check solar incentives in ${country.name}?`, a: `Start with the official source, ${country.officialSourceLabel} (${country.officialSource}). Incentives and export terms change, so confirm the current scheme for your address before counting on one.` },
  ];
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) }).replace(/</g, "\u003c");
  return <>
    <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft"><h2 className="text-3xl font-semibold">Is solar worth it in {country.name}?</h2><p className="mt-3 text-lg leading-relaxed">{answer}</p></section>
    <section className="mt-10"><h2 className="text-3xl font-semibold">How much a solar system produces in {country.name}</h2><p className="mt-2 text-sm text-muted-foreground">Annual output in kWh = PVGIS yield per kWp × system size. South-facing, 30° tilt, 14% system losses.</p>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="p-3">City</th><th className="p-3">kWh/kWp</th><th className="p-3">3 kWp</th><th className="p-3">5 kWp</th><th className="p-3">8 kWp</th><th className="p-3">Best month</th><th className="p-3">Weakest month</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.slug} className="border-t border-border"><td className="p-3 font-medium"><Link to="/cities/$slug" params={{ slug: r.slug }} className="hover:text-primary">{r.name}</Link></td><td className="p-3">{num(r.y)}</td><td className="p-3">{num(r.y * 3)}</td><td className="p-3">{num(r.y * 5)}</td><td className="p-3">{num(r.y * 8)}</td><td className="p-3">{r.best ? MONTHS[r.best.month - 1] : "—"}</td><td className="p-3">{r.worst ? MONTHS[r.worst.month - 1] : "—"}</td></tr>)}</tbody></table></div></section>
    <section className="mt-10"><h2 className="text-3xl font-semibold">Monthly solar output in {country.name}</h2><p className="mt-2 text-sm text-muted-foreground">Average kWh per kWp across the cities above.</p>
      <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-12">{avgMonthly.map((v, i) => <div key={MONTHS[i]} className="text-center"><div className="mx-auto flex h-28 w-full items-end rounded-lg bg-muted/40"><div className="w-full rounded-lg bg-sun" style={{ height: `${Math.max(4, (v / maxM) * 100)}%` }} /></div><p className="mt-1 text-xs font-medium">{MONTHS[i]}</p><p className="text-[11px] text-muted-foreground">{num(v)}</p></div>)}</div></section>
    <section className="mt-10"><h2 className="text-3xl font-semibold">Frequently asked questions</h2><div className="mt-5 divide-y divide-border rounded-2xl border border-border">{faq.map((x) => <div key={x.q} className="p-5"><h3 className="font-semibold">{x.q}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{x.a}</p></div>)}</div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} /></section>
  </>;
}

