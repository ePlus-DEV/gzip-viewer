import {describe, expect, it} from 'vitest';
import {auditEntryUrl, auditLaunchUrl, pendingAutoRun} from '../lib/audit-launch';

const runner = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/test-runner.html';

describe('one-click popup audit launch', () => {
  it('normalizes page/feed URLs to the exact entry point displayed by the runner', () => {
    expect(auditEntryUrl('https://example.com/feeds/products.json', 'aeo'))
      .toBe('https://example.com/llms.txt');
    expect(auditEntryUrl('https://example.com/en/products/123.json', 'seo'))
      .toBe('https://example.com/robots.txt');
    expect(auditEntryUrl('http://localhost:8080/de/product/1', 'aeo'))
      .toBe('http://localhost:8080/llms.txt');
  });
  it('starts AEO from llms and carries the selected scan scope', () => {
    const url = auditLaunchUrl(runner, 'https://example.com/products/123', 'aeo', 'full');
    const params = new URL(url).searchParams;
    expect(params.get('url')).toBe('https://example.com/llms.txt');
    expect(params.get('mode')).toBe('aeo');
    expect(params.get('scope')).toBe('full');
    expect(params.get('autorun')).toBe('1');
    const launch = pendingAutoRun(url);
    expect(launch?.targetUrl).toBe('https://example.com/llms.txt');
    expect(new URL(launch!.cleanHref).searchParams.has('autorun')).toBe(false);
    expect(pendingAutoRun(launch!.cleanHref)).toBeNull();
  });

  it('starts SEO from robots and preserves an origin rather than a product URL', () => {
    const url = auditLaunchUrl(runner, 'http://example.com/some/page', 'seo', 'quick');
    const params = new URL(url).searchParams;
    expect(params.get('url')).toBe('http://example.com/robots.txt');
    expect(params.get('mode')).toBe('seo');
    expect(params.get('scope')).toBe('quick');
  });

  it('does not autorun a manually opened dashboard or malformed URL', () => {
    expect(pendingAutoRun(runner + '?url=https%3A%2F%2Fexample.com')).toBeNull();
    expect(pendingAutoRun(runner + '?url=javascript%3Aalert%281%29&autorun=1')).toBeNull();
    expect(pendingAutoRun(runner + '?autorun=1')).toBeNull();
    expect(() => auditLaunchUrl(runner, 'ftp://example.com', 'aeo', 'quick')).toThrow();
  });
});
