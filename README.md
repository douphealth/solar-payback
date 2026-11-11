# Helios — Solar Payback Intelligence

An independent, bilingual (English / Greek) solar investment dashboard for residential and small commercial PV systems. The original repository had only a README; this is its first functional app.

## What actually works

- **Real location-based solar yield:** PVGIS 5.3 of the European Commission Joint Research Centre, using a same-origin Cloudflare Pages Function. No browser-to-PVGIS AJAX requests (PVGIS explicitly rejects those).
- **Transparent 25-year economics:** annual and monthly electricity flows, avoided purchases, export remuneration, capital costs, assumed maintenance, degradation, inverter replacement, payback, discounted payback, NPV, net profit, and discounted lifetime energy cost per kWh.
- **Three labelled sensitivity scenarios:** cautious (10% less generation and 20% lower retail avoided price), base, and upside (10% more generation and 20% higher price). **These are stress tests, not statistical probability bands.**
- **Size explorer:** approximate linear production scaling for 3–10 kWp (plus the selected size), with net-cost and payback comparison.
- **Responsive zero-dependency interface:** English / Greek, location presets and optional permission-based geolocation, interactive generation and cash-flow graphics, month/year tables, CSV export, input validation, stale-request cancellation, and explicit provider error states.
- **No fabricated output:** when PVGIS is unavailable the application does not invent irradiance, electricity production or financial returns.

## Deploy to Cloudflare Pages

1. Connect this GitHub repository to Cloudflare Pages.
2. Set the **build command** to `npm run build`, **output directory** to `dist`, and root directory to the repository root.
3. Use Node.js 20 or newer (22 in CI). No environment variables or API keys are needed.
4. Keep the `/functions/api/solar.js` directory in the source repository so Pages Functions provides the `/api/solar` endpoint. A plain static-file host will serve the UI but **will not** run its solar-data integration.
5. Open the site, confirm the PVGIS source badge shows the actual dataset/years, then compare the same location and configuration with the [official PVGIS website](https://re.jrc.ec.europa.eu/pvg_tools/en/).

To build and run the calculation tests locally:

```bash
npm run check
npm run build
```

The output directory is `dist/`. A local static server alone cannot emulate Cloudflare Pages Functions. To exercise the live PVGIS integration, use the Cloudflare Pages deployment or an appropriately configured Wrangler Pages dev environment. `npm run check` uses mocked provider responses, **not a successful live PVGIS request**.

## Modelling approach and accuracy boundaries

- PVGIS monthly grid-connected `PVcalc` fixed-mounting production feeds the model. Default technology is crystalline silicon, mounting `free`, horizon data enabled. PVGIS 5.3 historical data extends through 2023; exact source years depend on the selected radiation dataset and location.
- Annual electricity demand is allocated evenly across 12 months. Direct self-consumption each month is `min(monthly output × assumed direct-use %, monthly demand)`. The remainder of PV production is exported; grid imports are monthly demand minus direct use. This conserves energy and avoids crediting the same kWh both as savings and export income.
- Annual production degrades by the chosen rate. Retail avoided-kWh and export-credit values grow at their separate assumed annual rates. O&M is a **constant nominal percentage of original installed cost**; an optional inverter replacement is charged in its selected year.
- Upfront net cost equals selected installed capacity × assumed EUR/kWp minus a confirmed grant (zero by default). Payback is the first year where cumulative cash flow crosses zero, fractionally interpolated. NPV discounts each year's net benefit at the user-selected annual discount rate. Lifetime net profit is undiscounted benefits minus O&M, inverter replacement, and net upfront cost.
- Lifetime energy cost is `discounted upfront and future costs / discounted solar energy`, not a retail tariff quote. CSV exports include inputs, monthly energy, annual cashflow and the model limits.
- **Not modeled:** actual hourly self-consumption matching, storage/battery dispatch, dynamically priced compensation, roof obstruction/shading surveys, utility standing charges, connection fees, financing interest, taxation, grid and inverter sizing constraints, actual installer bids, contractual subsidies, or future policy changes.
- PVGIS is a historical resource and technology model, **not an actual performance meter or financial guarantee**. An engineering site inspection and real tariff/installer quotes are required before investing.

### About the sample inputs

All starting monetary fields are explicitly **editable illustrative assumptions**, not a contractor offer. The €0.24/kWh starting retail reference reflects a published [Eurostat nrg_pc_204 first-half-2026 Greece household survey benchmark](https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_204/default/table?lang=en), and **may differ materially from the avoidable incremental components of an individual bill**. €0.06/kWh export remuneration, €1,450/kWp installed cost, 55% direct use, and all other starting financial values are **scenarios**, not verified rates. Grants begin at €0; do not enter unconfirmed awards.

Greece updated its self-consumption framework in September 2026. This model intentionally separates physical onsite use from exported energy; it does **not** promise legacy net-metering treatment or any fixed feed-in remuneration.

## Primary sources

- [European Commission JRC PVGIS API specification](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en) — PVcalc query parameters, azimuth convention, JSON output, CORS restriction, availability and rate limits.
- [PVGIS 5.3 technical background](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5_en) — solar and meteorological coverage and historical model years.
- [Eurostat household electricity price series (`nrg_pc_204`)](https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_204/default/table?lang=en) — population-level benchmark, not a personal electricity tariff.
- [Greek Ministry of Environment and Energy — September 2026 self-consumption framework](https://ypen.gov.gr/net-billing-pio-efkoli-i-paragogi-kai-katanalosi-ilektrikis-energeias-gia-idia-chrisi-apo-noikokyria-kai-epicheiriseis/).

## Code & security

`index.html` and `assets/` contain the accessible responsive UI. `lib/finance.mjs` is a pure and tested model. `functions/api/solar.js` strictly validates six numeric parameters, constructs a fixed official HTTPS upstream URL (no arbitrary URL or SSRF), rejects invalid provider output, handles upstream temporary errors and caches successful data for 24h when available. The app does not collect accounts, store coordinates on a backend, request API keys or include third-party tracking scripts. The browser location API is only called when the visitor explicitly clicks its button.

Security and quality checks run via `.github/workflows/quality.yml`. Changes should go through a PR with passing checks rather than being pushed unreviewed to production.
