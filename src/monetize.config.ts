// Partner / affiliate slots. A slot stays invisible until its url is set.
// Add your tracking link to "url" (and the programme name to "partner"), commit, push: Cloudflare deploys it.
// Per-item links (e.g. one product page per device) go in OFFER_LINKS keyed by item slug; they override the slot url.
export type OfferSlotId = "installer-quotes";
export type OfferSlot = { heading: string; body: string; cta: string; url: string; partner: string };

export const OFFER_SLOTS: Record<OfferSlotId, OfferSlot> = {
  "installer-quotes": { heading: "Compare solar installer quotes in {context}", body: "Request quotes from local installers, then test each quote's figures in the SolarPayback calculator.", cta: "Get installer quotes", url: "", partner: "" },
};

// Per-page offers keyed "country:<slug>" or "city:<slug>". A string is just a link for the slot's own
// wording; an object can also replace the wording, for partners that only serve some countries.
export type OfferLink = string | ({ url: string } & Partial<Omit<OfferSlot, "url">>);

// Otovo DE (Awin advertiser 42788, publisher 2088065): solar installer, Germany only.
const OTOVO_DE: OfferLink = {
  url: "https://www.awin1.com/cread.php?awinmid=42788&awinaffid=2088065",
  partner: "Otovo",
  heading: "Get a solar price for your roof in {context}",
  body: "Otovo prices a rooftop system for your address online and handles installation in Germany. Compare its offer with local installers, then test the figures in the SolarPayback calculator.",
  cta: "See Otovo's price",
};

export const OFFER_LINKS: Record<string, OfferLink> = {
  "country:germany": OTOVO_DE,
  "city:munich": OTOVO_DE,
  "city:berlin": OTOVO_DE,
  "city:hamburg": OTOVO_DE,
};

// Amazon Associates tracking ID for this site (empty = no Amazon links).
export const AMAZON = { tag: "papalex-solarpayback-20", domain: "www.amazon.com" };
