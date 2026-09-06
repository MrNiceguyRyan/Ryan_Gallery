# Security maintenance — phase two

## Scope and release state

Continuation of `codex/security-release-guardrails`, after `41d5d02`. This worktree remains separate from the spatial-design experiment in the root checkout. No production or Sanity Studio deployment, main-branch merge, schema publication, content edits or visitor telemetry activation occurred.

The changes are dependency maintenance and build/data-client wiring, not a visual redesign. All React components, styles, motion logic, queries, photography assets and Sanity schemas remain unchanged in this phase.

## Changes

- Website: Astro 7.3.1, its supported React integration 6.0.5 and esbuild 0.28.2. `compressHTML: true` explicitly preserves the prior inline whitespace behavior described in the [Astro 7 migration guide](https://docs.astro.build/en/guides/upgrade-to/v7/).
- Vite 8 is declared directly for the Tailwind plugin. The first hosted build exposed an undeclared peer dependency: the nested worktree could resolve Vite from its parent checkout, while a clean GitHub checkout could not. The explicit dependency removes that environment-dependent resolution; hosted CI, not only a worktree install, is required to validate it.
- The static public website now imports its read-only data client directly from `@sanity/client`. The project, production dataset, CDN setting and API date are exactly those used by the removed `@sanity/astro` integration. No credentials are added. The existing separate `ryan/` Studio remains the content editor.
- Removed the website's unused Studio integration/runtime and direct `react-is` dependency. The install removed 849 packages and added 26 as part of the framework migration; this is toolchain reduction, not a claim of equivalent visitor bundle savings.
- Studio: Sanity and Vision 6.12.0, following the [official v6 migration requirements](https://www.sanity.io/docs/help/v5-to-v6). Existing Node 22 and React 19 settings satisfy these requirements. No auth providers or custom search overrides needed migration.
- Three tightly scoped Studio dependency overrides repair currently pinned transitive versions: `@vercel/frameworks` uses `js-yaml` 3.15.2 and `smol-toml` 1.8.0; `typeid-js` uses UUID 11.1.1. No broad override, forced downgrade or `npm audit fix --force` was used.

UUID 11.1.1 includes the relevant [upstream security backport](https://github.com/uuidjs/uuid/blob/v11.1.1/CHANGELOG.md). Tests exercise TypeID's exact `v7(undefined, buffer)` API, valid UUID v7 output, 1,000 unique IDs and boxed/unboxed round trips. YAML aliases/settings and TOML arrays/sections are also tested. Revisit the overrides when their parent packages adopt patched dependencies; do not remove them without a clean audit and compatibility tests.

## Verification

- Clean website `npm ci` and clean Studio `npm ci --legacy-peer-deps`: passed.
- Website interaction tests: 24 passed. Release-guard tests: 4 passed. Studio dependency-compatibility tests: 4 passed.
- Website and Studio `npm audit --audit-level=low`: **zero reported vulnerabilities** in each lockfile at the time of this check. This is a registry audit, not a penetration test or an assertion of zero security risk.
- Both local builds passed. Website output: 10 pages, including six Collection Stories. Release validation passed for all pages and 11 directly referenced application assets.
- Compared all 10 generated HTML pages against the pre-migration build: page titles, normalized body copy, Astro island component/props, link labels/targets and image alt/src/srcset values were identical. Compiled asset hashes are expected to change.
- Local HTTP smoke check: nine public routes and 11 application assets passed, including content types and expected compiled-asset references.
- In-app browser: Home map initialized; Miami Story opened; full-screen photo advanced to photo 2 via keyboard; Escape closed the viewer and Story; original scroll position was restored. Home-to-Travel preserved Miami and its 15-frame detail. The Travel Story link opened `/works/miami`. No warnings or errors were captured during these functional checks.

The in-app browser's viewport override reports scaled dimensions and a minimum layout width; it cannot establish the requested 390-pixel phone acceptance reliably. Its screenshot capture returned a blank surface despite accessible content and successful interactions, so screenshot-based visual acceptance is **not** claimed. Real Chrome/Safari and phone visual acceptance remain release requirements. No FPS, long-task, weak-network or Core Web Vitals measurements were obtained. Source-button focus after closing both overlays also needs a fresh native-browser check; scroll restoration alone is not proof of focus restoration.

## Automated release guards

Validation now clean-installs, tests and builds both the website and Studio. Both audit gates block any reported severity, including low. Production retains its manual `RELEASE` confirmation, main-only restriction and validated-build artifact handoff, and its final website audit uses the same strict threshold. Preview and production deployments remain manual.

GitHub environment reviewers, branch protection, repository-level Mapbox configuration and any independent Cloudflare Git auto-publishing must still be checked separately; workflow files do not configure those account settings. PR creation through the current GitHub integration was denied with HTTP 403 in phase one. Do not bypass that denial through alternate credentials. Pushing this existing maintenance branch is separate from merging or releasing it.

## Remaining non-blocking build warnings and pending work

- Early local builds reported deprecated Vite esbuild options while resolving dependencies through the parent checkout. After declaring Vite explicitly and clean-installing, those warnings no longer appeared; no unsupported plugin-major override was added.
- Existing Mapbox large-chunk warning remains visible. No performance benefit is inferred from dependency-count reduction.
- Studio still has its pre-existing auto-update configuration without an appId. No Studio publication was performed. Confirm the deployment channel/appId before any future Studio release.
- Sentry remains proposed, not installed or enabled. The user allowed minimized browser-error monitoring but requested a specific-service confirmation; that confirmation and configuration are still pending. No visitor events have been transmitted by this maintenance.

## Reproduce locally

Website: `npm ci`, `npm run test:regression`, `npm run test:release`, `npm audit --audit-level=low`, `npm run build`, `npm run check:release`.

Studio (inside `ryan/`): `npm ci --legacy-peer-deps`, `npm run test:security`, `npm audit --audit-level=low`, `CI=true SANITY_TELEMETRY_DISABLED=1 npm run build`.

Run `npm run check:site -- <preview-url>` only against the exact local `dist` build. It is a one-time smoke check, not a recurring monitor and not visitor tracking.
