import { browser } from 'wxt/browser';
import {
  auditFeedIndex, determineFormat, httpUrl, isRecord, parseJsonLines,
  productIssues, productJsonUrl,
  type FeedIndexAudit, type Issue, type JsonlRow,
} from '../../lib/feed';
import { responseText } from '../../lib/decompress';
import { parseLlms, resolveLink, type LlmsDocument, type ResourceLink } from '../../lib/discovery';
import { parseSitemap, type ParsedSitemap } from '../../lib/sitemap';
import { childTrail, documentLabel, readTrail, viewerHref as routedHref, type NavItem } from '../../lib/navigation';

type Mode = ReturnType<typeof determineFormat>;

interface ViewerState {
  mode: Mode | null;
  rows: JsonlRow[];
  invalid: number;
  index: FeedIndexAudit | null;
  json: unknown;
  text: string;
  llms: LlmsDocument | null;
  sitemap: ParsedSitemap | null;
}

const searchEl = document.querySelector<HTMLInputElement>('#search')!;
const limitEl = document.querySelector<HTMLSelectElement>('#limit')!;
const reloadEl = document.querySelector<HTMLButtonElement>('#reload')!;
const modeEl = document.querySelector<HTMLSpanElement>('#mode')!;
const sourceEl = document.querySelector<HTMLDivElement>('#source')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const metricsEl = document.querySelector<HTMLElement>('#summary')!;
const itemsEl = document.querySelector<HTMLElement>('#items')!;

const currentParams = new URLSearchParams(location.search);
const rawUrl = currentParams.get('url');
const trail = readTrail(currentParams.get('trail'));
const currentItem: NavItem = {
  url: rawUrl || '',
  label: currentParams.get('label')?.slice(0, 120) || (rawUrl ? documentLabel(rawUrl) : 'Document'),
};
const backEl = document.querySelector<HTMLButtonElement>('#back')!;
const homeEl = document.querySelector<HTMLButtonElement>('#home')!;
const breadcrumbsEl = document.querySelector<HTMLDivElement>('#breadcrumbs')!;
const treeEl = document.querySelector<HTMLDivElement>('#tree')!;
let state: ViewerState = {
  mode: null, rows: [], invalid: 0, index: null, json: null, text: '',
  llms: null, sitemap: null,
};

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

function viewerLink(url: string, label?: string): string {
  return routedHref(
    browser.runtime.getURL('/viewer.html'), url, childTrail(trail, currentItem),
    label || documentLabel(url),
  );
}

function ancestorHref(item: NavItem, index: number): string {
  return routedHref(browser.runtime.getURL('/viewer.html'), item.url, trail.slice(0, index), item.label);
}

function renderNavigation(): void {
  const chain = [...trail, currentItem];
  breadcrumbsEl.replaceChildren();
  chain.forEach((item, index) => {
    if (index) breadcrumbsEl.append(node('span', '›', 'separator'));
    if (index === chain.length - 1) {
      breadcrumbsEl.append(node('span', item.label, 'current'));
    } else {
      const a = node('a', item.label);
      a.href = ancestorHref(item, index);
      breadcrumbsEl.append(a);
    }
  });

  backEl.disabled = trail.length === 0;
  homeEl.disabled = trail.length === 0;
  backEl.onclick = () => {
    if (trail.length) location.assign(ancestorHref(trail[trail.length - 1]!, trail.length - 1));
  };
  homeEl.onclick = () => {
    if (trail.length) location.assign(ancestorHref(trail[0]!, 0));
  };
}

function renderTree(): void {
  treeEl.replaceChildren();
  trail.forEach((item, i) => {
    const a = node('a', (i === 0 ? '⌂ ' : '↳ ') + item.label);
    a.href = ancestorHref(item, i);
    treeEl.append(a);
  });
  treeEl.append(node('span', '● ' + currentItem.label, 'tree-active'));
  if (state.mode === 'llms' && state.llms) {
    state.llms.groups.forEach((group, i) => {
      const a = node('a', group.heading + ' (' + group.links.length + ')', 'tree-section');
      a.href = '#resource-' + i;
      treeEl.append(a);
    });
  }
}

function isBrowsable(url: string): boolean {
  try {
    const pathname = httpUrl(url).pathname;
    return /\.(?:json|jsonl|ndjson|gz|txt|xml|md)$/i.test(pathname);
  } catch {
    return false;
  }
}

function externalAnchor(label: string, raw: unknown, viewer = false, breadcrumbLabel?: string): HTMLAnchorElement | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = httpUrl(raw);
  } catch {
    return null;
  }
  const link = node('a', label);
  link.href = viewer ? viewerLink(url.href, breadcrumbLabel) : url.href;
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
    const view = externalAnchor('View decoded', shard.url, true, shard.language.toUpperCase() + ' · ' + documentLabel(shard.url));
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
    const details = single && externalAnchor('Open single product JSON', single, true, 'Product ' + String(record.sku));
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

function renderLlms(): void {
  const llms = state.llms!;
  const term = searchEl.value.trim().toLowerCase();
  let count = 0;
  metricsEl.replaceChildren(
    metric('Source', 'llms.txt'),
    metric('Links', llms.links),
    metric('Sections', llms.groups.length),
    metric('Languages', llms.languages.join(', ') || '—'),
  );

  const container = node('div');
  for (const [sectionIndex, group] of llms.groups.entries()) {
    const links = term
      ? group.links.filter(link => (link.label + ' ' + link.url).toLowerCase().includes(term))
      : group.links;
    if (!links.length) continue;

    const section = node('section', undefined, 'resource-group');
    section.id = 'resource-' + sectionIndex;
    section.append(node('h2', group.heading + ' (' + links.length + ')'));

    for (const link of links) {
      count++;
      const row = node('div', undefined, 'resource-row');
      const title = node('div', undefined, 'resource-title');
      const resolved = resolveLink(link, rawUrl!);

      if (resolved && link.placeholders.length === 0) {
        const anchor = externalAnchor(
          link.label, resolved, isBrowsable(resolved), link.label,
        );
        if (anchor) title.append(anchor);
      } else {
        title.append(node('strong', link.label));
      }

      if (link.placeholders.length) title.append(node('span', 'URL template', 'issue'));
      row.append(title, node('span', link.url, 'resource-url'));

      if (link.placeholders.length) {
        const form = node('form', undefined, 'resource-form');
        const fields = new Map<string, HTMLInputElement | HTMLSelectElement>();
        for (const placeholder of link.placeholders) {
          const wrapper = node('label', placeholder.toUpperCase());
          let field: HTMLInputElement | HTMLSelectElement;
          if (placeholder === 'lang' && llms.languages.length) {
            const select = node('select');
            for (const language of llms.languages) {
              const option = node('option', language);
              option.value = language;
              select.append(option);
            }
            field = select;
          } else {
            const input = node('input');
            input.type = 'text';
            input.required = true;
            input.maxLength = 180;
            input.placeholder = placeholder === 'sku' ? 'Product SKU'
              : placeholder === 'shard' ? 'Number from feed index' : placeholder;
            if (placeholder === 'lang') input.value = 'en';
            field = input;
          }
          field.name = placeholder;
          fields.set(placeholder, field);
          wrapper.append(field);
          form.append(wrapper);
        }
        const submit = node('button', 'Resolve & view');
        submit.type = 'submit';
        form.append(submit);
        const warning = node('small', '', 'error');
        form.append(warning);
        form.addEventListener('submit', event => {
          event.preventDefault();
          const values: Record<string, string> = {};
          fields.forEach((field, key) => { values[key] = field.value; });
          const destination = resolveLink(link, rawUrl!, values);
          if (!destination) {
            warning.textContent = 'Fill in every template variable with a valid value.';
            return;
          }
          location.assign(viewerLink(destination, link.label));
        });
        row.append(form);
        if (link.placeholders.includes('shard')) {
          row.append(node('small', 'Find actual shard numbers in the product feed index; do not guess.'));
        }
      }
      section.append(row);
    }
    container.append(section);
  }

  const source = node('details', undefined, 'source-text');
  source.append(node('summary', 'View original llms.txt source'), node('pre', state.text));
  container.append(source);
  itemsEl.replaceChildren(container);
  setStatus(
    count + ' link(s) shown / ' + llms.links + ' discovered. Select a resource to browse its children.',
    llms.links ? 'ok' : 'warn',
  );
}

function renderSitemap(): void {
  const sitemap = state.sitemap!;
  const term = searchEl.value.trim().toLowerCase();
  const matching = term
    ? sitemap.entries.filter(entry =>
        (entry.url + ' ' + (entry.lastModified || '')).toLowerCase().includes(term))
    : sitemap.entries;
  const max = Number(limitEl.value);
  const visible = max ? matching.slice(0, max) : matching;

  metricsEl.replaceChildren(
    metric('Type', sitemap.title),
    metric('Entries', sitemap.entries.length.toLocaleString()),
    metric('Validation issues', sitemap.issues.length),
  );
  const container = node('div');
  if (sitemap.issues.length) {
    container.append(showIssues(sitemap.issues.map(message => ({severity: 'warning', message}))));
  }
  const table = node('table');
  const header = node('tr');
  for (const label of ['Type', 'URL', 'Last modified', 'Action']) header.append(node('th', label));
  const head = node('thead'); head.append(header);
  const body = node('tbody');
  for (const entry of visible) {
    const tr = node('tr');
    const source = node('td');
    const rawLink = externalAnchor(entry.url, entry.url);
    if (rawLink) source.append(rawLink);
    else source.textContent = entry.url;
    const action = node('td');
    const next = externalAnchor(
      isBrowsable(entry.url) ? 'Explore' : 'Open page',
      entry.url, isBrowsable(entry.url), documentLabel(entry.url),
    );
    if (next) action.append(next);
    tr.append(
      node('td', entry.kind),
      source,
      node('td', entry.lastModified || '—'),
      action,
    );
    body.append(tr);
  }
  table.append(head, body);
  container.append(table);
  itemsEl.replaceChildren(container);
  setStatus(
    visible.length.toLocaleString() + ' shown / ' + matching.length.toLocaleString()
      + ' matched / ' + sitemap.entries.length.toLocaleString() + ' entries',
    sitemap.issues.length ? 'warn' : 'ok',
  );
}

function renderText(): void {
  metricsEl.replaceChildren(metric('Format', 'Text'));
  itemsEl.replaceChildren(node('pre', state.text));
  setStatus('Plain text response', 'ok');
}

function render(): void {
  modeEl.textContent = state.mode ? state.mode.toUpperCase() : '';
  renderTree();
  if (state.mode === 'llms') return renderLlms();
  if (state.mode === 'sitemap') return renderSitemap();
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
  state = {mode: null, rows: [], invalid: 0, index: null, json: null, text: '', llms: null, sitemap: null};
  setStatus('Fetching…');
  reloadEl.disabled = true;

  try {
    const response = await fetch(url.href, {cache: 'no-store', credentials: 'include'});
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    setStatus('Reading and decompressing…');
    const text = await responseText(response);
    state.mode = determineFormat(url, text, response.headers.get('content-type') ?? '');

    setStatus('Parsing and validating…');
    if (state.mode === 'llms') {
      state.text = text;
      state.llms = parseLlms(text, url.href);
    } else if (state.mode === 'sitemap') {
      state.sitemap = parseSitemap(text, url.href);
    } else if (state.mode === 'feed-index') {
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

renderNavigation();
renderTree();
searchEl.addEventListener('input', render);
limitEl.addEventListener('change', render);
reloadEl.addEventListener('click', () => { void load(); });
void load();
