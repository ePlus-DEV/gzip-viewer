import {httpUrl} from './feed';
import type {NavItem} from './navigation';

/** Dashboard is the full-page audit home; "Home" inside the explorer is its document root. */
export interface AuditPreference {
  lastUrl?: unknown;
  auditMode?: unknown;
  auditScope?: unknown;
}

/** Route back to the correct site, including when a sitemap links to a different host. */
export function dashboardHref(
  dashboardPage: string,
  resourceUrl: string | null,
  trail: readonly NavItem[],
  preference: AuditPreference,
  autoRun = false,
): string {
  const page = new URL(dashboardPage);
  const mode = preference.auditMode === 'seo' ? 'seo' : 'aeo';
  const scope = preference.auditScope === 'full' ? 'full' : 'quick';

  // The first ancestor is the site's original discovery document. For a direct
  // resource link, use that resource's origin rather than an unrelated saved site.
  const candidates = [trail[0]?.url, resourceUrl, preference.lastUrl];
  const origin = candidates.flatMap(candidate => {
    if (typeof candidate !== 'string' || !candidate.trim()) return [];
    try { return [httpUrl(candidate).origin]; }
    catch { return []; }
  })[0];
  if (origin) {
    page.searchParams.set('url', new URL(
      mode === 'seo' ? '/robots.txt' : '/llms.txt', origin,
    ).href);
  }
  page.searchParams.set('mode', mode);
  page.searchParams.set('scope', scope);
  if (autoRun && origin) page.searchParams.set('autorun', '1');
  return page.href;
}
