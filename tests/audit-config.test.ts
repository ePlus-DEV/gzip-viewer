import {describe,expect,it} from 'vitest';
import {
  DEFAULT_AUDIT_CONFIG, expectedLanguageBase, isStale,
  normalizeAuditConfig, normalizeExpectedLanguages, ruleLevel,
} from '../lib/audit-config';

describe('audit validation configuration',()=>{
  it('normalizes expected languages and removes duplicates',()=>{
    expect(normalizeExpectedLanguages('EN, de; fr en invalid_language')).toEqual(['en','de','fr']);
    expect(normalizeExpectedLanguages(['pt-BR','PT-br','ja'])).toEqual(['pt-br','ja']);
  });

  it('uses safe defaults and clamps numeric overrides',()=>{
    const config=normalizeAuditConfig({
      expectedLanguages:'en,de',
      aeo:{feedFreshnessHours:-1,maxRecordsPerShard:9999999,gtinPolicy:'off',partsCompatibility:'recommended'},
      seo:{quickPageLimit:999,fullPageLimit:0,canonical:'required',meta:'off',hreflang:'recommended',productJsonLd:'required',sitemapLastmodMaxAgeDays:99999},
    });
    expect(config.expectedLanguages).toEqual(['en','de']);
    expect(config.aeo.feedFreshnessHours).toBe(0);
    expect(config.aeo.maxRecordsPerShard).toBe(500000);
    expect(config.aeo.gtinPolicy).toBe('off');
    expect(config.seo.quickPageLimit).toBe(200);
    expect(config.seo.fullPageLimit).toBe(1);
    expect(config.seo.sitemapLastmodMaxAgeDays).toBe(3650);
  });

  it('maps rule policy to finding severity',()=>{
    expect(ruleLevel('required')).toBe('fail');
    expect(ruleLevel('recommended')).toBe('warning');
    expect(ruleLevel('off')).toBeNull();
  });

  it('supports configurable freshness and locale bases',()=>{
    const now=Date.parse('2026-09-28T12:00:00Z');
    expect(isStale('2026-09-27T10:00:00Z',24,now)).toBe(true);
    expect(isStale('2026-09-28T10:00:00Z',24,now)).toBe(false);
    expect(isStale('2020-01-01T00:00:00Z',0,now)).toBe(false);
    expect(expectedLanguageBase('pt-BR')).toBe('pt');
  });

  it('keeps the generic extension defaults conservative',()=>{
    expect(DEFAULT_AUDIT_CONFIG.aeo.maxRecordsPerShard).toBe(50000);
    expect(DEFAULT_AUDIT_CONFIG.aeo.feedFreshnessHours).toBe(24);
    expect(DEFAULT_AUDIT_CONFIG.seo.fullPageLimit).toBe(500);
    expect(DEFAULT_AUDIT_CONFIG.expectedLanguages).toEqual([]);
  });
});
