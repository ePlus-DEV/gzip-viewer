import {formatDuration} from './audit-timing';

export const COMPLETION_NOTIFICATION_KEY = 'notifyOnComplete';
export const COMPLETION_NOTIFICATION_PREFIX = 'seo-aeo-audit-complete-';

export interface NotificationReport {
  mode: 'aeo' | 'seo';
  origin: string;
  stopped: boolean;
  durationMs?: number;
  findings: readonly {id: string; level: string}[];
}

export interface CompletionNotification {
  title: string;
  message: string;
}

/**
 * Only an audit that reaches its normal terminal path sends a notification.
 * A finished audit can contain FAIL findings; they belong in the summary,
 * not in an incorrectly reassuring "all tests passed" headline.
 */
export function buildCompletionNotification(report: NotificationReport): CompletionNotification | null {
  if (report.stopped || report.findings.some(item => /(?:^|-)RUN-ERROR$/.test(item.id))) return null;
  let hostname: string;
  try { hostname = new URL(report.origin).hostname; }
  catch { hostname = 'your website'; }

  const count = (level: string): number => report.findings.filter(item => item.level === level).length;
  const parts = [
    count('pass') + ' PASS',
    count('fail') + ' FAIL',
    count('warning') + ' WARNING',
    count('not-run') + ' NOT RUN',
  ];
  if (report.durationMs !== undefined && Number.isFinite(report.durationMs)) {
    parts.push('Duration ' + formatDuration(report.durationMs));
  }
  return {
    title: report.mode.toUpperCase() + ' audit finished · ' + hostname,
    message: parts.join(' · '),
  };
}

/** Notification clicks open only their own audit tab, not unrelated notifications. */
export function notificationTabId(id: string): number | null {
  const match = new RegExp('^' + COMPLETION_NOTIFICATION_PREFIX + '(\\d+)-\\d+$').exec(id);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
