import {parseSitemap} from '../../lib/sitemap';
import {responseText} from '../../lib/decompress';
import {httpUrl, isRecord} from '../../lib/feed';
import {isProductPage, isSitemapUrl, parseRobots, pickPageSamples, sameHost, type TestScope} from '../../lib/audit-modes';
import type {AuditFinding} from '../../lib/cross-test';
import {
  expectedLanguageBase, isStale, ruleLevel, type AuditValidationConfig,
} from '../../lib/audit-config';

type Level = AuditFinding['level'];

export interface SeoAuditContext {
  root: URL;
  scope: TestScope;
  config: AuditValidationConfig;
  fetchPage: (url: string) => Promise<Response>;
  report: (id: string, level: Level, summary: string, detail?: string, url?: string) => void;
  redirectOK: (response: Response, expected: URL, id: string) => boolean;
  progress: (message: string, percent: number) => void;
  assertActive: () => void;
  linkChecked: () => void;
}

const MAX_SITEMAPS = {quick: 3, full: 100} as const;
const MAX_DISCOVERED = 20000;
const MAX_HREFLANG = {quick: 20, full: 500} as const;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function childText(el: ParentNode, tag: string): string | null {
  return el.querySelector(tag)?.getAttribute('content')?.trim() || null;
}

function structuredProducts(doc: Document): {products: Record<string, unknown>[]; malformed: number} {
  const products: Record<string, unknown>[] = [];
  let malformed = 0;
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let json: unknown;
    try { json = JSON.parse(script.textContent || 'null'); }
    catch { malformed++; continue; }
    const roots = Array.isArray(json) ? json : [json];
    for (const root of roots) {
      const graph = isRecord(root) && Array.isArray(root['@graph']) ? root['@graph'] : [root];
      for (const value of graph) {
        if (!isRecord(value)) continue;
        const kind = value['@type'];
        if (kind === 'Product' || (Array.isArray(kind) && kind.includes('Product'))) {
          products.push(value);
        }
      }
    }
  }
  return {products, malformed};
}

export async function runSeoAudit(ctx: SeoAuditContext): Promise<void> {
  const {root, scope, config, report, fetchPage, redirectOK, progress, assertActive, linkChecked} = ctx;
  const robotsUrl = new URL('/robots.txt', root).href;
  const sitemapCandidates: string[] = [];
  progress('SEO 1/4 · Reading robots.txt and finding XML sitemaps…', 5);

  try {
    const response = await fetchPage(robotsUrl);
    if (!response.ok || !redirectOK(response, root, 'SEO-01-DOMAIN')) {
      report('SEO-01-ROBOTS', 'fail', 'robots.txt unavailable: HTTP ' + response.status,
        undefined, robotsUrl);
      if (response.body) await response.body.cancel();
    } else {
      const robots = parseRobots(await response.text());
      report('SEO-01-ROBOTS', robots.issues.length ? 'warning' : 'pass',
        'robots.txt parsed: ' + robots.groups.length + ' crawler groups',
        robots.issues.slice(0, 8).join(' | '), robotsUrl);
      report('SEO-01-BLOCK', robots.disallowAll ? 'warning' : 'pass',
        robots.disallowAll ? 'Default robots group disallows entire site' : 'Default robots group does not block entire site.',
        robots.disallowAll ? 'Review this against the intended indexing policy.' : undefined, robotsUrl);
      for (const declared of robots.sitemaps) {
        try {
          const absolute = httpUrl(declared, root.href).href;
          if (sameHost(absolute, root.href)) sitemapCandidates.push(absolute);
          else report('SEO-01-SITEMAP-HOST', 'fail', 'Sitemap points to a different hostname',
            absolute, robotsUrl);
        } catch {
          report('SEO-01-SITEMAP-URL', 'fail', 'robots.txt lists an invalid Sitemap URL',
            declared, robotsUrl);
        }
      }
      report('SEO-01-SITEMAPS', sitemapCandidates.length ? 'pass' : 'warning',
        sitemapCandidates.length + ' same-host sitemap URL(s) in robots.txt.',
        sitemapCandidates.length ? undefined : 'Trying the conventional /sitemap.xml fallback.', robotsUrl);
    }
  } catch (error) {
    assertActive();
    report('SEO-01-ROBOTS', 'fail', 'Cannot load robots.txt', errorText(error), robotsUrl);
  }
  if (!sitemapCandidates.length) sitemapCandidates.push(new URL('/sitemap.xml', root).href);
  const queue = [...new Set(sitemapCandidates)];
  const seen = new Set<string>();
  const pages: string[] = [];
  const pageSeen = new Set<string>();
  let skippedSitemaps = 0;
  let skippedPages = 0;
  const sitemapBudget = MAX_SITEMAPS[scope];
  const maximumPages = scope === 'quick'
    ? config.seo.quickPageLimit
    : config.seo.fullPageLimit;

  progress('SEO 2/4 · Crawling XML sitemap indexes…', 22);
  while (queue.length && seen.size < sitemapBudget) {
    assertActive();
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!sameHost(url, root.href)) {
      report('SEO-02-DOMAIN', 'fail', 'Sitemap on unexpected host', undefined, url);
      continue;
    }
    if (!isSitemapUrl(url)) {
      report('SEO-02-URL', 'warning', 'Sitemap URL has an unexpected extension', undefined, url);
    }
    try {
      const response = await fetchPage(url);
      if (!response.ok || !redirectOK(response, root, 'SEO-02-REDIRECT')) {
        report('SEO-02-HTTP', 'fail', 'XML sitemap unavailable: HTTP ' + response.status,
          undefined, url);
        if (response.body) await response.body.cancel();
        continue;
      }
      const sitemap = parseSitemap(await responseText(response), url);
      report('SEO-02-XML', sitemap.issues.length ? 'warning' : 'pass',
        sitemap.title + ': ' + sitemap.entries.length + ' entries',
        sitemap.issues.slice(0, 6).join(' | '), url);
      if (config.seo.sitemapLastmodMaxAgeDays > 0) {
        const stale=sitemap.entries.filter(entry =>
          entry.kind === 'url' && entry.lastModified &&
          isStale(entry.lastModified, config.seo.sitemapLastmodMaxAgeDays * 24));
        report('SEO-02-LASTMOD', stale.length ? 'warning' : 'pass',
          'Sitemap lastmod: ' + stale.length + ' URL(s) older than ' +
            config.seo.sitemapLastmodMaxAgeDays + ' day(s)',
          stale.slice(0, 8).map(entry =>
            (entry.lastModified || 'missing') + ' · ' + entry.url
          ).join(' | '), url);
      }
      for (const entry of sitemap.entries) {
        if (!sameHost(entry.url, root.href)) {
          report('SEO-02-ENTRY-HOST', 'fail', 'Sitemap contains unexpected hostname',
            entry.url, url);
          continue;
        }
        if (entry.kind === 'sitemap') {
          if (!seen.has(entry.url) && !queue.includes(entry.url)) {
            if (queue.length + seen.size < MAX_DISCOVERED) queue.push(entry.url);
            else skippedSitemaps++;
          }
        } else if (!pageSeen.has(entry.url)) {
          pageSeen.add(entry.url);
          if (pages.length < MAX_DISCOVERED) pages.push(entry.url);
          else skippedPages++;
        }
      }
    } catch (error) {
      assertActive();
      report('SEO-02-XML', 'fail', 'Sitemap download, GZIP decoding or XML parsing failed',
        errorText(error), url);
    }
    progress('SEO 2/4 · XML sitemaps: ' + seen.size + '/' + sitemapBudget,
      22 + Math.min(18, 18 * seen.size / sitemapBudget));
  }
  if (queue.length || skippedSitemaps) {
    report('SEO-02-SCOPE', 'not-run', (queue.length + skippedSitemaps) +
      ' sitemap document(s) were not visited due to this run’s safety limits.');
  }
  if (!pages.length) {
    report('SEO-03-PAGES', 'blocked',
      'No page URLs were discovered from accessible XML sitemaps.',
      'Check robots.txt, XML sitemap validity and hostname.', root.href);
    return;
  }
  report('SEO-02-PAGES', skippedPages ? 'warning' : 'pass',
    pages.length + ' distinct same-host page URLs discovered.',
    skippedPages ? skippedPages + ' additional URLs excluded by the discovery safety cap.' : undefined);
  const selected = pickPageSamples(pages, maximumPages);
  if (selected.length < pages.length || skippedPages) {
    report('SEO-03-SCOPE', 'not-run', (pages.length - selected.length + skippedPages) +
      ' discovered page(s) not requested in this mode or beyond the safety cap.',
      'Full mode requests at most ' + maximumPages + ' pages. It does not prove whole-site coverage.');
  }

  progress('SEO 3/4 · Validating ' + selected.length + ' page URL(s)…', 45);
  let hreflangChecks = 0;
  let omittedHreflangs = 0;
  for (const [position, pageUrl] of selected.entries()) {
    assertActive();
    const pageId = 'SEO-PAGE-' + (position + 1);
    try {
      const response = await fetchPage(pageUrl);
      linkChecked();
      const domain = redirectOK(response, root, pageId + '-REDIRECT');
      if (!response.ok || !domain) {
        report(pageId + '-HTTP', 'fail', 'Page HTTP ' + response.status,
          response.url, pageUrl);
        if (response.body) await response.body.cancel();
        continue;
      }
      report(pageId + '-HTTP', 'pass', 'Page responds HTTP ' + response.status,
        undefined, pageUrl);
      if (!(response.headers.get('content-type') || '').includes('text/html')) {
        report(pageId + '-ASSET', 'pass', 'Linked asset reachable; HTML-only checks skipped.',
          response.headers.get('content-type') ?? 'Unknown content type', pageUrl);
        if (response.body) await response.body.cancel();
        continue;
      }
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const title = doc.querySelector('title')?.textContent?.trim() || '';
      const description = childText(doc, 'meta[name="description"]');
      const metaLevel=ruleLevel(config.seo.meta);
      if (metaLevel) {
        report(pageId + '-META', title && description ? 'pass' : metaLevel,
          'Page title and meta description',
          !title ? 'Missing <title>.' : !description ? 'Missing meta description.' : undefined, pageUrl);
      }
      const robots = Array.from(doc.querySelectorAll('meta[name="robots"]'))
        .map(tag => tag.getAttribute('content') || '').join(',').toLowerCase();
      report(pageId + '-INDEX', /(?:^|[, ]+)noindex\b/.test(robots) ? 'fail' : 'pass',
        /(?:^|[, ]+)noindex\b/.test(robots) ? 'Sitemap page has noindex directive.' : 'No HTML noindex directive.',
        undefined, pageUrl);
      const canonicalLevel=ruleLevel(config.seo.canonical);
      if (canonicalLevel) {
        const canonicals = Array.from(doc.querySelectorAll('link[rel~="canonical"]'))
          .map(tag => tag.getAttribute('href')).filter((href): href is string => Boolean(href));
        if (canonicals.length !== 1) {
          report(pageId + '-CANONICAL', canonicalLevel,
            canonicals.length ? 'Multiple canonical URLs' : 'Canonical URL missing.',
            undefined, pageUrl);
        } else {
          try {
            const canonical = httpUrl(canonicals[0]!, pageUrl);
            report(pageId + '-CANONICAL',
              !sameHost(canonical.href, root.href) ? 'fail' :
                canonical.pathname !== new URL(pageUrl).pathname ? canonicalLevel : 'pass',
              'Canonical URL: ' + canonical.href,
              canonical.pathname !== new URL(pageUrl).pathname ?
                'Canonical path differs from the sitemap URL.' : undefined,
              pageUrl);
          } catch {
            report(pageId + '-CANONICAL', 'fail', 'Invalid canonical URL',
              canonicals[0], pageUrl);
          }
        }
      }
      const lang = doc.documentElement.getAttribute('lang')?.trim().toLowerCase() || '';
      const prefix = new URL(pageUrl).pathname.match(/^\/([a-z]{2})(?:\/|$)/i)?.[1]?.toLowerCase();
      report(pageId + '-LANG', !lang ? 'warning' :
        prefix && lang.split('-')[0] !== prefix ? 'fail' : 'pass',
      lang ? 'HTML lang: ' + lang : 'Missing HTML lang attribute.',
      prefix && lang && lang.split('-')[0] !== prefix ?
        'URL language prefix ' + prefix + ' does not match document lang.' : undefined, pageUrl);

      const hreflangLevel=ruleLevel(config.seo.hreflang);
      const alternates = hreflangLevel ? Array.from(
        doc.querySelectorAll('link[rel~="alternate"][hreflang]')
      ).map(link => ({
        language: link.getAttribute('hreflang')?.trim().toLowerCase() || '',
        href: link.getAttribute('href') || '',
      })) : [];
      if (hreflangLevel && alternates.length) {
        const langs = new Set<string>();
        let duplicate = 0;
        for (const alt of alternates) {
          if (langs.has(alt.language)) duplicate++;
          langs.add(alt.language);
          try {
            const resolved = httpUrl(alt.href, pageUrl).href;
            if (!sameHost(resolved, root.href)) {
              report(pageId + '-HREF-DOMAIN', 'warning', 'hreflang points outside this hostname',
                alt.language + ': ' + resolved, pageUrl);
            }
            if (hreflangChecks < MAX_HREFLANG[scope] && sameHost(resolved, root.href)) {
              try {
                const check = await fetchPage(resolved);
                hreflangChecks++;
                linkChecked();
                report(pageId + '-HREF-HTTP', check.ok && redirectOK(check, root, pageId + '-HREF-REDIRECT') ?
                  'pass' : 'fail',
                'hreflang ' + alt.language + ': HTTP ' + check.status,
                undefined, resolved);
                if (check.body) await check.body.cancel();
              } catch (error) {
                assertActive();
                report(pageId + '-HREF-HTTP', 'fail', 'hreflang request failed',
                  errorText(error), resolved);
              }
            } else omittedHreflangs++;
          } catch {
            report(pageId + '-HREF-URL', 'fail', 'Invalid hreflang URL', alt.href, pageUrl);
          }
        }
        const expected=config.expectedLanguages.map(expectedLanguageBase).filter(Boolean);
        const missingExpected=[...new Set(expected)].filter(expected =>
          ![...langs].some(language => expectedLanguageBase(language) === expected));
        const selfMissing=Boolean(prefix &&
          ![...langs].some(language => expectedLanguageBase(language) === prefix));
        const hasIssue=duplicate > 0 || missingExpected.length > 0 || selfMissing;
        report(pageId + '-HREFLANG', hasIssue ? hreflangLevel : 'pass',
          alternates.length + ' hreflang link(s); ' + duplicate + ' duplicate locale(s)',
          [
            selfMissing ? 'Missing self-referencing locale ' + prefix + '.' : '',
            missingExpected.length ? 'Missing configured locales: ' + missingExpected.join(', ') + '.' : '',
          ].filter(Boolean).join(' ' ) || undefined, pageUrl);
      } else if (hreflangLevel) {
        const expected=config.expectedLanguages.length > 0;
        report(pageId + '-HREFLANG', prefix || expected ? hreflangLevel : 'not-run',
          prefix || expected ? 'Expected hreflang links are missing.' :
            'No locale prefix; hreflang not applicable or not published.',
          expected ? 'Configured expected languages: ' + config.expectedLanguages.join(', ') : undefined,
          pageUrl);
      }

      const productLdLevel=ruleLevel(config.seo.productJsonLd);
      if (productLdLevel) {
        const jsonld = structuredProducts(doc);
        if (jsonld.malformed) {
          report(pageId + '-LD-SYNTAX', productLdLevel, jsonld.malformed +
            ' JSON-LD script(s) contain invalid JSON.', undefined, pageUrl);
        }
        if (isProductPage(pageUrl)) {
          const product = jsonld.products[0];
          if (!product) {
            report(pageId + '-PRODUCT-LD', productLdLevel,
              'Product detail has no server-rendered Product JSON-LD.',
              'Client-generated JSON-LD requires a browser-rendered follow-up check.', pageUrl);
          } else {
            const offer = isRecord(product.offers) ? product.offers : {};
            const errors = [
              !product.sku ? 'sku' : '',
              !product.name ? 'name' : '',
              !product.image ? 'image' : '',
              !offer.price ? 'offers.price' : '',
              !offer.priceCurrency ? 'offers.priceCurrency' : '',
            ].filter(Boolean);
            report(pageId + '-PRODUCT-LD', errors.length ? productLdLevel : 'pass',
              'Product JSON-LD detected on product-detail page.',
              errors.length ? 'Missing configured properties: ' + errors.join(', ') : undefined,
              pageUrl);
          }
        } else {
          report(pageId + '-LD', 'pass',
            jsonld.products.length + ' Product JSON-LD object(s) in server HTML.',
            undefined, pageUrl);
        }
      }
    } catch (error) {
      assertActive();
      report(pageId + '-HTTP', 'fail', 'Page request / HTML analysis failed', errorText(error), pageUrl);
    }
    progress('SEO 3/4 · Pages ' + (position + 1) + '/' + selected.length,
      45 + 50*(position+1)/selected.length);
  }
  if (omittedHreflangs) {
    report('SEO-05-SCOPE', 'not-run', omittedHreflangs +
      ' hreflang URL requests were skipped by the run’s request budget.');
  }
  report('SEO-07-INDEX-COVERAGE', 'not-run',
    'Search-engine index coverage needs Search Console / crawl data.',
    'HTTP 200 and XML sitemap inclusion alone cannot prove that search engines indexed a URL.');
  progress('SEO 4/4 · Finished. Review findings and export the report.', 100);
}
