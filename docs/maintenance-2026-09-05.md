# Maintenance and release protection — 2026-09-05

## Scope and release state

This maintenance is isolated on `codex/security-release-guardrails`, based on released commit `7dc98fd`. It does not change `src/`, public design assets, Astro configuration, Cloudflare configuration, or Sanity schemas. The separate spatial-design experiment is not included.

No production or Studio deployment has been performed for this maintenance. Existing production remains the approved film-archive release. Dependency updates do change compiled application assets and therefore require browser regression before any future deployment.

## Dependency maintenance

Only updates allowed by existing dependency ranges were applied. No `npm audit fix --force`, Sanity downgrade, cross-major framework migration, or broad dependency override was used.

| Lockfile | Before | After | Remaining severity |
| --- | --- | --- | --- |
| Website | 31 advisory entries | 11 | 1 low, 4 moderate, 6 high, 0 critical |
| Separate Studio | 36 advisory entries | 9 | 0 low, 4 moderate, 5 high, 0 critical |

These are npm audit package entries, not independent vulnerability counts; the two lockfiles overlap and must not be added together. Results are a point-in-time registry check.

`tar` is patched from 7.5.13 to 7.5.22 in the website. See the [upstream critical advisory](https://github.com/advisories/GHSA-23hp-3jrh-7fpw). Other compatible patches include Babel, browser targets, DOMPurify, HTTP clients, CSS tooling and WebSocket dependencies. Astro is now 6.4.8 and Sanity is 5.31.2 within their existing major ranges.

Remaining website audit entries: `@sanity/cli`, `@sanity/runtime-cli`, `@vercel/frameworks`, `adm-zip`, `astro`, `esbuild`, `js-yaml`, `sanity`, `sharp`, `typeid-js`, `uuid`.

Remaining Studio entries: `@sanity/cli`, `@sanity/runtime-cli`, `@vercel/frameworks`, `adm-zip`, `js-yaml`, `nanoid`, `sanity`, `typeid-js`, `uuid`.

The site is a static deployment: CLI/archive extraction packages do not execute in visitor requests. This narrows exposure but does not eliminate development/build risks or justify suppressing advisories. Astro 7 has compiler, bundler, transition API and whitespace changes; follow the [official migration guide](https://docs.astro.build/en/guides/upgrade-to/v7/) in a dedicated validated change. The automated suggestion to downgrade Sanity to 5.14.1 was deliberately not applied.

## Release protections

- Pushes and pull requests run a clean `npm ci`, existing interaction regressions, new release-check tests, audit reports, a static build, and generated-page/asset checks.
- Validation blocks critical advisories. All lower-severity findings remain visible in logs; this is not a zero-vulnerability claim.
- Preview publishing is manual instead of occurring on every experimental branch push.
- Production publishing is manual, requires `RELEASE`, is restricted to `main`, and requires validation first.
- Production additionally blocks high and critical website advisories. **It is intentionally blocked by the remaining findings above. Do not lower this gate to ship this branch.**
- The build artifact is tied to the workflow commit, uploaded once, and deployed without rebuilding against potentially changed CMS content.
- Release jobs retain dashboard variables and print the pre-release deployment history for a rollback reference.
- One-shot post-deployment checks verify page responses, expected application asset fingerprints, and JavaScript/CSS content types. They do not install visitor tracking.
- Third-party Actions are pinned to full commit IDs; Wrangler is pinned to 4.114.0.

### Repository configuration required

The workflow files alone do not configure GitHub account settings. Before enabling publishing:

1. Configure repository-level `PUBLIC_MAPBOX_TOKEN` as an Actions variable or secret. The reusable build must see it; an environment-only value is insufficient. Publication fails clearly if it is absent.
2. Confirm `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are available to the release jobs. Never place their values in source or workflow logs.
3. Add required reviewers to the GitHub `production` environment and a main-branch rule requiring the validation check. These server-side protections have not been configured by this change.
4. Confirm Cloudflare dashboard Git integration does not independently auto-publish `main`. A GitHub workflow cannot disable an external deployment integration.
5. Resolve remaining high advisories and complete browser/device acceptance before manually releasing.

## Verification completed locally

- Clean website dependency installation passed.
- 24 existing interaction regressions passed.
- 4 new release-check tests passed, including deliberately missing pages and assets.
- Static website build passed: 10 pages, including 6 stories.
- Generated-page inspection and local HTTP checks passed: 9 public routes and 11 directly referenced application assets.
- Clean Studio installation and local Studio build passed. No Studio/schema publication occurred.
- Workflow YAML parses successfully; production trigger and dependency gates were checked locally. Hosted GitHub Actions execution is a separate verification.
- In-app browser, observed viewport 5120×2880: Home map canvas initialized; visible chapter photos decoded; no horizontal overflow; Miami Story opened; next-photo keyboard navigation and Escape worked; focus returned to the source photo; Story → Travel selected Miami. No warnings/errors were observed in this tested flow.

## Explicitly incomplete

- Browser error service: user allows anonymous/minimized technical error monitoring but requested service confirmation. Sentry is proposed, **not installed or enabled**, pending that confirmation and a public DSN.
- Proposed Sentry policy: no identity fields, cookies, page query strings, form contents, breadcrumbs, replay, screenshots, or performance traces; no source maps in public assets. Review server-side IP handling and retention before activation. Do not promise absolute anonymity merely because an SDK PII option is disabled. See [Sentry data scrubbing guidance](https://docs.sentry.io/platforms/javascript/guides/astro/data-management/sensitive-data/).
- Chrome DevTools performance trace: required tooling is unavailable under the `web-perf` workflow, so no FPS, Core Web Vitals, long-task or weak-network claims are made.
- Real iPhone/Android and desktop Safari/Chrome acceptance are still pending; the in-app browser check does not substitute for them.
- Existing large Mapbox bundle warning remains visible and was not hidden by increasing the warning threshold.

## Local commands

```sh
npm ci
npm run test:regression
npm run test:release
npm run build
npm run check:release
npm run check:site -- http://127.0.0.1:4334
```

`check:site` compares the server against the local `dist` build. Only point it at production after deploying that exact build; otherwise an asset mismatch is expected and useful. It is a one-time smoke check, not a recurring uptime monitor.
