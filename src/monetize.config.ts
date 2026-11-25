// Partner / affiliate slots. A slot stays invisible until its url is set.
// Add your tracking link to "url" (and the programme name to "partner"), commit, push: Cloudflare deploys it.
// Per-item links (e.g. one product page per device) go in OFFER_LINKS keyed by item slug; they override the slot url.
export type OfferSlotId = "installer-quotes" | "balcony-solar";
export type OfferSlot = { heading: string; body: string; cta: string; url: string; partner: string };

export const OFFER_SLOTS: Record<OfferSlotId, OfferSlot> = {
  "installer-quotes": { heading: "Compare solar installer quotes in {context}", body: "Request quotes from local installers, then test each quote's figures in the SolarPayback calculator.", cta: "Get installer quotes", url: "", partner: "" },
  "balcony-solar": { heading: "Starting smaller? Plug-in balcony solar in {context}", body: "A plug-in kit needs no roof installer. Check your local rules first, then test the output in the SolarPayback calculator.", cta: "See balcony solar kits", url: "", partner: "" },
};

// Per-page offers keyed "country:<slug>" or "city:<slug>". A string is just a link for the slot's own
// wording; an object can also replace the wording, for partners that only serve some countries.
export type OfferLink = string | ({ url: string } & Partial<Omit<OfferSlot, "url">>);

// Otovo DE (Awin advertiser 42788, publisher 2088065): solar installer, Germany only.
export const OTOVO_DE: OfferLink = {
  url: "https://www.awin1.com/cread.php?awinmid=42788&awinaffid=2088065",
  partner: "Otovo",
  heading: "Get a solar price for your roof in {context}",
  body: "Otovo prices a rooftop system for your address online and handles installation in Germany. Compare its offer with local installers, then test the figures in the SolarPayback calculator.",
  cta: "See Otovo's price",
};

// Anker SOLIX DE (Awin advertiser 32623, publisher 2088065): balcony solar and batteries, German shop. 5-8% CPA, 30-day cookie.
export const ANKER_SOLIX_DE: OfferLink = {
  url: "https://www.awin1.com/cread.php?awinmid=32623&awinaffid=2088065",
  partner: "Anker SOLIX",
  heading: "Starting smaller? Plug-in balcony solar in {context}",
  body: "Anker SOLIX sells plug-in balcony kits, with optional batteries, through its German shop. Germany allows plug-in systems up to 800 W inverter output, registered in the Marktstammdatenregister. Test the output in the SolarPayback calculator first.",
  cta: "See Anker SOLIX kits",
};

export const OFFER_LINKS: Record<string, OfferLink> = {
  "country:germany": OTOVO_DE,
  "city:munich": OTOVO_DE,
  "city:berlin": OTOVO_DE,
  "city:hamburg": OTOVO_DE,
  "balcony:country:germany": ANKER_SOLIX_DE,
  "balcony:city:munich": ANKER_SOLIX_DE,
  "balcony:city:berlin": ANKER_SOLIX_DE,
  "balcony:city:hamburg": ANKER_SOLIX_DE,
};

// Amazon Associates tracking ID for this site (empty = no Amazon links).
export const AMAZON = { tag: "papalex-solarpayback-20", domain: "www.amazon.com" };
