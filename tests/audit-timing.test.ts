import {describe, expect, it} from 'vitest';
import {
  estimateStageRemainingMs, formatDuration, shouldShowBackToTop, stageFromMessage,
} from '../lib/audit-timing';

describe('audit timing and navigation', () => {
  it('formats accurate wall-clock durations without a 24-hour wrap', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(61000)).toBe('00:01:01');
    expect(formatDuration(3661000)).toBe('01:01:01');
    expect(formatDuration(26 * 3600 * 1000)).toBe('26:00:00');
  });

  it('only considers completed shard/page units, not overall phase percentages', () => {
    expect(stageFromMessage('1/5 · Reading agents.md')).toBeNull();
    expect(stageFromMessage('4/5 · Loading and comparing 25 shard group(s)…'))
      .toEqual({stage: 'aeo-shards', completed: null, total: null});
    expect(stageFromMessage('4/5 · Compared shard group 13 (13/25)'))
      .toEqual({stage: 'aeo-shards', completed: 13, total: 25});
    expect(stageFromMessage('SEO 2/4 · XML sitemaps: 2/100'))
      .toEqual({stage: 'seo-sitemaps', completed: 2, total: 100});
    expect(stageFromMessage('SEO 3/4 · Pages 13/15'))
      .toEqual({stage: 'seo-pages', completed: 13, total: 15});
  });

  it('estimates only after two actual units and sufficient observation time', () => {
    expect(estimateStageRemainingMs(1, 25, 8000)).toBeNull();
    expect(estimateStageRemainingMs(2, 25, 2000)).toBeNull();
    expect(estimateStageRemainingMs(5, 10, 50000)).toBe(50000);
    expect(estimateStageRemainingMs(10, 10, 50000)).toBeNull();
    expect(estimateStageRemainingMs(11, 10, 50000)).toBeNull();
  });

  it('makes Back to top available after a meaningful scroll', () => {
    expect(shouldShowBackToTop(0)).toBe(false);
    expect(shouldShowBackToTop(459)).toBe(false);
    expect(shouldShowBackToTop(460)).toBe(true);
  });
});
