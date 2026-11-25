import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, Search, Sun, Zap } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SITE_URL } from "@/lib/cities";
import { geocode, getClipCurve, getDirectoryProfiles, getSolarProfile, type ClipCurve, type SolarProfile } from "@/lib/pvgis.functions";
import { calcBalkon, fmt } from "@/lib/balkon";
import { ANKER_SOLIX_DE, OTOVO_DE } from "@/monetize.config";

// German-language balcony solar calculator. Yields come live from EU JRC PVGIS; the 800 W inverter cap is
// applied hour by hour from one year of PVGIS hourly output. Page language is set to "de" in seo.config pathLang.

type Place = { name: string; lat: number; lon: number };
const DE_CITIES = [
  { slug: "berlin", name: "Berlin", lat: 52.52, lon: 13.405 },
  { slug: "hamburg", name: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { slug: "muenchen", name: "München", lat: 48.1351, lon: 11.582 },
  { slug: "koeln", name: "Köln", lat: 50.9375, lon: 6.9603 },
  { slug: "frankfurt", name: "Frankfurt am Main", lat: 50.1109, lon: 8.6821 },
  { slug: "stuttgart", name: "Stuttgart", lat: 48.7758, lon: 9.1829 },
  { slug: "leipzig", name: "Leipzig", lat: 51.3397, lon: 12.3731 },
  { slug: "freiburg", name: "Freiburg im Breisgau", lat: 47.999, lon: 7.8421 },
] as const;
const ANGLES = [{ v: 90, label: "Senkrecht am Balkongeländer (90°)" }, { v: 35, label: "Aufgeständert (35°)" }, { v: 15, label: "Flach, z. B. Garagendach (15°)" }];
const ASPECTS = [{ v: 0, label: "Süd" }, { v: -45, label: "Südost" }, { v: 45, label: "Südwest" }, { v: -90, label: "Ost" }, { v: 90, label: "West" }];
const ASPECT_NAME = (v: number) => ASPECTS.find((a) => a.v === v)?.label ?? `${v}°`;
const LOSS = 14;
const DEFAULT = { place: { name: "Berlin", lat: 52.52, lon: 13.405 } as Place, angle: 90, aspect: 0, moduleWp: 800, inverterW: 800, selfUsePct: 50, priceCt: 35, cost: 500 };
const URL_PATH = "/balkonkraftwerk-rechner";
const anker = ANKER_SOLIX_DE as { url: string };
const otovo = OTOVO_DE as { url: string };

export const Route = createFileRoute("/balkonkraftwerk-rechner")({
  loader: async () => {
    const q = { lat: DEFAULT.place.lat, lon: DEFAULT.place.lon, angle: DEFAULT.angle, aspect: DEFAULT.aspect, loss: LOSS };
    const [profile, clip, table] = await Promise.all([
      getSolarProfile({ data: q }).catch(() => null),
      getClipCurve({ data: q }).catch(() => null),
      getDirectoryProfiles({ data: { places: DE_CITIES.map(({ slug, lat, lon }) => ({ slug, lat, lon })) } }).catch(() => []),
    ]);
    return { profile, clip, table };
  },
  staleTime: 24 * 60 * 60 * 1000,
  head: () => {
    const t = "Balkonkraftwerk-Rechner: Ertrag & Amortisation für Ihren Ort | SolarPayback";
    const d = "Wie viel Strom erzeugt Ihr Balkonkraftwerk und wann hat es sich bezahlt gemacht? Live-Daten der EU (PVGIS) für Ihren Ort, mit 800-W-Grenze Stunde für Stunde gerechnet.";
    const url = `${SITE_URL}${URL_PATH}`;
    return {
      meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { property: "og:locale", content: "de_DE" }, { property: "og:url", content: url }, { name: "twitter:card", content: "summary_large_image" }],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "SolarPayback", item: `${SITE_URL}/` }, { "@type": "ListItem", position: 2, name: "Germany", item: `${SITE_URL}/countries/germany` }, { "@type": "ListItem", position: 3, name: "Balkonkraftwerk-Rechner", item: url }] }) }],
    };
  },
  component: BalkonPage,
});

function BalkonPage() {
  const data = Route.useLoaderData();
  const [place, setPlace] = useState<Place>(DEFAULT.place);
  const [angle, setAngle] = useState(DEFAULT.angle);
  const [aspect, setAspect] = useState(DEFAULT.aspect);
  const [moduleWp, setModuleWp] = useState(DEFAULT.moduleWp);
  const [inverterW, setInverterW] = useState(DEFAULT.inverterW);
  const [selfUsePct, setSelfUsePct] = useState(DEFAULT.selfUsePct);
  const [priceCt, setPriceCt] = useState(DEFAULT.priceCt);
  const [cost, setCost] = useState(DEFAULT.cost);
  const [profile, setProfile] = useState<SolarProfile | null>(data.profile);
  const [clip, setClip] = useState<ClipCurve | null>(data.clip);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    let live = true;
    const q = { lat: place.lat, lon: place.lon, angle, aspect, loss: LOSS };
    setLoading(true); setError("");
    Promise.all([getSolarProfile({ data: q }), getClipCurve({ data: q }).catch(() => null)])
      .then(([p, c]) => { if (live) { setProfile(p); setClip(c); } })
      .catch(() => { if (live) setError("Die PVGIS-Daten sind gerade nicht erreichbar. Bitte versuchen Sie es in einer Minute erneut."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [place, angle, aspect]);

  const result = profile ? calcBalkon({ kwhPerKwp: profile.annualKwhPerKwp, moduleWp, inverterW, clip, selfUsePct, priceCt, cost }) : null;

  // Server-rendered reference figures (Berlin default, plus the city table at 30° south) for the answer and FAQ.
  const ref = data.profile ? calcBalkon({ kwhPerKwp: data.profile.annualKwhPerKwp, ...DEFAULT, clip: data.clip }) : null;
  const ref2000 = data.profile && data.clip ? calcBalkon({ kwhPerKwp: data.profile.annualKwhPerKwp, ...DEFAULT, moduleWp: 2000, clip: data.clip }) : null;
  const rows = useMemo(() => DE_CITIES.map((c) => ({ ...c, y: data.table.find((t) => t.slug === c.slug)?.profile?.annualKwhPerKwp ?? null })).filter((r) => r.y != null) as { slug: string; name: string; lat: number; lon: number; y: number }[], [data.table]);
  const sorted = [...rows].sort((a, b) => b.y - a.y);
  const berlin30 = rows.find((r) => r.slug === "berlin")?.y ?? null;

  const answer = ref && sorted.length
    ? `Ein Balkonkraftwerk mit 800 Wp Modulleistung erzeugt in Deutschland laut PVGIS rund ${fmt(sorted[sorted.length - 1]!.y * 0.8)}–${fmt(sorted[0]!.y * 0.8)} kWh im Jahr, wenn die Module schräg (30°) nach Süden zeigen. Senkrecht am Balkongeländer in Berlin sind es etwa ${fmt(ref.annualKwh)} kWh. Wer davon die Hälfte selbst verbraucht und 35 Cent pro kWh zahlt, spart rund ${fmt(ref.savingsEur)} € im Jahr; ein Set für 500 € hat sich dann nach etwa ${ref.paybackYears ? fmt(ref.paybackYears, 1) : "–"} Jahren bezahlt gemacht.`
    : "Der Ertrag hängt von Ort, Ausrichtung und Neigung ab. Geben Sie unten Ihren Ort ein, um ihn mit Live-Daten der EU zu berechnen.";

  const faq = [
    { q: "Lohnt sich ein Balkonkraftwerk?", a: answer },
    { q: "Wie viel Strom erzeugt ein 800-Watt-Balkonkraftwerk?", a: sorted.length ? `Mit 800 Wp Modulen, 30° Neigung und Südausrichtung zwischen etwa ${fmt(sorted[sorted.length - 1]!.y * 0.8)} kWh (${sorted[sorted.length - 1]!.name}) und ${fmt(sorted[0]!.y * 0.8)} kWh (${sorted[0]!.name}) pro Jahr. Senkrecht montierte Module am Geländer liefern deutlich weniger${ref && berlin30 ? `: in Berlin etwa ${fmt(ref.annualKwh)} statt ${fmt(berlin30 * 0.8)} kWh` : ""}.` : "Das hängt stark von Ausrichtung und Neigung ab; der Rechner oben zeigt den Wert für Ihren Ort." },
    { q: "Lohnen sich 2.000 Wp Module bei 800 W Wechselrichter?", a: ref && ref2000 ? `Mehr Module bringen mehr Strom, aber nicht proportional: Der Wechselrichter kappt alles über 800 W. Für senkrechte Südmodule in Berlin ergeben 2.000 Wp etwa ${fmt(ref2000.annualKwh)} kWh im Jahr; ohne die Begrenzung wären es ${fmt(ref2000.rawKwh)} kWh, es gehen also rund ${fmt(ref2000.clipLossPct ?? 0, 1)} % verloren. Zusätzliche Module lohnen sich vor allem morgens, abends und im Winter, wenn die 800 W ohnehin nicht erreicht werden.` : "Der Wechselrichter begrenzt die Leistung auf 800 W. Wie viel dadurch verloren geht, zeigt der Rechner für Ihren Ort, Stunde für Stunde gerechnet." },
    { q: "Muss ich ein Balkonkraftwerk anmelden?", a: "Ja, aber nur noch im Marktstammdatenregister der Bundesnetzagentur. Die frühere zusätzliche Meldung beim Netzbetreiber ist seit dem Solarpaket I (Mai 2024) entfallen. Prüfen Sie die aktuellen Vorgaben direkt im Register." },
    { q: "Senkrecht am Balkon oder schräg aufgeständert?", a: ref && berlin30 ? `Schräg bringt mehr: In Berlin liefern 800 Wp senkrecht nach Süden etwa ${fmt(ref.annualKwh)} kWh, mit 30° Neigung etwa ${fmt(berlin30 * 0.8)} kWh. Senkrechte Module schneiden im Winter vergleichsweise gut ab, weil die Sonne dann tief steht.` : "Schräg aufgeständerte Module erzeugen übers Jahr mehr Strom; senkrechte schneiden im Winter vergleichsweise gut ab." },
  ];
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: "de-DE", mainEntity: faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) }).replace(/</g, "\\u003c");

  return <div className="min-h-screen" lang="de"><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-12">
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link to="/" className="hover:text-foreground">SolarPayback</Link> / <Link to="/countries/$slug" params={{ slug: "germany" }} className="hover:text-foreground">Deutschland</Link> / <span className="text-foreground">Balkonkraftwerk-Rechner</span></nav>
    <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Steckersolar · Live-Daten der EU</p>
    <h1 className="mt-3 text-4xl font-semibold sm:text-6xl">Balkonkraftwerk-Rechner</h1>
    <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">Wie viel Strom erzeugt ein Balkonkraftwerk an Ihrem Ort, und nach wie vielen Jahren hat es sich bezahlt gemacht? Der Rechner nutzt die Solardaten der Europäischen Kommission (PVGIS) und rechnet die 800-Watt-Grenze des Wechselrichters Stunde für Stunde ein.</p>

    <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-2xl font-semibold">Ihre Anlage</h2>
        <PlacePicker place={place} onPick={setPlace} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Neigung"><select className={inputCls} value={angle} onChange={(e) => setAngle(Number(e.target.value))}>{ANGLES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></Field>
          <Field label="Ausrichtung"><select className={inputCls} value={aspect} onChange={(e) => setAspect(Number(e.target.value))}>{ASPECTS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></Field>
          <Field label="Modulleistung gesamt (Wp)" hint="Erlaubt sind bis 2.000 Wp."><input className={inputCls} type="number" min={100} max={2000} step={50} value={moduleWp} onChange={(e) => setModuleWp(clamp(Number(e.target.value), 100, 2000))} /></Field>
          <Field label="Wechselrichter (W)" hint="Höchstens 800 W; ältere Sets oft 600 W."><select className={inputCls} value={inverterW} onChange={(e) => setInverterW(Number(e.target.value))}>{[800, 600, 400].map((w) => <option key={w} value={w}>{w} W</option>)}</select></Field>
          <Field label="Strompreis (Cent/kWh)" hint="Arbeitspreis laut Ihrer Rechnung."><input className={inputCls} type="number" min={5} max={80} step={0.5} value={priceCt} onChange={(e) => setPriceCt(clamp(Number(e.target.value), 0, 100))} /></Field>
          <Field label="Kaufpreis (€)"><input className={inputCls} type="number" min={0} max={5000} step={10} value={cost} onChange={(e) => setCost(clamp(Number(e.target.value), 0, 10000))} /></Field>
        </div>
        <Field label={`Eigenverbrauch: ${selfUsePct} %`} hint="Anteil des Solarstroms, den Ihr Haushalt direkt nutzt. Überschuss fließt in der Regel ohne Vergütung ins Netz. Ohne Speicher sind 30–70 % üblich, je nach Grundlast (Kühlschrank, Router, Standby)."><input className="mt-2 w-full accent-[hsl(var(--primary))]" type="range" min={10} max={100} step={5} value={selfUsePct} onChange={(e) => setSelfUsePct(Number(e.target.value))} /></Field>
      </div>

      <div className="rounded-3xl bg-night p-6 text-night-foreground shadow-soft" aria-live="polite">
        <div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Ergebnis</h2>{loading && <Loader2 className="h-5 w-5 animate-spin text-sun" aria-label="Lädt" />}</div>
        <p className="mt-1 text-sm text-night-muted"><MapPin className="mr-1 inline h-4 w-4" />{place.name} · {ASPECT_NAME(aspect)} · {angle}°</p>
        {error && <p className="mt-4 rounded-xl bg-destructive/20 p-3 text-sm">{error}</p>}
        {result ? <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat icon={Sun} label="Stromertrag pro Jahr" value={`${fmt(result.annualKwh)} kWh`} />
            <Stat icon={Zap} label="Davon selbst genutzt" value={`${fmt(result.usedKwh)} kWh`} />
            <Stat label="Ersparnis pro Jahr" value={`${fmt(result.savingsEur)} €`} />
            <Stat label="Amortisation" value={result.paybackYears ? `${fmt(result.paybackYears, 1)} Jahre` : "–"} />
          </div>
          <p className="mt-4 text-sm text-night-muted">Über 20 Jahre: {result.net20Eur >= 0 ? `rund ${fmt(result.net20Eur)} € Überschuss` : `rund ${fmt(-result.net20Eur)} € Verlust`} nach Abzug des Kaufpreises (ohne Strompreissteigerung und Modulalterung).</p>
          <p className="mt-3 text-sm text-night-muted">{result.clipLossPct == null ? "Die 800-W-Grenze konnte gerade nicht stündlich berechnet werden; der Ertrag ist daher eine Obergrenze." : result.clipLossPct < 0.5 ? `Die ${inverterW}-W-Grenze kostet bei dieser Anlage praktisch keinen Ertrag.` : `Die ${inverterW}-W-Grenze kappt rund ${fmt(result.clipLossPct, 1)} % des möglichen Ertrags (${fmt(result.rawKwh)} kWh ohne Grenze).`}</p>
          <MonthBars profile={profile!} factor={result.annualKwh / Math.max(1, profile!.annualKwhPerKwp)} />
        </> : !error && <p className="mt-6 text-night-muted">Daten werden geladen …</p>}
        <p className="mt-5 text-xs text-night-muted">Schätzung auf Basis von PVGIS ({profile?.radiationDb ?? "SARAH3"}{profile?.period ? `, ${profile.period}` : ""}), 14 % Systemverluste. Keine Rechts-, Steuer- oder Elektroberatung.</p>
      </div>
    </section>

    <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft"><h2 className="text-3xl font-semibold">Lohnt sich ein Balkonkraftwerk?</h2><p className="mt-3 text-lg leading-relaxed">{answer}</p></section>

    <PartnerBox partner="Anker SOLIX" url={anker.url} heading="Balkonkraftwerk-Sets von Anker SOLIX" body="Anker SOLIX verkauft Steckersolar-Sets und passende Speicher über seinen deutschen Shop. Rechnen Sie Ihren Ertrag oben zuerst mit Ihren eigenen Werten durch." cta="Anker SOLIX Sets ansehen" />

    {sorted.length > 0 && <section className="mt-10"><h2 className="text-3xl font-semibold">Ertrag eines 800-Wp-Balkonkraftwerks in deutschen Städten</h2><p className="mt-2 text-sm text-muted-foreground">Module 30° geneigt, nach Süden, 14 % Verluste. Jahreswerte laut PVGIS; senkrechte Montage liefert weniger.</p>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="p-3">Stadt</th><th className="p-3">kWh pro kWp</th><th className="p-3">800 Wp</th><th className="p-3">2.000 Wp (ohne 800-W-Grenze)</th></tr></thead>
        <tbody>{sorted.map((r) => <tr key={r.slug} className="border-t border-border"><td className="p-3 font-medium"><button type="button" className="hover:text-primary" onClick={() => { setPlace({ name: r.name, lat: r.lat, lon: r.lon }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{r.name}</button></td><td className="p-3">{fmt(r.y)}</td><td className="p-3">{fmt(r.y * 0.8)} kWh</td><td className="p-3">{fmt(r.y * 2)} kWh</td></tr>)}</tbody></table></div></section>}

    <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="rounded-3xl bg-night p-7 text-night-foreground shadow-soft"><h2 className="text-3xl font-semibold">Was in Deutschland gilt</h2><ul className="mt-5 space-y-3 text-night-muted">
        <li>• <strong className="text-night-foreground">800 W</strong> Wechselrichterleistung und bis zu <strong className="text-night-foreground">2.000 Wp</strong> Modulleistung (Solarpaket I, seit Mai 2024).</li>
        <li>• <strong className="text-night-foreground">Anmeldung</strong> nur noch im Marktstammdatenregister; die gesonderte Meldung beim Netzbetreiber entfällt.</li>
        <li>• Ein alter <strong className="text-night-foreground">Ferraris-Zähler</strong> darf übergangsweise weiterlaufen, bis der Messstellenbetreiber ihn tauscht.</li>
        <li>• <strong className="text-night-foreground">Mieter und Wohnungseigentümer</strong> haben seit Oktober 2024 grundsätzlich Anspruch auf Zustimmung; über das Wie (Anbringung, Optik) dürfen Vermieter bzw. Eigentümergemeinschaft mitreden.</li>
        <li>• Beim Kauf gilt in der Regel <strong className="text-night-foreground">0 % Mehrwertsteuer</strong>.</li>
        <li>• <strong className="text-night-foreground">Überschuss</strong> geht ins Netz, meist ohne Vergütung. Deshalb zählt vor allem der Eigenverbrauch.</li>
      </ul><p className="mt-5 text-xs text-night-muted">Stand: November 2026. Regeln können sich ändern; prüfen Sie Details vor dem Kauf.</p></section>
      <aside className="rounded-3xl border border-border bg-card p-7 shadow-soft"><h2 className="text-2xl font-semibold">Offizielle Quellen</h2>
        <a href="https://www.marktstammdatenregister.de/" target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm font-semibold hover:border-primary hover:text-primary">Marktstammdatenregister (Anmeldung)<ExternalLink className="h-4 w-4 shrink-0" /></a>
        <a href="https://www.bundesnetzagentur.de/" target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm font-semibold hover:border-primary hover:text-primary">Bundesnetzagentur<ExternalLink className="h-4 w-4 shrink-0" /></a>
        <a href="https://re.jrc.ec.europa.eu/pvg_tools/de/" target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm font-semibold hover:border-primary hover:text-primary">PVGIS der EU-Kommission (Datenquelle)<ExternalLink className="h-4 w-4 shrink-0" /></a>
      </aside>
    </div>

    <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft"><h2 className="text-3xl font-semibold">So rechnet der Rechner</h2><div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">
      <p><strong className="text-foreground">Ertrag:</strong> PVGIS liefert den langjährigen Jahresertrag pro Kilowatt-Peak für Ihren Ort, Ihre Neigung und Ausrichtung. Wir multiplizieren ihn mit Ihrer Modulleistung.</p>
      <p><strong className="text-foreground">800-W-Grenze:</strong> Für dieselbe Lage holen wir die stündlichen PVGIS-Werte eines ganzen Jahres ({clip?.year ?? 2023}) und kappen jede Stunde bei der Leistung Ihres Wechselrichters. So sieht man, ob sich zusätzliche Module lohnen. Die meisten einfachen Rechner ignorieren das.</p>
      <p><strong className="text-foreground">Ersparnis:</strong> Selbst genutzter Strom × Ihr Strompreis. Eingespeister Überschuss wird nicht vergütet. Amortisation = Kaufpreis ÷ jährliche Ersparnis, ohne Preissteigerung, Zinsen oder Modulalterung.</p>
    </div><p className="mt-4 text-sm">Lieber eine ganze Dachanlage durchrechnen? Nutzen Sie unseren <Link to="/calculator" className="font-semibold text-primary hover:underline">Amortisationsrechner für Dachanlagen</Link> (Englisch) oder die <Link to="/countries/$slug" params={{ slug: "germany" }} className="font-semibold text-primary hover:underline">Städteübersicht Deutschland</Link>.</p></section>

    <PartnerBox partner="Otovo" url={otovo.url} heading="Größer denken: Preis für eine Dachanlage" body="Otovo berechnet online einen Festpreis für eine Solaranlage auf Ihrem Dach und übernimmt die Installation in Deutschland. Vergleichen Sie das Angebot mit lokalen Installateuren." cta="Otovo-Preis ansehen" />

    <section className="mt-10"><h2 className="text-3xl font-semibold">Häufige Fragen</h2><div className="mt-5 divide-y divide-border rounded-2xl border border-border">{faq.map((x) => <div key={x.q} className="p-5"><h3 className="font-semibold">{x.q}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{x.a}</p></div>)}</div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} /></section>
  </main><SiteFooter /></div>;
}

const inputCls = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none";
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="mt-4 block text-sm font-medium first:mt-0">{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span>}</label>;
}
function Stat({ icon: Icon, label, value }: { icon?: typeof Sun; label: string; value: string }) {
  return <div className="rounded-2xl bg-night-foreground/5 p-4"><p className="flex items-center gap-1.5 text-xs text-night-muted">{Icon && <Icon className="h-3.5 w-3.5 text-sun" />}{label}</p><p className="mt-1 font-display text-2xl font-semibold">{value}</p></div>;
}
const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
function MonthBars({ profile, factor }: { profile: SolarProfile; factor: number }) {
  const vals = profile.monthly.map((m) => m.kwh * factor);
  const max = Math.max(...vals, 1);
  return <div className="mt-5"><p className="text-xs text-night-muted">Ertrag pro Monat in kWh (Kappung anteilig verteilt)</p><div className="mt-2 grid grid-cols-12 gap-1">{vals.map((v, i) => <div key={MONATE[i]} className="text-center"><div className="flex h-20 items-end rounded bg-night-foreground/5"><div className="w-full rounded bg-sun" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} /></div><p className="mt-1 text-[10px] text-night-muted">{MONATE[i]}</p><p className="text-[10px]">{fmt(v)}</p></div>)}</div></div>;
}

function PlacePicker({ place, onPick }: { place: Place; onPick: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await geocode({ data: { q: q.trim() } });
      setHits(res.filter((r) => /germany|deutschland/i.test(r.country)).map((r) => ({ name: r.name, lat: r.lat, lon: r.lon })));
    } catch { setHits([]); } finally { setBusy(false); }
  };
  return <div className="mt-4">
    <p className="text-sm font-medium">Ort</p>
    <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <input className={inputCls + " mt-0"} placeholder="Stadt oder Gemeinde, z. B. Dresden" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ort suchen" />
      <button type="submit" className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Suchen</button>
    </form>
    {hits && <div className="mt-2 flex flex-wrap gap-2">{hits.length ? hits.map((h) => <button key={`${h.lat},${h.lon}`} type="button" onClick={() => { onPick(h); setHits(null); setQ(""); }} className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary">{h.name}</button>) : <span className="text-xs text-muted-foreground">Kein Ort in Deutschland gefunden.</span>}</div>}
    <div className="mt-2 flex flex-wrap gap-2">{DE_CITIES.map((c) => <button key={c.slug} type="button" onClick={() => onPick({ name: c.name, lat: c.lat, lon: c.lon })} className={`rounded-full border px-3 py-1 text-xs ${place.name === c.name ? "border-primary bg-accent" : "border-border hover:border-primary"}`}>{c.name}</button>)}</div>
  </div>;
}

function PartnerBox({ partner, url, heading, body, cta }: { partner: string; url: string; heading: string; body: string; cta: string }) {
  return <aside className="my-10 w-full" aria-label="Partnerangebot">
    <div className="rounded-2xl border border-dashed border-border bg-card p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Partner · {partner}</p><p className="mt-1 text-lg font-semibold">{heading}</p><p className="mt-1 text-sm text-muted-foreground">{body}</p></div>
      <a href={url} target="_blank" rel="sponsored nofollow noopener" data-offer={`de-${partner.toLowerCase().replace(/\s+/g, "-")}`} className="mt-4 inline-flex shrink-0 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:mt-0">{cta} ↗</a>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Wir erhalten möglicherweise eine Provision, wenn Sie über diesen Link kaufen. An unseren Berechnungen ändert das nichts.</p>
  </aside>;
}
