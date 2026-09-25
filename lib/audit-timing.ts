/** UI-only estimates. Progress is based on completed, similarly-sized work units. */
export type AuditStage = 'aeo-shards' | 'seo-sitemaps' | 'seo-pages';

export interface StageProgress {
  stage: AuditStage;
  completed: number | null;
  total: number | null;
}

function countAtEnd(message: string): {completed: number; total: number} | null {
  const match = message.match(/(\d+)\/(\d+)\)?\s*$/);
  if (!match) return null;
  const completed = Number(match[1]);
  const total = Number(match[2]);
  return total > 0 && completed <= total ? {completed, total} : null;
}

/** Interpret only explicit work-unit progress; "4/5 stages" is not a speed sample. */
export function stageFromMessage(message: string): StageProgress | null {
  if (/Loading and comparing \d+ shard group/i.test(message)) {
    return {stage: 'aeo-shards', completed: null, total: null};
  }
  if (/Compared shard group/i.test(message)) {
    const numbers = countAtEnd(message);
    return numbers ? {stage: 'aeo-shards', ...numbers} : null;
  }
  if (/SEO 2\/4.*Crawling XML sitemap/i.test(message)) {
    return {stage: 'seo-sitemaps', completed: null, total: null};
  }
  if (/SEO 2\/4.*XML sitemaps:/i.test(message)) {
    const numbers = countAtEnd(message);
    return numbers ? {stage: 'seo-sitemaps', ...numbers} : null;
  }
  if (/SEO 3\/4.*Validating \d+ page/i.test(message)) {
    return {stage: 'seo-pages', completed: null, total: null};
  }
  if (/SEO 3\/4.*Pages /i.test(message)) {
    const numbers = countAtEnd(message);
    return numbers ? {stage: 'seo-pages', ...numbers} : null;
  }
  return null;
}

export function estimateStageRemainingMs(
  completed: number,
  total: number,
  stageElapsedMs: number,
): number | null {
  if (!Number.isFinite(stageElapsedMs) || stageElapsedMs < 2500 ||
      !Number.isInteger(total) || !Number.isInteger(completed) ||
      completed < 2 || total <= completed || completed > total) return null;
  const remaining = Math.ceil((stageElapsedMs / completed) * (total - completed));
  return remaining <= 72 * 60 * 60 * 1000 ? remaining : null;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map(n => String(n).padStart(2, '0')).join(':');
}

export function shouldShowBackToTop(scrollY: number): boolean {
  return scrollY >= 460;
}
