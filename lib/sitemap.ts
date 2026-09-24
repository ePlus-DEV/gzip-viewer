import { httpUrl } from './feed';

export interface SitemapEntry {
  url: string;
  lastModified: string | null;
  kind: 'sitemap' | 'url';
}
export interface ParsedSitemap {
  title: string;
  entries: SitemapEntry[];
  issues: string[];
}

// Runs in the extension page's DOM. No external XML resources are fetched.
export function parseSitemap(xml: string, source: string): ParsedSitemap {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const errors = doc.getElementsByTagName('parsererror');
  if (errors.length) throw new Error('Invalid sitemap XML: ' + (errors[0]?.textContent || 'parse error').slice(0, 180));
  const root = doc.documentElement;
  const type = root.localName.toLowerCase();
  if (type !== 'sitemapindex' && type !== 'urlset') {
    throw new Error('Expected an XML sitemapindex or urlset document.');
  }
  const entries: SitemapEntry[] = [];
  const issues: string[] = [];
  const children = Array.from(root.children);
  for (const child of children) {
    const kind = child.localName.toLowerCase();
    if ((type === 'sitemapindex' && kind !== 'sitemap') || (type === 'urlset' && kind !== 'url')) continue;
    const loc = Array.from(child.children).find(el => el.localName.toLowerCase() === 'loc')?.textContent?.trim();
    const lastModified = Array.from(child.children).find(el => el.localName.toLowerCase() === 'lastmod')?.textContent?.trim() || null;
    if (!loc) {
      issues.push('A sitemap entry has no <loc> URL.');
      continue;
    }
    try {
      entries.push({url: httpUrl(loc, source).href, lastModified, kind: kind as 'sitemap' | 'url'});
    } catch {
      issues.push('A sitemap entry has an invalid HTTP(S) URL.');
    }
  }
  return {title: type === 'sitemapindex' ? 'Sitemap index' : 'URL sitemap', entries, issues};
}
