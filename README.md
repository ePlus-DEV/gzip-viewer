# GZIP JSONL Viewer

Chrome extension built with [WXT](https://wxt.dev/) (Manifest V3, vanilla TypeScript). Start from llms.txt, follow discovery links like a sitemap, inspect feed indexes, decompress GZIP shards, and open individual product JSON without saving an archive to Downloads.

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
- `entrypoints/popup/`: extension URL form.
- `entrypoints/viewer/`: standalone unlisted WXT viewer page, built as `/viewer.html`.
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
