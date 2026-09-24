# GZIP JSONL Viewer

Chrome extension (Manifest V3) for inspecting and validating remote product feeds directly in Chrome without saving `.gz` files to Downloads.

## Develop branch

The `develop` branch adds feed-aware validation:

- Opens a product feed index such as `/feeds/products.json`.
- Detects `shards[]`, language, URL, `last_modified`, declared shard count and total product count.
- Makes every shard directly openable in the extension.
- Fetches and GZIP-decompresses `.jsonl.gz` shards in browser memory.
- Parses each JSONL record and reports malformed lines.
- Searches records without extracting a file manually.
- For a shard named `products-{lang}-{shard}.jsonl.gz`, derives the corresponding single-product endpoint from each record's `sku`:
  `/{lang}/products/{sku}.json`.
- Opens single-product JSON in the same viewer.
- Opens the public product page when a record contains a `url`.
- Also supports ordinary JSON, JSONL, NDJSON and plain-text resources.

This is intended for checking feed links published in machine-readable discovery files such as `llms.txt`.

## Install

1. Clone this repository.
2. Checkout `develop`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the repository directory.
7. Click the extension icon and paste the feed/index URL.

Example:

```text
https://example.com/feeds/products.json
```

A shard can then be opened through **View decoded** without downloading and manually extracting it.

## Supported patterns

```text
/feeds/products.json
/feeds/products-{lang}-{shard}.jsonl.gz
/{lang}/products/{sku}.json
```

The extension discovers actual shard URLs from the index. It does not need to guess shard numbers.

## Privacy and access

- No third-party analytics, upload services or external JavaScript.
- Data is fetched directly from the URL by your Chrome browser.
- GZIP content is decompressed in memory with Chrome's built-in `DecompressionStream`.
- No archive is intentionally written to the Downloads folder.
- Authenticated endpoints are requested with `credentials: include`, subject to Chrome cookie and SameSite rules.
- `<all_urls>` host permission is required because the URL is selected by the user.
- Large shards are currently loaded into memory in full.

## Files

- `manifest.json` — Manifest V3 extension configuration
- `popup.html`, `popup.js` — URL input
- `viewer.html`, `viewer.js` — index validation, GZIP decompression, JSON/JSONL rendering

No build step or external dependencies.
