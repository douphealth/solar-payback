# SolarPayback

A fast, bilingual (English / Greek) solar-investment dashboard. Real monthly photovoltaic generation is requested from the **European Commission Joint Research Centre (JRC) PVGIS 5.3** API using a Cloudflare Pages Function. The financial engine is transparent, browser-side and covered by deterministic unit tests. No fake solar data, invented tariffs, user accounts, advertising tracking, or paid APIs.

## Features

- Solar production based on PVGIS location, peak power, tilt, orientation, loss and mounting, including automatic horizon consideration.
- Validated 12-month kWh data with JRC data-source attribution, API retrieval timestamp, and no fabricated data when PVGIS is down.
- Geocoding through Open-Meteo with manual latitude/longitude entry and preset example cities.
- First-year savings, simple and discounted break-even, 25-year (configurable 1–40) annual cash flow, NPV, lifecycle cost of energy (LCOE), export revenue, nominal and discounted cumulative cash flow.
- Sensitivity calculation for ±10% PV production (explicitly **not** a statistical confidence interval), degradation, annual expenses, inverter replacement, grant, changing tariffs and cost discounting.
- Monthly production graph, lifetime cash-flow visualization, energy self-use/export allocation, scenario comparison, cash-flow table and CSV download.
- Responsive, keyboard accessible design with EN/EL language toggle, no external client-side dependencies, and locally saved scenario inputs (only in the browser).

## Cloudflare Pages deployment

1. Connect `douphealth/solar-payback` to Cloudflare **Pages**.
2. Production branch: `main` **after** the reviewed pull request is merged.
3. Framework preset: **None**. Build command: `npm run build`. Build output directory: `dist`.
4. `functions/api/solar.js` and `functions/api/places.js` deploy automatically as **Cloudflare Pages Functions**. These functions are necessary; simply uploading static `dist/` without Pages Functions will *not* provide PVGIS data.
5. No secrets or environment variables are required. Check `/api/solar?lat=37.9838&lon=23.7275&peakKw=5.5&slope=30&aspect=0&loss=14&mounting=free` returns `source`, `monthlyKwh` (12 values), `annualKwh`, `dataset`, `fetchedAt` and `inputs` before accepting production results.
6. In Cloudflare Pages configure a custom domain only after successful preview testing. Do not force-push or bypass checks.

### Local development and tests

Requires Node 20+ and no npm packages:

```sh
npm test
npm run build
```

For full serverless simulation, use Cloudflare's Pages development runtime (Wrangler) when available:

```sh
npx wrangler pages dev dist
```

The app intentionally does not fake `/api/solar` when the Pages Function is unavailable. Production PVGIS and geocoding calls cannot be tested without outbound network access.

## Financial methodology and limitations

For each month `m` of project year `y`:

```
generation(m,y) = PVGIS_monthly_kWh[m] × (1 - degradation)^ (y - 1)
self_used(m,y) = min(generation(m,y) × self_use_fraction, assumed_monthly_demand[m])
export(m,y)    = generation(m,y) - self_used(m,y)
```

The `self_use_fraction` is a **user hypothesis** about same-time solar generation and demand, NOT a measured consumption profile. Monthly demand patterns may be flat, summer-heavy, or winter-heavy. Exact self-use requires hourly (or finer) load profiles and system/export policies. The model assumes each exported kWh receives the user-provided export price; it is **not** a legal net-metering, dynamic tariff, VAT, tax, debt, financing, time-of-use, or storage model. Do not use this to determine legal incentives or contract eligibility.

```
annual_import_savings = annual_self_used_kWh × retail_tariff(year)
annual_export_income  = annual_export_kWh × export_tariff(year)
annual_net_cash_flow  = annual_import_savings + annual_export_income
                        - maintenance(year) - insurance(year) - replacement(year)
upfront_cash_flow     = -(installed_cost - grant)
NPV                   = upfront_cash_flow + Σ(annual_net_cash_flow / (1 + discount_rate)^year)
LCOE                  = discounted(lifetime gross costs - grant) / discounted(lifetime generated kWh)
```

Simple and discounted payback are interpolated crossing times of cumulative cash flow. They may be `null` if the investment does not recover within the configured horizon; the dashboard prints “Not within X years” instead of pretending to show a valid payback. Sensitivity bands are **what-if scenarios**, not uncertainty distributions. The emission-intensity factor is an illustrative **user-supplied** constant, not live regional carbon-intensity data.

The currency selector **relabels** costs; it does not convert them. All sample costs, retail/export rates, system costs, demand and grid emissions are hypothetical and must be replaced with user-confirmed real numbers. Historical PVGIS irradiance and typical PV generation are not guarantees of individual-year output. Local shading, grid restrictions, roof suitability, fire safety, permit costs, actual installation quotations and financing also matter.

## External data and privacy

- [European Commission JRC PVGIS](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en) — official solar-irradiance and photovoltaic performance tools.
- [PVGIS 5.3 API documentation](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en) — parameters and request limitations. JRC **explicitly prohibits browser AJAX**, so the app uses an edge proxy. Historical source datasets are region-dependent and generally extend through 2023 in PVGIS 5.3.
- [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) — name-to-coordinate search.
- [PVGIS 6 API release notes](https://photovoltaic-geographic-information-system.ec.europa.eu/api/release-notes) — PVGIS 6 is newer but currently beta, with recent breaking changes (as of 2026-11-11); the app uses the more stable, documented PVGIS 5.3 path rather than silently relying on an unstable API schema.

The scenario form is saved to browser localStorage for convenience; delete site data to clear it. Coordinates are sent to the `/api/solar` edge function and on to PVGIS only when a solar calculation is requested. The location search term goes through `/api/places` to Open-Meteo. No account, telemetry or payment integration is implemented.

## Reliability and deployment guardrails

- API numeric bounds, untrusted response shape, 12 unique months and annual consistency are validated. A failed/malformed upstream response returns an error rather than a made-up yield.
- Server-side upstream timeouts, upstream overload messaging, and 24-hour shared response caching are used. No blanket retry loop or high-frequency polling.
- HTML, CSS and Javascript load locally without third-party runtime scripts; CSP, referrer and framing response headers are included in the build.
- `npm test` exercises generation conservation, financial calculations, invalid data, upstream errors and location query validation. A passing mock test does **not** prove live PVGIS availability.
- Rollback: revert the PR merge to return to the original README-only version, or redeploy the previous Cloudflare Pages deployment. A deploy is not initiated by this repository alone.

## License and attribution

PVGIS is a public service of the European Commission Joint Research Centre; this project is independent and not an official EU product. Respect upstream API terms and attribution requirements.
