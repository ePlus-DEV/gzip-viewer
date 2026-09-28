export const AUDIT_CONFIG_STORAGE_KEY = 'auditValidationConfigV1';

export type RuleLevel = 'required' | 'recommended' | 'off';
export type GtinPolicy = 'eligible' | 'all' | 'off';

export interface AuditValidationConfig {
  version: 1;
  expectedLanguages: string[];
  aeo: {
    feedFreshnessHours: number;
    maxRecordsPerShard: number;
    gtinPolicy: GtinPolicy;
    partsCompatibility: RuleLevel;
  };
  seo: {
    quickPageLimit: number;
    fullPageLimit: number;
    canonical: RuleLevel;
    meta: RuleLevel;
    hreflang: RuleLevel;
    productJsonLd: RuleLevel;
    sitemapLastmodMaxAgeDays: number;
  };
}

export const DEFAULT_AUDIT_CONFIG: AuditValidationConfig = {
  version: 1,
  expectedLanguages: [],
  aeo: {
    feedFreshnessHours: 24,
    maxRecordsPerShard: 50000,
    gtinPolicy: 'eligible',
    partsCompatibility: 'required',
  },
  seo: {
    quickPageLimit: 15,
    fullPageLimit: 500,
    canonical: 'recommended',
    meta: 'recommended',
    hreflang: 'recommended',
    productJsonLd: 'recommended',
    sitemapLastmodMaxAgeDays: 0,
  },
};

const LEVELS = new Set<RuleLevel>(['required', 'recommended', 'off']);
const GTIN = new Set<GtinPolicy>(['eligible', 'all', 'off']);

function boundedInt(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function normalizeExpectedLanguages(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[\s,;]+/) : [];
  const result = raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().toLowerCase())
    .filter(item => /^[a-z]{2}(?:-[a-z]{2})?$/i.test(item));
  return [...new Set(result)];
}

function rule(value: unknown, fallback: RuleLevel): RuleLevel {
  return typeof value === 'string' && LEVELS.has(value as RuleLevel)
    ? value as RuleLevel : fallback;
}

function gtin(value: unknown, fallback: GtinPolicy): GtinPolicy {
  return typeof value === 'string' && GTIN.has(value as GtinPolicy)
    ? value as GtinPolicy : fallback;
}

export function normalizeAuditConfig(value: unknown): AuditValidationConfig {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const aeo = source.aeo && typeof source.aeo === 'object'
    ? source.aeo as Record<string, unknown> : {};
  const seo = source.seo && typeof source.seo === 'object'
    ? source.seo as Record<string, unknown> : {};

  return {
    version: 1,
    expectedLanguages: normalizeExpectedLanguages(source.expectedLanguages),
    aeo: {
      feedFreshnessHours: boundedInt(
        aeo.feedFreshnessHours, DEFAULT_AUDIT_CONFIG.aeo.feedFreshnessHours, 0, 24 * 30,
      ),
      maxRecordsPerShard: boundedInt(
        aeo.maxRecordsPerShard, DEFAULT_AUDIT_CONFIG.aeo.maxRecordsPerShard, 1000, 500000,
      ),
      gtinPolicy: gtin(aeo.gtinPolicy, DEFAULT_AUDIT_CONFIG.aeo.gtinPolicy),
      partsCompatibility: rule(
        aeo.partsCompatibility, DEFAULT_AUDIT_CONFIG.aeo.partsCompatibility,
      ),
    },
    seo: {
      quickPageLimit: boundedInt(
        seo.quickPageLimit, DEFAULT_AUDIT_CONFIG.seo.quickPageLimit, 1, 200,
      ),
      fullPageLimit: boundedInt(
        seo.fullPageLimit, DEFAULT_AUDIT_CONFIG.seo.fullPageLimit, 1, 5000,
      ),
      canonical: rule(seo.canonical, DEFAULT_AUDIT_CONFIG.seo.canonical),
      meta: rule(seo.meta, DEFAULT_AUDIT_CONFIG.seo.meta),
      hreflang: rule(seo.hreflang, DEFAULT_AUDIT_CONFIG.seo.hreflang),
      productJsonLd: rule(seo.productJsonLd, DEFAULT_AUDIT_CONFIG.seo.productJsonLd),
      sitemapLastmodMaxAgeDays: boundedInt(
        seo.sitemapLastmodMaxAgeDays,
        DEFAULT_AUDIT_CONFIG.seo.sitemapLastmodMaxAgeDays,
        0,
        3650,
      ),
    },
  };
}

export function ruleLevel(level: RuleLevel): 'fail' | 'warning' | null {
  if (level === 'required') return 'fail';
  if (level === 'recommended') return 'warning';
  return null;
}

export function isStale(iso: string | null, maxAgeHours: number, now = Date.now()): boolean {
  if (!iso || maxAgeHours <= 0) return false;
  const timestamp = Date.parse(iso);
  return Number.isNaN(timestamp) || now - timestamp > maxAgeHours * 60 * 60 * 1000;
}

export function expectedLanguageBase(language: string): string {
  return language.toLowerCase().split('-')[0] || '';
}
