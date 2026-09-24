const params = new URLSearchParams(location.search);
const sourceUrl = params.get("url");
const statusEl = document.getElementById("status");
const sourceEl = document.getElementById("source");
const itemsEl = document.getElementById("items");
const searchEl = document.getElementById("search");
const limitEl = document.getElementById("limit");
const reloadBtn = document.getElementById("reload");

let rows = [];
let invalidCount = 0;

searchEl.addEventListener("input", render);
limitEl.addEventListener("change", render);
reloadBtn.addEventListener("click", load);

async function readResponse(response) {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chrome may have already decoded a Content-Encoding: gzip response.
  const gzipped = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Update Chrome to use the built-in GZIP decompressor.");
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function parseJsonLines(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  let bad = 0;
  for (let i = 0; i < lines.length; i++) {
    const value = lines[i].trim();
    if (!value) continue;
    try {
      parsed.push({line: i + 1, raw: value, data: JSON.parse(value), valid: true});
    } catch (error) {
      bad++;
      parsed.push({line: i + 1, raw: value, error: error.message, valid: false});
    }
  }
  return {parsed, bad};
}

function getSummary(item) {
  if (!item.valid) return "Line " + item.line + " — invalid JSON";
  const d = item.data;
  const fields = (d && typeof d === "object" && !Array.isArray(d))
    ? [d.sku, d.id, d.product_id, d.name, d.title]
    : [];
  const labels = fields.filter(v => v !== undefined && v !== null);
  return "Line " + item.line + (labels.length ? " — " + labels.slice(0, 3).join(" · ") : "");
}

function render() {
  const query = searchEl.value.trim().toLowerCase();
  const max = Number(limitEl.value);
  const matching = query ? rows.filter(row => row.raw.toLowerCase().includes(query)) : rows;
  const visible = max > 0 ? matching.slice(0, max) : matching;

  const fragment = document.createDocumentFragment();
  for (const row of visible) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const pre = document.createElement("pre");
    summary.textContent = getSummary(row);
    pre.textContent = row.valid
      ? JSON.stringify(row.data, null, 2)
      : row.raw + "\n\nParse error: " + row.error;
    if (!row.valid) pre.className = "error";
    details.append(summary, pre);
    fragment.appendChild(details);
  }
  itemsEl.replaceChildren(fragment);
  statusEl.textContent = visible.length.toLocaleString() + " shown / " +
    matching.length.toLocaleString() + " matched / " +
    rows.length.toLocaleString() + " total" +
    (invalidCount ? " · " + invalidCount + " invalid JSON line(s)" : "");
}

async function load() {
  if (!sourceUrl) {
    statusEl.textContent = "No URL provided. Open the extension popup to enter a URL.";
    return;
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Invalid protocol");
  } catch {
    statusEl.textContent = "Invalid source URL.";
    return;
  }
  document.title = (parsedUrl.pathname.split("/").pop() || "JSONL") + " — GZIP JSONL Viewer";
  sourceEl.textContent = "Source: " + parsedUrl.origin + parsedUrl.pathname;
  statusEl.textContent = "Fetching...";
  itemsEl.replaceChildren();
  try {
    const response = await fetch(parsedUrl.href, {cache: "no-store", credentials: "include"});
    if (!response.ok) throw new Error("HTTP " + response.status + " " + response.statusText);
    statusEl.textContent = "Reading and decompressing...";
    const text = await readResponse(response);
    statusEl.textContent = "Parsing JSONL...";
    const result = parseJsonLines(text);
    rows = result.parsed;
    invalidCount = result.bad;
    render();
  } catch (error) {
    statusEl.textContent = "Unable to load feed: " + error.message;
    statusEl.className = "error";
  }
}

load();
