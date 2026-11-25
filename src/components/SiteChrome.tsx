import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu } from "lucide-react";
import brandIcon from "@/assets/solarpayback-brand-icon.png";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/calculator", label: "Calculator" },
  { to: "/cities", label: "Cities" },
  { to: "/compare", label: "Compare" },
  { to: "/scenarios", label: "Saved" },
  { to: "/methodology", label: "Methodology" },
] as const;

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const base = overlay ? "text-night-foreground" : "text-foreground";
  const linkCls = overlay ? "text-night-foreground/80 hover:text-night-foreground" : "text-muted-foreground hover:text-foreground";
  return <header className={`${overlay ? "absolute inset-x-0 top-0 z-20" : "sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur"}`}>
    <div className={`mx-auto flex h-16 max-w-6xl items-center justify-between px-5 ${base}`}>
      <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold" aria-label="SolarPayback home"><img src={brandIcon} alt="" width={32} height={32} loading="eager" className="h-8 w-8 object-contain" />SolarPayback</Link>
      <nav className="hidden items-center gap-6 text-sm font-medium lg:flex" aria-label="Main navigation">{NAV.map((item) => <Link key={item.to} to={item.to} className={linkCls} activeProps={{ className: "!text-primary" }}>{item.label}</Link>)}</nav>
      <div className="lg:hidden"><Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className={`${overlay ? "text-night-foreground hover:bg-night-foreground/10 hover:text-night-foreground" : ""} h-11 w-11`} aria-label="Open navigation"><Menu /></Button></SheetTrigger><SheetContent side="right" className="w-[86vw] max-w-sm"><SheetHeader><SheetTitle className="font-display text-2xl">Explore SolarPayback</SheetTitle><SheetDescription>Independent estimates. No account or sales calls.</SheetDescription></SheetHeader><nav className="mt-8 grid gap-2" aria-label="Mobile navigation">{NAV.map((item) => <SheetClose asChild key={item.to}><Link to={item.to} className="rounded-xl px-4 py-3 font-medium hover:bg-muted" activeProps={{ className: "bg-accent text-accent-foreground" }}>{item.label}</Link></SheetClose>)}</nav><div className="mt-8 border-t border-border pt-6"><SheetClose asChild><Link to="/about" className="block rounded-xl px-4 py-3 text-sm hover:bg-muted">About & independence</Link></SheetClose><SheetClose asChild><Link to="/contact" className="block rounded-xl px-4 py-3 text-sm hover:bg-muted">Contact & corrections</Link></SheetClose></div></SheetContent></Sheet></div>
    </div>
  </header>;
}

export function SiteFooter() {
  return <footer className="mt-24 bg-night text-night-foreground"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
    <div><p className="font-display text-2xl">SolarPayback</p><p className="mt-3 text-sm leading-relaxed text-night-muted">Independent solar payback estimates built on EU JRC PVGIS data. No installer commissions, sponsored rankings or lead selling.</p></div>
    <FooterLinks title="Explore" links={[["Payback calculator", "/calculator"], ["City solar directory", "/cities"], ["Compare cities", "/compare"], ["Balkonkraftwerk-Rechner (DE)", "/balkonkraftwerk-rechner"], ["Saved scenarios", "/scenarios"]]} />
    <FooterLinks title="Understand" links={[["Methodology & limits", "/methodology"], ["About SolarPayback", "/about"], ["Contact & corrections", "/contact"]]} />
    <div className="text-sm"><p className="mb-3 font-semibold">Trust</p><ul className="space-y-2 text-night-muted"><li><Link to="/privacy" className="hover:text-night-foreground">Privacy</Link></li><li><Link to="/terms" className="hover:text-night-foreground">Terms & estimates</Link></li><li><a href="https://github.com/douphealth/solar-payback" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-night-foreground">Source repository<ArrowUpRight className="h-3 w-3" /></a></li></ul><p className="mt-5 text-xs leading-relaxed text-night-muted">Estimates only — not financial, tax or engineering advice. Solar data © European Union, PVGIS (JRC). Geocoding by Open-Meteo.</p></div>
  </div></footer>;
}
type FooterPath = "/calculator" | "/cities" | "/compare" | "/balkonkraftwerk-rechner" | "/scenarios" | "/methodology" | "/about" | "/contact";
function FooterLinks({ title, links }: { title: string; links: readonly (readonly [string, FooterPath])[] }) { return <div className="text-sm"><p className="mb-3 font-semibold">{title}</p><ul className="space-y-2 text-night-muted">{links.map(([label, to]) => <li key={to}><Link to={to} className="hover:text-night-foreground">{label}</Link></li>)}</ul></div>; }
