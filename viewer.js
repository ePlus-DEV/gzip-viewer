const params = new URLSearchParams(location.search);
const sourceUrl = params.get("url");
const statusEl = document.getElementById("status");
const sourceEl = document.getElementById("source");
const itemsEl = document.getElementById("items");
const summaryEl = document.getElementById("summary");
const searchEl = document.getElementById("search");
const limitEl = document.getElementById("limit");
const reloadBtn = document.getElementById("reload");
const modeEl = document.getElementById("mode");

let state = { mode: "unknown", rows: [], invalidCount: 0, index: null };

searchEl.addEventListener("input", render);
limitEl.addEventListener("change", render);
reloadBtn.addEventListener("click", load);

async function readResponse(response) {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const gzipped = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!gzipped) return new TextDecoder().decode(bytes);

  if (typeof DecompressionStream === "undefined") {
    throw new Error("This Chrome version does not support built-in GZIP decompression.");
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function parseJsonLines(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  let bad = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    try {
      parsed.push({ line: i + 1, raw, data: JSON.parse(raw), valid: true });
    } catch (error) {
      bad++;
      parsed.push({ line: i + 1, raw, error: error.message, valid: false });
    }
  }

  return { parsed, bad };
}

function detectMode(text, contentType, pathname) {
  const trimmed = text.trim();

  if (pathname.endsWith(".jsonl") || pathname.endsWith(".jsonl.gz") ||
      pathname.endsWith(".ndjson") || pathname.endsWith(".ndjson.gz")) {
    return "jsonl";
  }

  try {
    const json = JSON.parse(trimmed);
    if (json && Array.isArray(json.shards)) return "feed-index";
    return "json";
  } catch {}

  if ((contentType || "").includes("json") && trimmed.includes("\n")) return "jsonl";
  return "text";
}

function metric(label, value, className = "") {
  const div = document.createElement("div");
  div.className = "metric " + className;
  const b = document.createElement("b");
  b.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  div.append(b, span);
  return div;
}

function viewerLink(url) {
  return chrome.runtime.getURL("viewer.html") + "?url=" + encodeURIComponent(url);
}

function renderFeedIndex() {
  const index = state.index;
  const q = searchEl.value.trim().toLowerCase();
  const shards = Array.isArray(index.shards) ? index.shards : [];
  const filtered = q ? shards.filter(s => JSON.stringify(s).toLowerCase().includes(q)) : shards;
  const max = Number(limitEl.value);
  const visible = max > 0 ? filtered.slice(0, max) : filtered;

  summaryEl.replaceChildren(
    metric("Total products", Number(index.catalog_info?.total_products || 0).toLocaleString()),
    metric("Declared shards", String(index.catalog_info?.total_shards ?? shards.length)),
    metric("Loaded shard entries", String(shards.length), shards.length ? "ok" : "warn"),
    metric("Languages", [...new Set(shards.map(s => s.language).filter(Boolean))].join(", ") || "—")
  );

  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Language</th><th>Shard URL</th><th>Last modified</th><th>Open</th></tr></thead>";
  const tbody = document.createElement("tbody");

  for (const shard of visible) {
    const tr = document.createElement("tr");

    const lang = document.createElement("td");
    lang.textContent = shard.language || "—";

    const urlTd = document.createElement("td");
    const a = document.createElement("a");
    a.href = shard.url || "#";
    a.textContent = shard.url || "missing URL";
    a.target = "_blank";
    a.rel = "noreferrer";
    urlTd.appendChild(a);

    const modified = document.createElement("td");
    modified.textContent = shard.last_modified || "—";

    const action = document.createElement("td");
    if (shard.url) {
      const open = document.createElement("a");
      open.href = viewerLink(shard.url);
      open.textContent = "View decoded";
      action.appendChild(open);
    }

    tr.append(lang, urlTd, modified, action);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  itemsEl.replaceChildren(table);

  const declared = Number(index.catalog_info?.total_shards);
  const mismatch = Number.isFinite(declared) && declared !== shards.length;
  statusEl.textContent =
    visible.length.toLocaleString() + " shown / " + filtered.length.toLocaleString() +
    " matched / " + shards.length.toLocaleString() + " shard entries" +
    (mismatch ? " · Warning: total_shards does not match shard entry count" : "");
  statusEl.className = mismatch ? "warn" : "ok";
}

function getSummary(item) {
  if (!item.valid) return "Line " + item.line + " — invalid JSON";
  const d = item.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return "Line " + item.line;

  const labels = [d.sku, d.id, d.title, d.name].filter(v => v !== undefined && v !== null);
  return "Line " + item.line + (labels.length ? " — " + labels.slice(0, 3).join(" · ") : "");
}

function renderJsonl() {
  const q = searchEl.value.trim().toLowerCase();
  const matching = q ? state.rows.filter(row => row.raw.toLowerCase().includes(q)) : state.rows;
  const max = Number(limitEl.value);
  const visible = max > 0 ? matching.slice(0, max) : matching;

  summaryEl.replaceChildren(
    metric("Records", state.rows.length.toLocaleString()),
    metric("Invalid lines", String(state.invalidCount), state.invalidCount ? "warn" : "ok")
  );

  const fragment = document.createDocumentFragment();

  for (const row of visible) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const pre = document.createElement("pre");

    summary.textContent = getSummary(row);
    pre.textContent = row.valid ? JSON.stringify(row.data, null, 2) : row.raw + "\n\nParse error: " + row.error;
    if (!row.valid) pre.className = "error";

    if (row.valid && row.data && typeof row.data === "object" && row.data.url) {
      const pageLink = document.createElement("a");
      pageLink.href = row.data.url;
      pageLink.target = "_blank";
      pageLink.rel = "noreferrer";
      pageLink.textContent = "Open product page";
      details.append(summary, pageLink, pre);
    } else {
      details.append(summary, pre);
    }

    fragment.appendChild(details);
  }

  itemsEl.replaceChildren(fragment);
  statusEl.textContent =
    visible.length.toLocaleString() + " shown / " +
    matching.length.toLocaleString() + " matched / " +
    state.rows.length.toLocaleString() + " total" +
    (state.invalidCount ? " · " + state.invalidCount + " invalid JSON line(s)" : "");
  statusEl.className = state.invalidCount ? "warn" : "ok";
}

function renderJson() {
  const row = state.rows[0];
  summaryEl.replaceChildren(metric("Format", "JSON", "ok"));

  const wrapper = document.createElement("div");
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(row.data, null, 2);
  wrapper.appendChild(pre);

  const d = row.data;
  if (d && typeof d === "object" && d.url) {
    const a = document.createElement("a");
    a.href = d.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = "Open product page";
    wrapper.prepend(a);
  }

  itemsEl.replaceChildren(wrapper);
  statusEl.textContent = "Valid JSON document";
  statusEl.className = "ok";
}

function renderText() {
  summaryEl.replaceChildren(metric("Format", "Text", "warn"));
  const pre = document.createElement("pre");
  pre.textContent = state.rows[0]?.raw || "";
  itemsEl.replaceChildren(pre);
  statusEl.textContent = "Plain text response";
  statusEl.className = "";
}

function render() {
  modeEl.textContent = state.mode;

  if (state.mode === "feed-index") return renderFeedIndex();
  if (state.mode === "jsonl") return renderJsonl();
  if (state.mode === "json") return renderJson();
  return renderText();
}

async function load() {
  if (!sourceUrl) {
    statusEl.textContent = "No URL provided. Open the extension popup to enter a URL.";
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    statusEl.textContent = "Invalid source URL.";
    statusEl.className = "error";
    return;
  }

  document.title = (parsedUrl.pathname.split("/").pop() || "Feed") + " — GZIP JSONL Viewer";
  sourceEl.textContent = "Source: " + parsedUrl.href;
  statusEl.textContent = "Fetching...";
  statusEl.className = "";
  summaryEl.replaceChildren();
  itemsEl.replaceChildren();

  try {
    const response = await fetch(parsedUrl.href, { cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error("HTTP " + response.status + " " + response.statusText);

    statusEl.textContent = "Reading / decompressing...";
    const text = await readResponse(response);

    state.mode = detectMode(text, response.headers.get("content-type"), parsedUrl.pathname);
    state.rows = [];
    state.invalidCount = 0;
    state.index = null;

    if (state.mode === "feed-index") {
      state.index = JSON.parse(text);
    } else if (state.mode === "jsonl") {
      const result = parseJsonLines(text);
      state.rows = result.parsed;
      state.invalidCount = result.bad;
    } else if (state.mode === "json") {
      state.rows = [{ valid: true, raw: text, data: JSON.parse(text), line: 1 }];
    } else {
      state.rows = [{ valid: true, raw: text, data: null, line: 1 }];
    }

    render();
  } catch (error) {
    statusEl.textContent = "Unable to load feed: " + (error.message || String(error));
    statusEl.className = "error";
  }
}

load();
