import {browser} from 'wxt/browser';
import {auditFeedIndex, httpUrl, isRecord, productJsonUrl} from '../../lib/feed';
import {parseLlms, resolveLink} from '../../lib/discovery';
import {parseSitemap} from '../../lib/sitemap';
import {responseText} from '../../lib/decompress';
import {
  type AuditFinding, type ShardData, type ShardRecord,
  checkProduct, compareLanguageShards, parseShard, sampleProducts,
} from '../../lib/cross-test';

type Scope = 'quick' | 'full';
interface Report {
  startedAt: string;
  finishedAt?: string;
  origin: string;
  scope: Scope;
  findings: AuditFinding[];
  checkedShards: number;
  sampledProducts: number;
  checkedLinks: number;
  stopped: boolean;
}
const siteEl = document.querySelector<HTMLInputElement>('#site')!;
const scopeEl = document.querySelector<HTMLSelectElement>('#scope')!;
const referenceEl = document.querySelector<HTMLSelectElement>('#reference')!;
const linksEl = document.querySelector<HTMLSelectElement>('#links')!;
const runEl = document.querySelector<HTMLButtonElement>('#run')!;
const stopEl = document.querySelector<HTMLButtonElement>('#stop')!;
const exportEl = document.querySelector<HTMLButtonElement>('#export')!;
const browseEl = document.querySelector<HTMLAnchorElement>('#browse')!;
const activityEl = document.querySelector<HTMLElement>('#activity')!;
const progressEl = document.querySelector<HTMLProgressElement>('#progress')!;
const findingsEl = document.querySelector<HTMLElement>('#findings')!;
const summaryEl = document.querySelector<HTMLElement>('#summary')!;
let controller: AbortController | null = null;
let report: Report | null = null;
let displayCount = 0;
const MAX_VISIBLE = 500;

function finding(id: string, level: AuditFinding['level'], summary: string,
  detail?: string, url?: string): void {
  if (!report) return;
  const entry: AuditFinding = {id, level, summary};
  if (detail) entry.detail = detail.slice(0, 2000);
  if (url) entry.url = url;
  report.findings.push(entry);
  if (displayCount < MAX_VISIBLE) {
    const line = document.createElement('div');
    line.className = 'test';
    const title = document.createElement('div');
    title.className = 'headline';
    const label = document.createElement('span');
    label.className = 'status ' + level;
    label.textContent = level.toUpperCase();
    const code = document.createElement('span');
    code.className = 'id';
    code.textContent = id;
    const message = document.createElement('strong');
    message.textContent = summary;
    title.append(label, code, message);
    line.append(title);
    if (detail) {
      const desc = document.createElement('span');
      desc.className = 'detail';
      desc.textContent = detail.slice(0, 700);
      line.append(desc);
    }
    findingsEl.append(line);
    displayCount++;
  }
  refresh();
}

function refresh(): void {
  const statuses = report?.findings ?? [];
  const counters: Record<AuditFinding['level'], string> = {
    pass:'passed', fail:'failed', warning:'warnings',
    blocked:'blocked', 'not-run':'notrun',
  };
  for (const [status, id] of Object.entries(counters)) {
    document.getElementById(id)!.textContent = String(
      statuses.filter(f => f.level === status).length);
  }
  summaryEl.textContent = '(' + statuses.length + ' checks)';
}

function step(message: string, progress: number): void {
  activityEl.textContent = message;
  progressEl.value = Math.min(100, Math.max(0, Math.round(progress)));
}

function assertActive(): void {
  if (!controller || controller.signal.aborted) throw new DOMException('Stopped by user', 'AbortError');
}

async function fetchResponse(raw: string): Promise<Response> {
  assertActive();
  return fetch(raw, {
    credentials: 'include',
    cache: 'no-store',
    redirect: 'follow',
    signal: controller!.signal,
  });
}

function checkRedirect(response: Response, expected: URL, id: string): boolean {
  let actual: URL;
  try { actual = httpUrl(response.url); }
  catch {
    finding(id, 'fail', 'Invalid final response URL', response.url, expected.href);
    return false;
  }
  if (actual.hostname !== expected.hostname) {
    finding(id, 'fail', 'Unexpected redirect domain', expected.hostname + ' → ' + actual.hostname, expected.href);
    return false;
  }
  return true;
}

async function checkLink(url: string, id: string, expected: URL): Promise<void> {
  try {
    assertActive();
    const candidate = httpUrl(url);
    if (candidate.hostname !== expected.hostname) {
      finding(id, 'warning', 'Link points outside tested domain',
        candidate.hostname + ' instead of ' + expected.hostname, url);
      return;
    }
    const response = await fetchResponse(candidate.href);
    report!.checkedLinks++;
    const hostOK = checkRedirect(response, expected, id + '-DOMAIN');
    finding(id, response.ok && hostOK ? 'pass' : 'fail',
      'HTTP ' + response.status + ' · ' + candidate.pathname,
      response.url, url);
    // Never retain huge bodies during link-only checks.
    if (response.body) await response.body.cancel();
  } catch (error) {
    if (controller?.signal.aborted) throw error;
    finding(id, 'fail', 'Link request failed',
      error instanceof Error ? error.message : String(error), url);
  }
}

async function fetchShard(url: string, id: string, expected: URL): Promise<ShardData | null> {
  try {
    const response = await fetchResponse(url);
    if (!response.ok || !checkRedirect(response, expected, id + '-DOMAIN')) {
      finding(id, 'fail', 'Shard unavailable: HTTP ' + response.status, response.url, url);
      if (response.body) await response.body.cancel();
      return null;
    }
    const text = await responseText(response);
    const data = parseShard(text);
    report!.checkedShards++;
    finding(id, data.malformed ? 'fail' : 'pass',
      'Shard parsed: ' + data.records.length.toLocaleString() + ' JSON records',
      data.malformed ? data.issues.join(' | ') : 'Decoded in browser memory.', url);
    finding(id + '-CAP', data.records.length > 50000 ? 'fail' : 'pass',
      'Shard size: ' + data.records.length.toLocaleString() + ' / 50,000 maximum',
      undefined, url);
    if (data.issues.length) {
      finding(id + '-SCHEMA', 'warning', 'Product feed metadata issues',
        data.issues.slice(0, 5).join(' | '), url);
    }
    const skus = new Set<string>();
    let duplicates = 0;
    for (const record of data.records) {
      const sku = String(record.sku ?? '');
      if (sku && skus.has(sku)) duplicates++;
      skus.add(sku);
    }
    finding(id + '-DUP', duplicates ? 'fail' : 'pass', 'Duplicate SKUs: ' + duplicates, undefined, url);
    return data;
  } catch (error) {
    if (controller?.signal.aborted) throw error;
    finding(id, 'fail', 'Shard fetch / GZIP decompression failed',
      error instanceof Error ? error.message : String(error), url);
    return null;
  }
}

function jsonLdProduct(html: string): Record<string, unknown> | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const value: unknown = JSON.parse(script.textContent || 'null');
      const roots: unknown[] = Array.isArray(value) ? value : [value];
      for (const root of roots) {
        const nodes = isRecord(root) && Array.isArray(root['@graph']) ? root['@graph'] : [root];
        for (const item of nodes) {
          if (!isRecord(item)) continue;
          const type = item['@type'];
          if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return item;
        }
      }
    } catch { /* malformed script; try the next one */ }
  }
  return null;
}

async function checkSamples(data: ShardData, shardUrl: string, language: string,
  parentId: string, expected: URL): Promise<void> {
  for (const record of sampleProducts(data.records, 3)) {
    assertActive();
    const sku = String(record.sku ?? '');
    const singleUrl = productJsonUrl(shardUrl, sku);
    const id = parentId + '-SKU-' + (sku || 'missing');
    if (!singleUrl) {
      finding(id, 'blocked', 'Cannot construct product JSON endpoint', undefined, shardUrl);
      continue;
    }
    try {
      const response = await fetchResponse(singleUrl);
      const domainOK = checkRedirect(response, expected, id + '-DOMAIN');
      if (!response.ok || !domainOK) {
        finding(id, 'fail', 'Product JSON HTTP ' + response.status, response.url, singleUrl);
        if (response.body) await response.body.cancel();
        continue;
      }
      const single: unknown = await response.json();
      const diffs = checkProduct(record, single);
      finding(id, diffs.length ? 'fail' : 'pass',
        language + ' product ' + sku + ': shard ↔ JSON',
        diffs.slice(0, 8).join(' | ') || 'SKU and supported fields agree.', singleUrl);
      report!.sampledProducts++;
    } catch (error) {
      if (controller?.signal.aborted) throw error;
      finding(id, 'fail', 'Product JSON request / parse failed',
        error instanceof Error ? error.message : String(error), singleUrl);
    }
    if (typeof record.url !== 'string') {
      finding(id + '-LD', 'not-run', 'No product-detail URL in feed record.');
      continue;
    }
    try {
      const pageUrl = httpUrl(record.url);
      const response = await fetchResponse(pageUrl.href);
      const domainOK = checkRedirect(response, expected, id + '-PAGE-DOMAIN');
      if (!response.ok || !domainOK) {
        finding(id + '-LD', 'fail', 'Product-detail HTTP ' + response.status, undefined, pageUrl.href);
        if (response.body) await response.body.cancel();
        continue;
      }
      const product = jsonLdProduct(await response.text());
      if (!product) {
        finding(id + '-LD', 'warning', 'Product JSON-LD not found in HTML',
          'If generated client-side, a Playwright browser test is required.', pageUrl.href);
        continue;
      }
      const ldSku = String(product.sku ?? '');
      const gtin = product.gtin13 ?? product.gtin14 ?? product.gtin ?? null;
      const skuMatches = ldSku === sku;
      const gtinMatches = gtin === null || String(gtin) === String(record.gtin ?? '');
      finding(id + '-LD', skuMatches && gtinMatches ? 'pass' : 'fail',
        'Product detail JSON-LD matches SKU / GTIN',
        !skuMatches ? 'JSON-LD SKU: ' + ldSku + ', feed SKU: ' + sku :
          !gtinMatches ? 'GTIN differs.' : 'Product found in HTML.', pageUrl.href);
    } catch (error) {
      if (controller?.signal.aborted) throw error;
      finding(id + '-LD', 'warning', 'Unable to verify product detail / JSON-LD',
        error instanceof Error ? error.message : String(error), record.url);
    }
  }
}

async function run(): Promise<void> {
  if (controller) return;
  let entered: URL;
  try { entered = httpUrl(siteEl.value.trim()); }
  catch { activityEl.textContent = 'Enter a valid HTTP(S) site URL.'; return; }
  const llms = new URL('/llms.txt', entered.origin);
  const scope = scopeEl.value as Scope;
  const linkLimit = Number(linksEl.value);
  controller = new AbortController();
  report = {
    startedAt: new Date().toISOString(), origin: entered.origin, scope,
    findings: [], checkedShards: 0, sampledProducts: 0, checkedLinks: 0, stopped: false,
  };
  findingsEl.replaceChildren();
  displayCount = 0;
  progressEl.value = 0;
  runEl.disabled = true;
  stopEl.disabled = false;
  exportEl.disabled = true;
  browseEl.href = browser.runtime.getURL('/viewer.html') + '?url=' + encodeURIComponent(llms.href);
  void browser.storage.local.set({lastUrl: llms.href});

  try {
    step('1/5 · Discovering resources from llms.txt…', 3);
    const llmsResponse = await fetchResponse(llms.href);
    if (!llmsResponse.ok || !checkRedirect(llmsResponse, entered, 'PCL-LLMS-DOMAIN')) {
      finding('PCL-LLMS', 'fail', 'llms.txt unavailable: HTTP ' + llmsResponse.status,
        undefined, llms.href);
      if (llmsResponse.body) await llmsResponse.body.cancel();
      return;
    }
    const llmsText = await llmsResponse.text();
    const parsed = parseLlms(llmsText, llms.href);
    finding('PCL-LLMS', parsed.links ? 'pass' : 'warning',
      'llms.txt available: ' + parsed.links + ' discoverable links',
      undefined, llms.href);

    const discovered = parsed.groups.flatMap(g => g.links).filter(link => !link.placeholders.length);
    const concrete = [...new Set(discovered.map(link => resolveLink(link, llms.href)).filter(
      (url): url is string => typeof url === 'string'))];
    const limit = linkLimit ? concrete.slice(0, linkLimit) : concrete;
    step('2/5 · Checking ' + limit.length + ' published links…', 15);
    for (const [i, url] of limit.entries()) {
      assertActive();
      // Shards are fetched and parsed later; avoid downloading them twice.
      if (/\.(?:jsonl|ndjson)\.gz$/i.test(new URL(url).pathname)) continue;
      await checkLink(url, 'PCL-LINK-' + (i + 1), entered);
      step('2/5 · Checking published links ' + (i + 1) + '/' + limit.length,
        15 + 14 * (i + 1) / Math.max(1, limit.length));
    }
    if (limit.length < concrete.length) {
      finding('PCL-LINK-SCOPE', 'not-run', concrete.length - limit.length +
        ' published llms.txt links excluded by the selected link limit.');
    }
    // Only follow XML sitemap links explicitly published from llms.txt.
    const sitemaps = concrete.filter(url => /\.xml(?:\.gz)?$/i.test(new URL(url).pathname));
    let xmlChildren = 0;
    for (const xmlUrl of sitemaps.slice(0, scope === 'quick' ? 1 : 5)) {
      assertActive();
      try {
        const response = await fetchResponse(xmlUrl);
        if (!response.ok) {
          finding('PCL-XML', 'fail', 'XML sitemap HTTP ' + response.status, undefined, xmlUrl);
          continue;
        }
        const sitemap = parseSitemap(await responseText(response), xmlUrl);
        finding('PCL-XML', sitemap.issues.length ? 'warning' : 'pass',
          sitemap.title + ': ' + sitemap.entries.length + ' entries',
          sitemap.issues.slice(0, 5).join(' | '), xmlUrl);
        const budget = scope === 'quick' ? 5 : 50;
        for (const [i, entry] of sitemap.entries.slice(0, budget).entries()) {
          await checkLink(entry.url, 'PCL-XML-LINK-' + (i + 1), entered);
          xmlChildren++;
        }
        if (sitemap.entries.length > budget) finding('PCL-XML-SCOPE', 'not-run',
          sitemap.entries.length - budget + ' sitemap entries not checked in this mode.');
      } catch (error) {
        if (controller.signal.aborted) throw error;
        finding('PCL-XML', 'fail', 'Sitemap read / parse failed',
          error instanceof Error ? error.message : String(error), xmlUrl);
      }
    }
    if (sitemaps.length > (scope === 'quick' ? 1 : 5)) {
      finding('PCL-XML-SCOPE', 'not-run', 'Additional sitemaps excluded from this round.');
    }
    step('3/5 · Loading product feed index…', 33);
    const feedURL = concrete.find(url => /\/feeds\/products\.json$/i.test(new URL(url).pathname));
    if (!feedURL) {
      finding('PCL-INDEX', 'blocked', 'No products.json link published in llms.txt.',
        'Add the feed index URL to llms.txt to enable cross-language tests.', llms.href);
      return;
    }
    const feedResponse = await fetchResponse(feedURL);
    if (!feedResponse.ok || !checkRedirect(feedResponse, entered, 'PCL-INDEX-DOMAIN')) {
      finding('PCL-INDEX', 'fail', 'Product feed index HTTP ' + feedResponse.status,
        undefined, feedURL);
      if (feedResponse.body) await feedResponse.body.cancel();
      return;
    }
    const index = auditFeedIndex(await feedResponse.json() as unknown, feedURL);
    finding('PCL-INDEX', index.issues.some(i => i.severity === 'error') ? 'fail' :
      index.issues.length ? 'warning' : 'pass',
      'Feed index: ' + index.shards.length + ' published shard URLs, ' +
        index.languages.length + ' languages',
      index.issues.slice(0, 10).map(i => i.message).join(' | '), feedURL);
    const wrongHosts = index.shards.filter(s => new URL(s.url).hostname !== entered.hostname);
    finding('PCL-DOMAIN', wrongHosts.length ? 'fail' : 'pass',
      'Shard domains: ' + wrongHosts.length + ' unexpected hosts',
      wrongHosts.slice(0, 5).map(s => s.url).join(' | '));
    const groups = new Map<string, Map<string, string>>();
    for (const shard of index.shards) {
      const match = new URL(shard.url).pathname.match(/products-([a-z]{2})-(\d+)\.(?:jsonl|ndjson)(?:\.gz)?$/i);
      if (!match?.[1] || !match[2]) {
        finding('PCL-SHARD-NAME', 'warning', 'Unrecognized shard name', undefined, shard.url);
        continue;
      }
      const lang = match[1].toLowerCase();
      const number = match[2];
      if (!groups.has(number)) groups.set(number, new Map());
      const byLanguage = groups.get(number)!;
      if (byLanguage.has(lang)) finding('PCL-SHARD-NAME', 'fail', 'Duplicate language/shard number',
        lang + '-' + number, shard.url);
      byLanguage.set(lang, shard.url);
    }
    const declaredLanguages = index.languages;
    const languagesFromLlms = parsed.languages;
    const missingFromIndex = languagesFromLlms.filter(lang => !declaredLanguages.includes(lang));
    finding('PCL-LANG', missingFromIndex.length ? 'fail' : 'pass',
      'Language declarations: ' + declaredLanguages.join(', '),
      missingFromIndex.length ? 'In llms.txt but missing from feed index: ' +
        missingFromIndex.join(', ') : 'All languages declared in llms.txt have shards.');
    const reference = declaredLanguages.includes(referenceEl.value) ? referenceEl.value :
      declaredLanguages[0];
    if (!reference) {
      finding('PCL-INDEX', 'blocked', 'No language groups available.');
      return;
    }
    if (referenceEl.options.length <= 1 && declaredLanguages.length) {
      referenceEl.replaceChildren();
      for (const lang of declaredLanguages) {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        if (lang === reference) option.selected = true;
        referenceEl.append(option);
      }
    }
    const allGroups = [...groups].sort((a,b) => Number(a[0]) - Number(b[0]));
    for (const [number, byLanguage] of allGroups) {
      const missing = declaredLanguages.filter(lang => !byLanguage.has(lang));
      if (missing.length) finding('PCL-FILE-' + number, 'fail',
        'Shard #' + number + ' missing languages: ' + missing.join(', '));
    }
    const selected = scope === 'quick' ? allGroups.filter(([, langs]) =>
      declaredLanguages.every(lang => langs.has(lang))).slice(0, 1) : allGroups;
    if (scope === 'quick' && !selected.length) {
      finding('PCL-SHARDS', 'blocked', 'No common shard number across all declared languages.');
      return;
    }
    if (scope === 'quick' && allGroups.length > 1) {
      finding('PCL-SCOPE', 'not-run', (allGroups.length - selected.length) +
        ' shard groups excluded by Quick mode. Choose Full to test all published groups.');
    }
    step('4/5 · Loading and comparing ' + selected.length + ' shard group(s)…', 40);
    for (const [idx, [number, byLanguage]] of selected.entries()) {
      assertActive();
      const referenceURL = byLanguage.get(reference);
      if (!referenceURL) {
        finding('PCL-REF-' + number, 'blocked', 'Reference language shard missing: ' + reference + '-' + number);
        continue;
      }
      const base = await fetchShard(referenceURL, 'PCL-SHARD-' + reference + '-' + number, entered);
      if (!base) continue;
      await checkSamples(base, referenceURL, reference, 'PCL-PRODUCT-' + reference + '-' + number, entered);
      for (const [lang, url] of byLanguage.entries()) {
        assertActive();
        if (lang === reference) continue;
        const localized = await fetchShard(url, 'PCL-SHARD-' + lang + '-' + number, entered);
        if (!localized) continue;
        const diff = compareLanguageShards(base.records, localized.records);
        const prefix = 'PCL-COMPARE-' + reference + '-' + lang + '-' + number;
        finding(prefix + '-COUNT', diff.countSame ? 'pass' : 'fail',
          'Same record count: ' + base.records.length + ' vs ' + localized.records.length,
          undefined, url);
        finding(prefix + '-ORDER', diff.orderSame ? 'pass' : 'fail',
          'Identical SKU order · ' + diff.orderMismatches + ' mismatches',
          diff.examples.slice(0, 5).join(' | '), url);
        finding(prefix + '-DATA', diff.invariantSame ? 'pass' : 'fail',
          'Invariant field differences: ' + diff.dataMismatches,
          diff.examples.slice(0, 10).join(' | '), url);
        await checkSamples(localized, url, lang, 'PCL-PRODUCT-' + lang + '-' + number, entered);
      }
      step('4/5 · Compared shard group ' + number +
        ' (' + (idx + 1) + '/' + selected.length + ')',
        40 + 55 * (idx + 1) / selected.length);
    }
    finding('PCL-COVERAGE', 'not-run',
      'Entire source DB ↔ feed coverage cannot be proven from public feeds alone.',
      'This run samples product endpoints; connect an authoritative SKU export for exhaustive validation.');
    finding('PCL-PCL-MATRIX', 'not-run',
      'This runner is not a full execution of every requirement/PCL in the external workbook.',
      'It covers the linked-feed test groups shown in the result list.');
    step('5/5 · Finished. Review results or export report.', 100);
  } catch (error) {
    if (controller?.signal.aborted) {
      finding('RUN-STOPPED', 'blocked', 'Testing stopped by user. Partial results are preserved.');
      report!.stopped = true;
      step('Stopped. Export partial results if needed.', progressEl.value);
    } else {
      finding('RUN-ERROR', 'fail', 'Runner failed unexpectedly',
        error instanceof Error ? error.message : String(error));
      step('Run interrupted. Review the error and export results.', progressEl.value);
    }
  } finally {
    if (report) report.finishedAt = new Date().toISOString();
    controller = null;
    runEl.disabled = false;
    stopEl.disabled = true;
    exportEl.disabled = !report;
    refresh();
  }
}

runEl.addEventListener('click', () => { void run(); });
stopEl.addEventListener('click', () => { controller?.abort(); });
exportEl.addEventListener('click', () => {
  if (!report) return;
  const blob = new Blob([JSON.stringify(report, null, 2)], {type:'application/json'});
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'seo-cross-test-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
});
void browser.storage.local.get('lastUrl').then(({lastUrl}) => {
  const provided = new URLSearchParams(location.search).get('url');
  if (provided) siteEl.value = provided;
  else if (typeof lastUrl === 'string') siteEl.value = lastUrl;
  try {
    const site = httpUrl(siteEl.value);
    browseEl.href = browser.runtime.getURL('/viewer.html') + '?url=' +
      encodeURIComponent(new URL('/llms.txt', site.origin).href);
  } catch {
    browseEl.href = browser.runtime.getURL('/viewer.html');
  }
});
