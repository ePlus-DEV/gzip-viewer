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
      .toBe('text');
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
