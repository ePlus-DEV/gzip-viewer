# GZIP JSONL Viewer

Chrome extension built with [WXT](https://wxt.dev/) (Manifest V3, vanilla TypeScript). Open remote feed indexes, decompress GZIP shards in Chrome and inspect individual product JSON without saving a download.

## Develop locally

1. Install **Node.js 22+**, then `npm install`.
2. Use `npm run dev` for development or `npm run build` for a distributable Chrome extension.
3. Run `npm run typecheck` and `npm test` before publishing.
4. Load `.output/chrome-mv3` via `chrome://extensions` → Developer mode → Load unpacked.
5. Run `npm run zip` to package the production extension.

## Inspect a feed

1. Enter an index URL, for example `https://example.com/feeds/products.json`, in the popup.
2. Check declared product/shard counts, languages, duplicate URLs and malformed shard metadata.
3. Choose **View decoded** to fetch a `.jsonl.gz` shard and expand parsed JSONL records.
4. For recognized shard paths, **Open single product JSON** constructs `/{lang}/products/{sku}.json` on the source origin.
5. Other JSON documents and `.txt` files can be opened in the same viewer.

No private or staging URL is hard-coded in the source. GZIP responses are decoded in browser memory; if the browser has already handled Content-Encoding, plain text is read directly.

## Project structure

- `wxt.config.ts`: manifest metadata and permissions (WXT generates `manifest.json`).
- `entrypoints/popup/`: extension URL form.
- `entrypoints/viewer/`: standalone unlisted WXT viewer page, built as `/viewer.html`.
- `lib/feed.ts`: feed-index metadata validation, product warnings, JSONL parsing and URL derivation.
- `lib/decompress.ts`: raw GZIP detection/decompression.
- `tests/`: Vitest tests covering JSONL, indexing, link derivation, and GZIP.
- `.github/workflows/ci.yml`: typecheck, test and build on pull requests and branch updates.

## Privacy and limitations

- No analytics, third-party uploads or explicit file writes to Downloads. Chrome still retrieves the response in memory.
- `<all_urls>` host permission supports arbitrary user-entered HTTP(S) endpoints, including authenticated sites subject to Chrome cookie/SameSite policies.
- The full shard is currently parsed into memory; avoid opening the entire multi-shard catalog at once.
- Unit tests do not contact your live/private endpoints; verify those locally in a signed-in browser.
