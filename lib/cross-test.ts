import {isRecord, httpUrl} from './feed';

export interface AuditFinding {
  id: string;
  level: 'pass' | 'fail' | 'warning' | 'blocked' | 'not-run';
  summary: string;
  detail?: string;
  url?: string;
  sample?: string;
}
export interface ShardRecord extends Record<string, unknown> {
  sku?: string | number;
  id?: string | number;
}
export interface ShardData {
  records: ShardRecord[];
  parsed: number;
  malformed: number;
  issues: string[];
}
const INVARIANT_KEYS = [
  'id', 'sku', 'mpn', 'gtin', 'brand',
  'availability', 'inventory_quantity',
  'image_link', 'is_eligible_search', 'is_eligible_checkout',
] as const;

export function parseShard(text: string, maxIssues = 20): ShardData {
  const records: ShardRecord[] = [];
  const issues: string[] = [];
  let malformed = 0;
  let parsed = 0;
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    parsed++;
    try {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value)) {
        malformed++;
        if (issues.length < maxIssues) issues.push('Line ' + (index + 1) + ': expected JSON object.');
      } else {
        records.push(value);
        if (!value.gtin && issues.length < maxIssues) {
          issues.push('Line ' + (index + 1) + ': GTIN missing; check feed eligibility rule.');
        }
      }
    } catch (error) {
      malformed++;
      if (issues.length < maxIssues) {
        issues.push('Line ' + (index + 1) + ': ' +
          (error instanceof Error ? error.message : String(error)));
      }
    }
  }
  return {records, parsed, malformed, issues};
}

function comparable(value: unknown): string {
  return value === undefined ? '<absent>' : JSON.stringify(value);
}

function comparablePrice(value: unknown): string {
  if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) return String(Number(value));
  return comparable(value);
}

export interface LanguageDiff {
  countSame: boolean;
  orderSame: boolean;
  invariantSame: boolean;
  countA: number;
  countB: number;
  orderMismatches: number;
  dataMismatches: number;
  examples: string[];
}

export function compareLanguageShards(reference: ShardRecord[], other: ShardRecord[]): LanguageDiff {
  let orderMismatches = 0;
  let dataMismatches = 0;
  const examples: string[] = [];
  const smallest = Math.min(reference.length, other.length);
  for (let i = 0; i < smallest; i++) {
    const a = reference[i]!;
    const b = other[i]!;
    const skuA = String(a.sku ?? '');
    const skuB = String(b.sku ?? '');
    if (skuA !== skuB) {
      orderMismatches++;
      if (examples.length < 12) examples.push(
        'Record #' + (i + 1) + ': reference SKU ' + skuA + ', localized SKU ' + skuB);
      continue;
    }
    for (const field of INVARIANT_KEYS) {
      if (comparable(a[field]) !== comparable(b[field])) {
        dataMismatches++;
        if (examples.length < 12) examples.push(
          'SKU ' + skuA + ': invariant field ' + field + ' differs');
      }
    }
    const priceA = isRecord(a.price) ? a.price : {};
    const priceB = isRecord(b.price) ? b.price : {};
    for (const field of ['value', 'currency']) {
      if ((field === 'value' ? comparablePrice(priceA[field]) : comparable(priceA[field])) !==
          (field === 'value' ? comparablePrice(priceB[field]) : comparable(priceB[field]))) {
        dataMismatches++;
        if (examples.length < 12) examples.push('SKU ' + skuA + ': price.' + field + ' differs');
      }
    }
    // Deliberately do not compare translated title, category, description, or localized URL.
  }
  return {
    countSame: reference.length === other.length,
    orderSame: orderMismatches === 0 && reference.length === other.length,
    invariantSame: dataMismatches === 0 && orderMismatches === 0,
    countA: reference.length, countB: other.length,
    orderMismatches, dataMismatches, examples,
  };
}

export function checkProduct(feed: ShardRecord, single: unknown): string[] {
  if (!isRecord(single)) return ['Single-product endpoint did not return a JSON object.'];
  const differences: string[] = [];
  const fields = [
    'id','sku','mpn','gtin','title','brand','category','description',
    'availability','inventory_quantity','image_link','is_eligible_search','is_eligible_checkout',
  ];
  for (const field of fields) {
    if (comparable(feed[field]) !== comparable(single[field])) {
      differences.push('Field ' + field + ' differs between the shard and single-product JSON.');
    }
  }
  const priceA = isRecord(feed.price) ? feed.price : {};
  const priceB = isRecord(single.price) ? single.price : {};
  for (const field of ['value','currency']) {
    if (String(priceA[field] ?? '') !== String(priceB[field] ?? '')) {
      differences.push('price.' + field + ' differs between the shard and single-product JSON.');
    }
  }
  return differences;
}

export function sampleProducts(records: ShardRecord[], limit: number): ShardRecord[] {
  if (!records.length || limit <= 0) return [];
  const indices = [...new Set([
    0, Math.floor((records.length - 1) / 2), records.length - 1,
    ...Array.from({length: Math.max(0, limit - 3)}, (_, i) =>
      Math.floor((i + 1) * records.length / (Math.max(0, limit - 3) + 1))),
  ])];
  return indices.slice(0, limit).map(i => records[i]!).filter(Boolean);
}

export function normalizeHost(raw: string): string {
  return httpUrl(raw).hostname.toLowerCase();
}
