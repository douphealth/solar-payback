# SolarPayback Aurora 7.5.0

This repository contains the extracted application from the user-supplied **SolarPayback-Aurora-v7.4-CLOUDFLARE-DEPLOY.zip**. The ZIP filename is v7.4, but its internal `MANIFEST.json`, package version and engine identify **v7.5.0**. The original ZIP is preserved in `releases/` for exact provenance.

## Validation

```bash
npm test
npm run build
```

Node.js >=20. The build creates a Cloudflare Pages Advanced Mode `_worker.js` deployment in `dist/` (including all static assets). `npm test` runs the provided **22** deterministic tests. External PVGIS, real Stripe transactions and customer identity have **not** been independently verified in production.

## Cloudflare Pages (Git-connected project)

- Production branch: `main`
- Framework: None
- Build command: `npm run build`
- Build output: `dist`
- Root directory: repository root
- Deploy only after reviewing build logs and provisioned secrets.

For the **paid features**, set up an actual Cloudflare D1 database and apply `schema.sql`, create a private R2 bucket, and configure D1 binding **`DB`**, R2 binding **`REPORTS_BUCKET`**, plus authenticated environment secrets **`AUTH_SECRET`**, **`STRIPE_SECRET_KEY`**, and **`STRIPE_WEBHOOK_SECRET`**. An example of the intended binding shape is `wrangler.example.toml`; **do not use the placeholder database ID as a real deployment configuration**. Set the Stripe webhook URL to `/api/stripe/webhook` and verify test-mode purchase → webhook → report → refund in a staging project before accepting real payments.

## Security and accuracy limitations

- The uploaded application and its tests are included intact except for build/deployment compatibility files and documentation. No credentials are committed.
- This release has **not** been certified as enterprise-ready or ready for live paid customers. Source-verified estimates and illustrative models must not be conflated.
- D1/R2 and Stripe endpoints fail closed when bindings/secrets are missing; the public solar calculator may remain usable without paid infrastructure.
- `git revert <commit>` rolls back the app; Cloudflare Pages also supports deployment rollback. Back up D1 and R2 separately before any production schema change.
