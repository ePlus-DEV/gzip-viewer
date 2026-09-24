export type AuditMode = 'aeo' | 'seo';
export type TestScope = 'quick' | 'full';

export interface ModeDefinition {
  id: AuditMode;
  name: string;
  description: string;
  startingFile: string;
  checks: readonly string[];
}

export const AUDIT_MODES: Record<AuditMode, ModeDefinition> = {
  aeo: {
    id: 'aeo', name: 'AEO Audit',
    description: 'AI discovery, llms.txt, agents.md, product feeds and multilingual data',
    startingFile: '/llms.txt',
    checks: [
      'AEO-01 llms.txt discovery and links',
      'AEO-02 agents.md discovery and endpoint references',
      'AEO-03 Product-feed index, domain and published shard count',
      'AEO-04 GZIP / JSONL validity, GTIN and 50,000-item limit',
      'AEO-05 Cross-language shard count, SKU order and invariant data',
      'AEO-06 Sample product JSON, detail page and Product JSON-LD',
      'AEO-07 XML discovery links and URL availability',
      'AEO-08 Database-to-feed coverage (requires authoritative SKU export)',
    ],
  },
  seo: {
    id: 'seo', name: 'SEO Audit',
    description: 'robots.txt, XML sitemap, canonical, hreflang and structured data',
    startingFile: '/robots.txt',
    checks: [
      'SEO-01 robots.txt availability, syntax and sitemap declarations',
      'SEO-02 Sitemap index and nested XML sitemap validation',
      'SEO-03 Discovered URL HTTP status and redirect-domain consistency',
      'SEO-04 Canonical, indexability and HTML metadata',
      'SEO-05 hreflang and language declarations',
      'SEO-06 Product detail page structured data',
      'SEO-07 Full index coverage (requires Search Console data)',
    ],
  },
};

export interface RobotsResult {
  sitemaps: string[];
  issues: string[];
  disallowAll: boolean;
  groups: {agents: string[]; disallow: string[]; allow: string[]}[];
}

export function parseRobots(text: string): RobotsResult {
  const sitemaps: string[] = [];
  const issues: string[] = [];
  const groups: RobotsResult['groups'] = [];
  let active: RobotsResult['groups'][number] | null = null;
  let rulesStarted = false;
  for (const [index, original] of text.split(/\r?\n/).entries()) {
    const line = original.replace(/#.*$/, '').trim();
    if (!line) continue;
    const match = line.match(/^([a-z][a-z-]*)\s*:\s*(.*?)\s*$/i);
    if (!match) {
      if (/^[a-z-]+\s/i.test(line)) issues.push('Line ' + (index + 1) + ': invalid directive syntax.');
      continue;
    }
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      else issues.push('Line ' + (index + 1) + ': empty Sitemap directive.');
    } else if (key === 'user-agent') {
      if (!value) {
        issues.push('Line ' + (index + 1) + ': empty User-agent.');
        continue;
      }
      if (!active || rulesStarted) {
        active = {agents: [], disallow: [], allow: []};
        groups.push(active);
        rulesStarted = false;
      }
      active.agents.push(value.toLowerCase());
    } else if (key === 'disallow' || key === 'allow') {
      if (!active) issues.push('Line ' + (index + 1) + ': rule without User-agent.');
      else {
        active[key].push(value);
        rulesStarted = true;
      }
    }
  }
  const global = groups.find(group => group.agents.includes('*'));
  return {
    sitemaps: [...new Set(sitemaps)],
    issues,
    disallowAll: Boolean(global?.disallow.includes('/') && !global.allow.includes('/')),
    groups,
  };
}

export function isSitemapUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return /^https?:$/.test(url.protocol) && /\.xml(?:\.gz)?$/i.test(url.pathname);
  } catch { return false; }
}

export function isProductPage(input: string): boolean {
  try {
    return /\/(?:product|products)\/[^/]+\/?$/i.test(new URL(input).pathname);
  } catch { return false; }
}

export function sameHost(a: string, b: string): boolean {
  try { return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase(); }
  catch { return false; }
}

export function pickPageSamples<T>(items: T[], limit: number): T[] {
  if (limit <= 0 || items.length === 0) return [];
  if (items.length <= limit) return items;
  if (limit === 1) return [items[0]!];
  const result: T[] = [];
  const seen = new Set<number>();
  for (let i=0; i<limit; i++) {
    const idx = Math.round((i*(items.length-1))/(limit-1));
    if (!seen.has(idx)) { result.push(items[idx]!); seen.add(idx); }
  }
  return result;
}
