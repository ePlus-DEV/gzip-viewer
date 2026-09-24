# GZIP JSONL Viewer

Chrome extension (Manifest V3) for viewing remote `.jsonl.gz`, `.ndjson.gz`, `.jsonl`, and `.ndjson` files in a browser tab **without saving files to Downloads**.

## Install

1. Clone or download this repository.
2. Visit `chrome://extensions` in Chrome.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the folder containing `manifest.json`.
5. Click the extension icon, enter a URL, and choose **Open & View**.

## Example

```text
https://example.com/feeds/products-en-1.jsonl.gz
```

The extension fetches the response in your browser, detects GZIP via magic bytes, decompresses in memory, and displays JSONL records. Search records, expand formatted JSON, or limit the displayed rows. Chrome may already have decoded responses served with `Content-Encoding: gzip`; plain-text responses are supported.

## Privacy and access

- No third-party analytics, upload services, or external JavaScript.
- Your browser must still transfer the file into memory; no file is saved to Downloads.
- Broad host permission allows user-selected URLs. Review extension permissions before installing.
- Authenticated endpoints are requested with `credentials: include`, subject to browser cookie rules.
- Large feeds load fully into memory. For very large feeds, consider smaller shards.
- Open only URLs you trust; this extension does not change the remote service.

## Files

- `manifest.json` — extension configuration
- `popup.html`, `popup.js` — input and open viewer
- `viewer.html`, `viewer.js` — GZIP decompression, JSONL parsing, search and record viewer

No build step or external dependencies.
