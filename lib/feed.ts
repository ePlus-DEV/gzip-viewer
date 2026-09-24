export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  severity: IssueSeverity;
  message: string;
}

export interface Shard {
  language: string;
  url: string;
  lastModified: string | null;
}

export interface FeedIndexAudit {
  shards: Shard[];
  issues: Issue[];
  totalProducts: number | null;
  declaredShards: number | null;
  languages: string[];
  title: string | null;
}

export interface JsonlRow {
  line: number;
  raw: string;
  data?: unknown;
  error?: string;
  valid: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function httpUrl(input: string, base?: string): URL {
  const url = base ? new URL(input, base) : new URL(input);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS URLs are allowed.');
  }
  return url;
}

export function determineFormat(
  url: URL,
  text: string,
  contentType = '',
): 'feed-index' | 'jsonl' | 'json' | 'text' {
  if (/\.((?:jsonl)|(?:ndjson))(?:\.gz)?$/i.test(url.pathname)) return 'jsonl';
  if (/\.json(?:\.gz)?$/i.test(url.pathname) || /(?:application|text)\/(?:[a-z0-9.+-]*\+)?json/i.test(contentType)) {
    try {
      const value: unknown = JSON.parse(text);
      return isRecord(value) && Array.isArray(value.shards) ? 'feed-index' : 'json';
    } catch {
      return 'json'; // Report invalid JSON; do not silently render it as plain text.
    }
  }
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) && Array.isArray(value.shards) ? 'feed-index' : 'json';
  } catch {
    return 'text';
  }
}

export function auditFeedIndex(value: unknown, source: string): FeedIndexAudit {
  const issues: Issue[] = [];
  const result: FeedIndexAudit = {
    shards: [], issues, totalProducts: null, declaredShards: null, languages: [], title: null,
  };

  if (!isRecord(value)) {
    issues.push({ severity: 'error', message: 'Index must be a JSON object.' });
    return result;
  }

  const info = isRecord(value.catalog_info) ? value.catalog_info : {};
  result.title = typeof info.title === 'string' ? info.title : null;
  result.totalProducts = Number.isSafeInteger(info.total_products) && Number(info.total_products) >= 0
    ? Number(info.total_products) : null;
  result.declaredShards = Number.isSafeInteger(info.total_shards) && Number(info.total_shards) >= 0
    ? Number(info.total_shards) : null;

  if (result.totalProducts === null) issues.push({severity: 'warning', message: 'catalog_info.total_products is missing or invalid.'});
  if (result.declaredShards === null) issues.push({severity: 'warning', message: 'catalog_info.total_shards is missing or invalid.'});

  const supported = Array.isArray(info.supported_languages)
    ? info.supported_languages.filter((lang): lang is string => typeof lang === 'string')
    : [];
  if (!Array.isArray(value.shards)) {
    issues.push({severity: 'error', message: 'shards must be an array.'});
    return result;
  }

  const seen = new Set<string>();
  value.shards.forEach((raw, position) => {
    const n = position + 1;
    if (!isRecord(raw)) {
      issues.push({severity: 'error', message: 'Shard #' + n + ' must be an object.'});
      return;
    }

    const language = typeof raw.language === 'string' ? raw.language.trim().toLowerCase() : '';
    if (!/^[a-z]{2}$/.test(language)) {
      issues.push({severity: 'error', message: 'Shard #' + n + ' has an invalid language.'});
    } else if (supported.length && !supported.includes(language)) {
      issues.push({severity: 'warning', message: 'Shard #' + n + ': language ' + language + ' is not declared in supported_languages.'});
    }

    if (typeof raw.url !== 'string' || !raw.url.trim()) {
      issues.push({severity: 'error', message: 'Shard #' + n + ' is missing its URL.'});
      return;
    }

    let url: URL;
    try {
      url = httpUrl(raw.url, source);
    } catch {
      issues.push({severity: 'error', message: 'Shard #' + n + ' has an invalid HTTP(S) URL.'});
      return;
    }

    if (seen.has(url.href)) issues.push({severity: 'error', message: 'Duplicate shard URL at entry #' + n + '.'});
    seen.add(url.href);

    const match = url.pathname.match(/products-([a-z]{2})-\d+\.jsonl\.gz$/i);
    if (match && language && match[1].toLowerCase() !== language) {
      issues.push({severity: 'warning', message: 'Shard #' + n + ': URL language differs from declared language.'});
    }
    if (!/\.(?:jsonl|ndjson)(?:\.gz)?$/i.test(url.pathname)) {
      issues.push({severity: 'warning', message: 'Shard #' + n + ': URL does not look like a JSONL feed.'});
    }

    const modified = typeof raw.last_modified === 'string' ? raw.last_modified : null;
    if (!modified || Number.isNaN(Date.parse(modified))) {
      issues.push({severity: 'warning', message: 'Shard #' + n + ' has no valid last_modified timestamp.'});
    }
    result.shards.push({language, url: url.href, lastModified: modified});
  });

  if (result.declaredShards !== null && result.declaredShards !== value.shards.length) {
    issues.push({severity: 'error', message: 'Declared shard count (' + result.declaredShards + ') differs from the index array length (' + value.shards.length + ').'});
  }
  result.languages = [...new Set(result.shards.map(s => s.language).filter(Boolean))];
  return result;
}

export function parseJsonLines(text: string): {rows: JsonlRow[]; invalid: number} {
  const rows: JsonlRow[] = [];
  let invalid = 0;
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    const raw = line.trim();
    if (!raw) continue;
    try {
      const data: unknown = JSON.parse(raw);
      rows.push({line: i + 1, raw, data, valid: true});
    } catch (error) {
      invalid++;
      rows.push({line: i + 1, raw, valid: false, error: error instanceof Error ? error.message : String(error)});
    }
  }
  return {rows, invalid};
}

export function productJsonUrl(shardUrl: string, sku: unknown): string | null {
  if ((typeof sku !== 'string' && typeof sku !== 'number') || String(sku).trim() === '') return null;
  let url: URL;
  try {
    url = httpUrl(shardUrl);
  } catch {
    return null;
  }
  const match = url.pathname.match(/(?:^|\/)products-([a-z]{2})-\d+\.(?:jsonl|ndjson)(?:\.gz)?$/i);
  if (!match) return null;
  return url.origin + '/' + match[1].toLowerCase() + '/products/' + encodeURIComponent(String(sku)) + '.json';
}

export function productIssues(value: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isRecord(value)) return [{severity: 'error', message: 'Product must be a JSON object.'}];
  if (typeof value.sku !== 'string' && typeof value.sku !== 'number') {
    issues.push({severity: 'warning', message: 'Product has no SKU.'});
  }
  if (typeof value.title !== 'string' || !value.title.trim()) {
    issues.push({severity: 'warning', message: 'Product has no title.'});
  }
  if (!isRecord(value.price) || !Number.isFinite(Number(value.price.value)) || value.price.value === null || value.price.value === '') {
    issues.push({severity: 'warning', message: 'Product price.value is missing or not numeric.'});
  }
  if (!isRecord(value.price) || typeof value.price.currency !== 'string' || !/^[A-Z]{3}$/.test(value.price.currency)) {
    issues.push({severity: 'warning', message: 'Product price.currency is not a 3-letter currency code.'});
  }
  if (typeof value.url === 'string') {
    try { httpUrl(value.url); } catch { issues.push({severity: 'warning', message: 'Product page URL is invalid.'}); }
  }
  if (typeof value.inventory_quantity === 'number' && value.inventory_quantity < 0) {
    issues.push({severity: 'warning', message: 'Inventory quantity is negative.'});
  }
  return issues;
}
