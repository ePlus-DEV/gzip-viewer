import { browser } from 'wxt/browser';
import {
  auditFeedIndex, determineFormat, httpUrl, isRecord, parseJsonLines,
  productIssues, productJsonUrl,
  type FeedIndexAudit, type Issue, type JsonlRow,
} from '../../lib/feed';
import { responseText } from '../../lib/decompress';

type Mode = 'feed-index' | 'jsonl' | 'json' | 'text';

interface ViewerState {
  mode: Mode | null;
  rows: JsonlRow[];
  invalid: number;
  index: FeedIndexAudit | null;
  json: unknown;
  text: string;
}

const searchEl = document.querySelector<HTMLInputElement>('#search')!;
const limitEl = document.querySelector<HTMLSelectElement>('#limit')!;
const reloadEl = document.querySelector<HTMLButtonElement>('#reload')!;
const modeEl = document.querySelector<HTMLSpanElement>('#mode')!;
const sourceEl = document.querySelector<HTMLDivElement>('#source')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const metricsEl = document.querySelector<HTMLElement>('#summary')!;
const itemsEl = document.querySelector<HTMLElement>('#items')!;

const rawUrl = new URLSearchParams(location.search).get('url');
let state: ViewerState = {mode: null, rows: [], invalid: 0, index: null, json: null, text: ''};

function setStatus(message: string, level: 'ok' | 'warn' | 'error' | '' = ''): void {
  statusEl.textContent = message;
  statusEl.className = level;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K, text?: string, cssClass?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (cssClass) result.className = cssClass;
  return result;
}

function metric(label: string, value: string | number): HTMLElement {
  const el = node('div', undefined, 'metric');
  el.append(node('strong', String(value)), node('span', label));
  return el;
}

function showIssues(issues: Issue[]): HTMLElement {
  const wrapper = node('div');
  for (const issue of issues) {
    const item = node('div', issue.severity.toUpperCase() + ': ' + issue.message, 'issue ' + issue.severity);
    wrapper.append(item);
  }
  return wrapper;
}

function viewerLink(url: string): string {
  return browser.runtime.getURL('/viewer.html') + '?url=' + encodeURIComponent(url);
}

function externalAnchor(label: string, raw: unknown, viewer = false): HTMLAnchorElement | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = httpUrl(raw);
  } catch {
    return null;
  }
  const link = node('a', label);
  link.href = viewer ? viewerLink(url.href) : url.href;
  if (!viewer) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

function renderIndex(): void {
  const audit = state.index!;
  const term = searchEl.value.trim().toLowerCase();
  const matching = term
    ? audit.shards.filter(shard =>
      [shard.language, shard.url, shard.lastModified || ''].join(' ').toLowerCase().includes(term))
    : audit.shards;
  const max = Number(limitEl.value);
  const visible = max ? matching.slice(0, max) : matching;

  metricsEl.replaceChildren(
    metric('Total products (declared)', audit.totalProducts?.toLocaleString() ?? '—'),
    metric('Shards (declared)', audit.declaredShards ?? '—'),
    metric('Shard entries', audit.shards.length),
    metric('Languages', audit.languages.join(', ') || '—'),
    metric('Validation issues', audit.issues.length),
  );

  const panel = node('div');
  if (audit.issues.length) panel.append(showIssues(audit.issues));

  const table = node('table');
  const thead = node('thead');
  const header = node('tr');
  for (const label of ['Language', 'Shard', 'Last modified', 'View']) header.append(node('th', label));
  thead.append(header);
  const tbody = node('tbody');

  for (const shard of visible) {
    const tr = node('tr');
    const language = node('td', shard.language || '—');
    const source = node('td');
    const remote = externalAnchor(shard.url, shard.url);
    if (remote) source.append(remote);
    else source.textContent = shard.url;
    const modified = node('td', shard.lastModified || '—');
    const action = node('td');
    const view = externalAnchor('View decoded', shard.url, true);
    if (view) action.append(view);
    tr.append(language, source, modified, action);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  panel.append(table);
  itemsEl.replaceChildren(panel);

  setStatus(
    visible.length.toLocaleString() + ' shown / ' +
    matching.length.toLocaleString() + ' matched / ' +
    audit.shards.length.toLocaleString() + ' valid shard URLs',
    audit.issues.some(i => i.severity === 'error') ? 'error' : audit.issues.length ? 'warn' : 'ok',
  );
}

function rowLabel(row: JsonlRow): string {
  if (!row.valid) return 'Line ' + row.line + ' — invalid JSON';
  if (!isRecord(row.data)) return 'Line ' + row.line;
  const fields = [row.data.sku, row.data.id, row.data.title, row.data.name]
    .filter(value => value !== undefined && value !== null);
  return 'Line ' + row.line + (fields.length ? ' — ' + fields.slice(0, 3).join(' · ') : '');
}

function recordLinks(record: Record<string, unknown>): HTMLElement {
  const wrapper = node('div', undefined, 'record-links');
  const page = externalAnchor('Open product page', record.url);
  if (page) wrapper.append(page);

  if (rawUrl) {
    const single = productJsonUrl(rawUrl, record.sku);
    const details = single && externalAnchor('Open single product JSON', single, true);
    if (details) wrapper.append(details);
  }
  return wrapper;
}

function renderRows(): void {
  const term = searchEl.value.trim().toLowerCase();
  const matching = term ? state.rows.filter(row => row.raw.toLowerCase().includes(term)) : state.rows;
  const max = Number(limitEl.value);
  const visible = max ? matching.slice(0, max) : matching;
  metricsEl.replaceChildren(
    metric('Records', state.rows.length.toLocaleString()),
    metric('Invalid JSON lines', state.invalid),
  );

  const container = node('div');
  for (const row of visible) {
    const details = node('details');
    details.append(node('summary', rowLabel(row)));
    // Lazily format JSON when a record is expanded, not while rendering the full shard.
    details.addEventListener('toggle', () => {
      if (!details.open || details.dataset.loaded) return;
      details.dataset.loaded = '1';
      if (!row.valid) {
        details.append(node('pre', row.raw + '\n\nParse error: ' + (row.error || 'Unknown error')));
        return;
      }
      if (isRecord(row.data)) {
        const links = recordLinks(row.data);
        if (links.hasChildNodes()) details.append(links);
        const issues = productIssues(row.data);
        if (issues.length) details.append(showIssues(issues));
      }
      details.append(node('pre', JSON.stringify(row.data, null, 2)));
    });
    container.append(details);
  }
  itemsEl.replaceChildren(container);
  setStatus(
    visible.length.toLocaleString() + ' shown / ' +
    matching.length.toLocaleString() + ' matched / ' +
    state.rows.length.toLocaleString() + ' records' +
    (state.invalid ? ' · ' + state.invalid + ' invalid JSON lines' : ''),
    state.invalid ? 'warn' : 'ok',
  );
}

function renderJson(): void {
  const panel = node('div');
  const doc = state.json;
  const looksLikeProduct = isRecord(doc) &&
    (Object.hasOwn(doc, 'sku') || /\/products\/[^/]+\.json$/i.test(new URL(rawUrl!).pathname));
  const issues = looksLikeProduct ? productIssues(doc) : [];
  metricsEl.replaceChildren(metric('Format', 'JSON'), metric('Validation issues', issues.length));
  if (issues.length) panel.append(showIssues(issues));
  if (isRecord(doc)) {
    const links = recordLinks(doc);
    if (links.hasChildNodes()) panel.append(links);
  }
  panel.append(node('pre', JSON.stringify(doc, null, 2)));
  itemsEl.replaceChildren(panel);
  setStatus('Valid JSON' + (issues.length ? ' · ' + issues.length + ' metadata warning(s)' : ''), issues.length ? 'warn' : 'ok');
}

function renderText(): void {
  metricsEl.replaceChildren(metric('Format', 'Text'));
  itemsEl.replaceChildren(node('pre', state.text));
  setStatus('Plain text response', 'ok');
}

function render(): void {
  modeEl.textContent = state.mode ? state.mode.toUpperCase() : '';
  if (state.mode === 'feed-index') return renderIndex();
  if (state.mode === 'jsonl') return renderRows();
  if (state.mode === 'json') return renderJson();
  if (state.mode === 'text') return renderText();
}

async function load(): Promise<void> {
  if (!rawUrl) {
    setStatus('No URL provided. Open the extension popup and enter a URL.', 'error');
    return;
  }
  let url: URL;
  try {
    url = httpUrl(rawUrl);
  } catch {
    setStatus('Invalid URL: only HTTP and HTTPS are supported.', 'error');
    return;
  }

  document.title = (url.pathname.split('/').pop() || 'Feed') + ' — GZIP JSONL Viewer';
  sourceEl.textContent = 'Source: ' + url.origin + url.pathname;
  itemsEl.replaceChildren();
  metricsEl.replaceChildren();
  state = {mode: null, rows: [], invalid: 0, index: null, json: null, text: ''};
  setStatus('Fetching…');
  reloadEl.disabled = true;

  try {
    const response = await fetch(url.href, {cache: 'no-store', credentials: 'include'});
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    setStatus('Reading and decompressing…');
    const text = await responseText(response);
    state.mode = determineFormat(url, text, response.headers.get('content-type') ?? '');

    setStatus('Parsing and validating…');
    if (state.mode === 'feed-index') {
      state.index = auditFeedIndex(JSON.parse(text) as unknown, url.href);
    } else if (state.mode === 'jsonl') {
      const parsed = parseJsonLines(text);
      state.rows = parsed.rows;
      state.invalid = parsed.invalid;
    } else if (state.mode === 'json') {
      state.json = JSON.parse(text) as unknown;
    } else {
      state.text = text;
    }

    render();
  } catch (error) {
    setStatus(
      'Unable to load: ' + (error instanceof Error ? error.message : String(error)) +
      '. Verify that the endpoint is reachable and any required login is active.',
      'error',
    );
  } finally {
    reloadEl.disabled = false;
  }
}

searchEl.addEventListener('input', render);
limitEl.addEventListener('change', render);
reloadEl.addEventListener('click', () => { void load(); });
void load();
