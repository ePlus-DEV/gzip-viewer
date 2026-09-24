import {describe, expect, it} from 'vitest';
import {AUDIT_MODES, isProductPage, isSitemapUrl, parseRobots, pickPageSamples, sameHost} from '../lib/audit-modes';

describe('AEO and SEO audit modes', () => {
  it('exposes two independent suites and clear source entry points', () => {
    expect(Object.keys(AUDIT_MODES)).toEqual(['aeo', 'seo']);
    expect(AUDIT_MODES.aeo.startingFile).toBe('/llms.txt');
    expect(AUDIT_MODES.seo.startingFile).toBe('/robots.txt');
    expect(AUDIT_MODES.aeo.checks.length).toBeGreaterThan(6);
    expect(AUDIT_MODES.seo.checks.length).toBeGreaterThan(6);
  });
  it('extracts real sitemap declarations and keeps distinct crawler groups', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /private\nAllow: /feeds\n\nUser-agent: Googlebot\nDisallow: /tmp\nSitemap: https://example.com/sitemap.xml\nSitemap: https://example.com/sitemap.xml');
    expect(robots.sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(robots.groups).toHaveLength(2);
    expect(robots.groups[0]!.agents).toEqual(['*']);
    expect(robots.disallowAll).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /').disallowAll).toBe(true);
  });
  it('reports malformed robots rules without inventing a sitemap', () => {
    const robots = parseRobots('Disallow: /\nUser-agent:\nSitemap:\nUser-agent: *');
    expect(robots.issues).toHaveLength(3);
    expect(robots.sitemaps).toEqual([]);
  });
  it('recognizes XML.GZ and product detail URLs on arbitrary domains', () => {
    expect(isSitemapUrl('https://example.org/sitemaps/root.xml.gz')).toBe(true);
    expect(isSitemapUrl('https://example.org/feeds/products.json')).toBe(false);
    expect(isProductPage('https://example.org/en/product/sample-item')).toBe(true);
    expect(isProductPage('https://example.org/en/products/123.json')).toBe(false);
    expect(sameHost('https://example.org/a', 'http://example.org/b')).toBe(true);
    expect(sameHost('https://example.org/a', 'https://other.org/b')).toBe(false);
  });
  it('samples first, middle and last without pretending it checks all links', () => {
    expect(pickPageSamples([1,2,3,4,5],3)).toEqual([1,3,5]);
    expect(pickPageSamples([1,2],10)).toEqual([1,2]);
  });
});
