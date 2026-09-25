import type {AuditMode, TestScope} from './audit-modes';
import {httpUrl} from './feed';

/** Canonical entry point shown by both popup and full dashboard. */
export function auditEntryUrl(siteInput: string, mode: AuditMode): string {
  const site = httpUrl(siteInput);
  return new URL(mode === 'seo' ? '/robots.txt' : '/llms.txt', site.origin).href;
}

/**
 * The popup's Run action opens a one-time audit launch. Exploring a resource,
 * opening a bookmarked runner or reloading the results page must not run scans.
 */
export function auditLaunchUrl(
  runnerPage: string,
  siteInput: string,
  mode: AuditMode,
  scope: TestScope,
): string {
  const runner = new URL(runnerPage);
  runner.searchParams.set('url', auditEntryUrl(siteInput, mode));
  runner.searchParams.set('mode', mode);
  runner.searchParams.set('scope', scope);
  runner.searchParams.set('autorun', '1');
  return runner.href;
}

/** Validates and consumes the launch flag without mutating the browser URL. */
export function pendingAutoRun(
  runnerLocation: string,
): {targetUrl: string; cleanHref: string} | null {
  try {
    const runner = new URL(runnerLocation);
    if (runner.searchParams.get('autorun') !== '1') return null;
    const target = httpUrl(runner.searchParams.get('url') || '');
    runner.searchParams.delete('autorun');
    return {targetUrl: target.href, cleanHref: runner.href};
  } catch {
    return null;
  }
}
