import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

/** Cross-link from German country/city pages to the German-language balcony solar calculator. */
export function BalkonLink() { return <Link to="/balkonkraftwerk-rechner" lang="de" className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-primary/40 bg-accent/40 p-5 hover:border-primary"><span><span className="block text-xs font-semibold uppercase tracking-wider text-primary">Auf Deutsch</span><span className="mt-1 block text-lg font-semibold">Balkonkraftwerk-Rechner: Ertrag und Amortisation mit 800-W-Grenze</span><span className="mt-1 block text-sm text-muted-foreground">Balcony solar calculator in German, using live PVGIS data for any German address.</span></span><ArrowRight className="h-5 w-5 shrink-0 text-primary" /></Link>; }
