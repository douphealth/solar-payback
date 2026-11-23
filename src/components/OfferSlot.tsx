import { OFFER_SLOTS, OFFER_LINKS, type OfferSlotId } from "@/monetize.config";

/**
 * Affiliate / partner slot. Renders nothing until a URL is configured in src/monetize.config.ts,
 * so unconfigured slots never ship empty boxes. Always labelled and kept apart from research content.
 */
export function OfferSlot({ id, itemKey, context }: { id: OfferSlotId; itemKey?: string; context?: string }) {
  const base = OFFER_SLOTS[id];
  const link = itemKey ? OFFER_LINKS[itemKey] : undefined;
  const slot = base && (typeof link === "object" ? { ...base, ...link } : base);
  const url = (typeof link === "string" ? link : link?.url) || base?.url;
  if (!slot || !url) return null;
  const fill = (t: string) => t.replace(/\{context\}/g, context ?? "").replace(/\s+/g, " ").trim();
  return (
    <aside className="mx-auto my-10 w-full max-w-6xl px-5" aria-label="Partner offer">
      <div className="rounded-2xl border border-dashed border-border bg-card p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Partner{slot.partner ? ` · ${slot.partner}` : ""}</p>
          <p className="mt-1 text-lg font-semibold">{fill(slot.heading)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{fill(slot.body)}</p>
        </div>
        <a href={url} target="_blank" rel="sponsored nofollow noopener" data-offer={id} className="mt-4 inline-flex shrink-0 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:mt-0">{fill(slot.cta)} ↗</a>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">We may earn a commission if you buy through this link. It never changes our research, verdicts or rankings.</p>
    </aside>
  );
}
