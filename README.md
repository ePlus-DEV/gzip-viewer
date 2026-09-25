# SEO & AEO Auditor — beUI Redesign

Chrome extension built with [WXT](https://wxt.dev/) (Manifest V3), React 19, Tailwind CSS 4 and actual MIT-licensed [beUI components](https://github.com/starc007/ui-components). Start from llms.txt, follow discovery links like a sitemap, inspect feed indexes, decompress GZIP shards, and open individual product JSON without saving an archive to Downloads.

## beUI interface

This branch gives all three extension surfaces a unified, responsive beUI workspace while preserving the existing AEO and SEO test engine:

- **Popup:** React + actual beUI animated badges and motion buttons. Choose AEO/SEO, Quick/Full, inspect the current tab or enter an arbitrary HTTP(S) origin; open Run Tests or Resource Explorer.
- **Test runner:** A responsive React dashboard using beUI Button and AnimatedBadge components. The existing DOM-based live audit engine is initialized after React mounts; its selectors and report format are preserved.
- **Resource explorer:** A beUI React shell with working Back, Home, search, display limit, Reload and Run Tests; retain all existing LLMS, XML, JSON and GZIP inspection logic.
- Respect system dark mode and reduced-motion settings; avoid shipping font binaries or remote CSS/JS.

The MIT-licensed upstream sources are vendored under `components/beui/` (attribution and original license: `THIRD_PARTY_LICENSES.md`). Source paths are made local to work inside WXT without external runtime dependencies.

## Develop locally

1. Install **Node.js 22+**, then `npm install`.
2. Use `npm run dev` for development or `npm run build` for a distributable Chrome extension.
3. Run `npm run typecheck` and `npm test` before publishing.
4. Load `.output/chrome-mv3` via `chrome://extensions` → Developer mode → Load unpacked.
5. Run `npm run zip` to package the production extension.

## Inspect a feed

1. Enter any URL on the target site (or its llms.txt URL) and choose **Explore from llms.txt**. The extension opens that site's `/llms.txt` by default. Choose **Open exact URL** for an advanced direct entry.
2. Browse links grouped by llms.txt headings. Links to feed indexes, XML sitemaps, and other documents open **in the same viewer tab**. URL templates provide fields for `{lang}`, `{sku}`, and `{shard}`; look up published shard numbers from the feed index instead of guessing.
3. Open the feed index and check declared product/shard counts, languages, duplicate URLs and malformed metadata.
4. Select **View decoded** to fetch a `.jsonl.gz` shard and expand parsed records.
5. For recognized shard paths, **Open single product JSON** constructs `/{lang}/products/{sku}.json` on the source origin.
6. Use the persistent **Back**, **Home**, resource tree, or clickable breadcrumbs to return to any previous document in the discovery chain. Browser Back also works.
7. Links to `.xml` and `.xml.gz` sitemap indexes or URL sitemaps are browsable; ordinary web-page links open as websites instead of being treated as JSON.

No private or staging URL is hard-coded in the source. GZIP responses are decoded in browser memory; if the browser has already handled Content-Encoding, plain text is read directly.

## Project structure

- `wxt.config.ts`: manifest metadata and permissions (WXT generates `manifest.json`).
- `entrypoints/popup/`: beUI React popup (mode/scope selection and Run Tests).
- `entrypoints/viewer/`: beUI React resource-explorer shell and unchanged URL-driven document logic.
- `entrypoints/test-runner/`: beUI React dashboard plus existing AEO and SEO live test engines.
- `assets/beui.css`: Tailwind theme tokens and locally bundled beUI styles.
- `components/beui/`: vendored upstream beUI motion buttons, badges, number, hooks and tokens.
- `lib/feed.ts`: feed-index metadata validation, product warnings, JSONL parsing and URL derivation.
- `lib/discovery.ts`: parse llms.txt links and resolve URL templates.
- `lib/navigation.ts`: durable URL-based breadcrumbs and Back/Home navigation.
- `lib/sitemap.ts`: XML sitemap index and URL set parsing.
- `lib/decompress.ts`: raw GZIP detection/decompression.
- `tests/`: Vitest tests covering JSONL, indexing, link derivation, and GZIP.
- `.github/workflows/ci.yml`: typecheck, test and build on pull requests and branch updates.

## Privacy and limitations

- No analytics, third-party uploads or explicit file writes to Downloads. Chrome still retrieves the response in memory.
- `<all_urls>` host permission supports arbitrary user-entered HTTP(S) endpoints, including authenticated sites subject to Chrome cookie/SameSite policies.
- The full shard is currently parsed into memory; avoid opening the entire multi-shard catalog at once.
- Unit tests do not contact your live/private endpoints; verify those locally in a signed-in browser.

## In-extension cross-test runner

Use **▶ Run Tests** in the popup or resource viewer and choose exactly one audit mode: **AEO** or **SEO**. This opens a dedicated WXT test-runner tab (not GitHub Actions), starts at the selected website's `/llms.txt`, and runs live HTTP/data checks with your Chrome session.

- **AEO Quick:** first shard number shared by all published feed languages, three product JSON + product-detail/JSON-LD samples per checked language.
- **AEO Full:** all published shard numbers, three samples per shard/language; large catalogs transfer significant data and take time.
- **SEO Quick:** start at robots.txt and check sitemap declarations, an XML sitemap sample, and up to 15 discovered pages for HTTP, canonical, hreflang, robots meta and JSON-LD.
- **SEO Full:** recurse through advertised same-domain XML sitemaps and inspect up to 500 page URLs, reporting all unvisited URLs as NOT RUN rather than PASS.
- Checks include llms.txt links, same-domain/redirect checks, published index and shard counts, actual GZIP decompression/JSONL parsing, 50k item limits, duplicate SKUs, cross-language record counts/SKU order/invariant fields, and sampled single-product JSON + server-rendered Product JSON-LD.
- Click **Stop** to cancel outstanding fetches, and **Export JSON report** to preserve all PASS/FAIL/WARNING/BLOCKED/NOT RUN findings.
- Link and XML checks use explicit per-run limits. When not every URL/product can be verified the runner reports NOT RUN, never an unearned PASS.
- Live site tests need Chrome network access. A full database-to-feed SKU coverage proof still needs a database/source export and is explicitly marked NOT RUN.

Source URLs are entered by the user. No staging URL, secret or credentials are committed into this repository.

## Back to top and runtime metrics

The live audit dashboard shows **elapsed wall-clock time**, **approximate remaining time**, and **expected finish** while tests are running. An estimate appears only after at least two comparable shard groups (AEO) or page checks (SEO); discovery and sitemap size cannot be reliably predicted in advance. The estimate concerns the current processing stage and may change when network latency or shard size varies. Once the run completes or is stopped, the dashboard displays **actual total runtime** and the local finish time. Exported JSON includes `startedAt`, `finishedAt` and `durationMs`.

A floating **Back to top** control appears in both the audit dashboard and Resource Explorer after scrolling down. It respects `prefers-reduced-motion` and remains keyboard accessible.
