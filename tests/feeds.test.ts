import { describe, expect, it } from 'vitest';
import {
  auditFeedIndex, determineFormat, httpUrl, parseJsonLines, productIssues, productJsonUrl,
} from '../lib/feed';
import { responseText } from '../lib/decompress';

describe('feed index audit', () => {
  const origin = 'https://example.com/feeds/products.json';
  const exampleIndex = {
    catalog_info: {total_products: 250, total_shards: 2, supported_languages: ['en', 'de']},
    shards: [
      {language: 'en', url: 'https://example.com/feeds/products-en-1.jsonl.gz', last_modified: '2026-09-24T10:00:00Z'},
      {language: 'de', url: 'https://example.com/feeds/products-de-1.jsonl.gz', last_modified: '2026-09-24T11:00:00Z'},
    ],
  };
  it('collects available shard URLs without guessing numbers', () => {
    const audit = auditFeedIndex(exampleIndex, origin);
    expect(audit.issues).toEqual([]);
    expect(audit.shards.map(s => s.language)).toEqual(['en', 'de']);
    expect(audit.declaredShards).toBe(2);
  });

  it('detects count mismatch and duplicate shard URLs', () => {
    const audit = auditFeedIndex({...exampleIndex, catalog_info: {...exampleIndex.catalog_info, total_shards: 9},
      shards: [exampleIndex.shards[0], exampleIndex.shards[0]]}, origin);
    expect(audit.issues.some(i => i.message.includes('Declared shard count'))).toBe(true);
    expect(audit.issues.some(i => i.message.includes('Duplicate shard URL'))).toBe(true);
  });

  it('rejects unsafe shard URLs', () => {
    const audit = auditFeedIndex({...exampleIndex, shards: [{language:'en', url:'javascript:alert(1)'}]}, origin);
    expect(audit.issues.some(i => i.severity === 'error' && i.message.includes('URL'))).toBe(true);
  });
});

describe('record parsing and links', () => {
  it('parses CRLF records and reports malformed line numbers', () => {
    const {rows, invalid} = parseJsonLines('{"sku":"1"}\r\nmalformed\r\n{"sku":"2"}\r\n');
    expect(rows.map(row => row.line)).toEqual([1, 2, 3]);
    expect(invalid).toBe(1);
  });
  it('derives language-specific product JSON from shard URL', () => {
    expect(productJsonUrl('https://example.com/feeds/products-de-3.jsonl.gz', 'AB/2'))
      .toBe('https://example.com/de/products/AB%2F2.json');
    expect(productJsonUrl('https://example.com/feeds/other.jsonl.gz', '1')).toBeNull();
  });
  it('validates HTTP URLs and determines document type', () => {
    expect(() => httpUrl('file:///private.json')).toThrow();
    expect(determineFormat(new URL('https://example.com/feeds/products.json'),
      '{"catalog_info":{},"shards":[]}', 'application/json')).toBe('feed-index');
    expect(determineFormat(new URL('https://example.com/feeds/products-en-1.jsonl.gz'),
      '{"sku":"1"}')).toBe('jsonl');
    expect(determineFormat(new URL('https://example.com/llms.txt'), '# AI discovery'))
      .toBe('llms');
  });
  it('checks missing product metadata without rejecting valid JSON', () => {
    expect(productIssues({sku:'5', title:'Widget', price:{value:'12.50', currency:'EUR'}})).toEqual([]);
    expect(productIssues({sku:'5'}).some(i => i.message.includes('price'))).toBe(true);
  });
});

describe('GZIP decoder', () => {
  it('reads an already-decoded response', async () => {
    expect(await responseText(new Response('{"sku":"1"}'))).toBe('{"sku":"1"}');
  });
  it('decompresses raw GZIP response without writing Downloads', async () => {
    const raw = new Blob(['{"sku":"1"}\n']);
    const compressed = await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    expect(await responseText(new Response(compressed))).toBe('{"sku":"1"}\n');
  });
});

import {parseLlms, resolveLink} from '../lib/discovery';
import {documentLabel, readTrail, viewerHref, childTrail} from '../lib/navigation';

describe('llms-first discovery', () => {
  const lines = [
    '# Example Catalog',
    '## Languages',
    '- English (\x60en\x60)',
    '- German (\x60de\x60)',
    '## Product endpoints',
    '- Single product: \x60https://example.com/{lang}/products/{sku}.json\x60',
    '## Product Feeds & Catalogs',
    '- [Full Product Catalog](https://example.com/feeds/products.json)',
    '- Shards: \x60https://example.com/feeds/products-{lang}-{shard}.jsonl.gz\x60',
    '## Technical Resources',
    '- [Pages sitemap](https://example.com/sitemap/pages_index.xml.gz)',
  ];
  const sample = lines.join('\n').replace(/\\x60/g, '\x60');
  const source = 'https://example.com/llms.txt';

  it('extracts grouped resource links, languages and URL templates', () => {
    const result = parseLlms(sample, source);
    expect(result.title).toBe('Example Catalog');
    expect(result.languages).toEqual(['en', 'de']);
    expect(result.links).toBe(4);
    expect(result.groups.map(group => group.heading)).toEqual([
      'Product endpoints', 'Product Feeds & Catalogs', 'Technical Resources',
    ]);
    expect(result.groups[0]!.links[0]!.placeholders).toEqual(['lang', 'sku']);
  });

  it('resolves product endpoints without guessing missing template values', () => {
    const doc = parseLlms(sample, source);
    const product = doc.groups[0]!.links[0]!;
    const shard = doc.groups[1]!.links[1]!;
    expect(resolveLink(product, source, {lang: 'de', sku: '100470'}))
      .toBe('https://example.com/de/products/100470.json');
    expect(resolveLink(shard, source, {lang: 'en'})).toBeNull();
    expect(resolveLink(shard, source, {lang: 'en', shard: '3'}))
      .toBe('https://example.com/feeds/products-en-3.jsonl.gz');
    expect(resolveLink(product, source, {lang: 'de', sku: '../private'})).toBeNull();
  });
});

describe('persistent sitemap-style navigation', () => {
  const viewer = 'chrome-extension://test-extension/viewer.html';
  const root = {url: 'https://example.com/llms.txt', label: 'llms.txt'};
  const index = {url: 'https://example.com/feeds/products.json', label: 'Product catalog'};
  const shard = {url: 'https://example.com/feeds/products-en-1.jsonl.gz', label: 'EN shard 1'};
  it('keeps the full llms → index → shard → product ancestry across page loads', () => {
    const ancestors = childTrail(childTrail([root], index), shard);
    const target = viewerHref(viewer, 'https://example.com/en/products/100470.json', ancestors, 'Product 100470');
    const params = new URL(target).searchParams;
    expect(readTrail(params.get('trail'))).toEqual([root, index, shard]);
    expect(params.get('label')).toBe('Product 100470');
    const back = viewerHref(viewer, shard.url, [root, index], shard.label);
    expect(readTrail(new URL(back).searchParams.get('trail'))).toEqual([root, index]);
    expect(documentLabel(index.url)).toBe('products.json');
  });
  it('rejects unsafe and malformed ancestry', () => {
    expect(readTrail('[{"url":"javascript:alert(1)","label":"Unsafe"}]')).toEqual([]);
    expect(readTrail('{')).toEqual([]);
    expect(() => viewerHref(viewer, 'file:///private')).toThrow();
  });
  it('recognizes gzip XML sitemaps and llms.txt before generic text', () => {
    expect(determineFormat(new URL('https://example.com/llms.txt'), '# Example')).toBe('llms');
    expect(determineFormat(new URL('https://example.com/sitemap/pages_index.xml.gz'), '<sitemapindex/>'))
      .toBe('sitemap');
  });
});
