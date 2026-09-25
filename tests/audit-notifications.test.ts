import {describe, expect, it} from 'vitest';
import {
  COMPLETION_NOTIFICATION_PREFIX, buildCompletionNotification,
  notificationTabId,
} from '../lib/audit-notifications';

describe('opt-in audit completion notifications', () => {
  const completed = {
    mode: 'aeo' as const,
    origin: 'https://example.com',
    stopped: false,
    durationMs: 93000,
    findings: [
      {id: 'PCL-1', level: 'pass'},
      {id: 'PCL-2', level: 'fail'},
      {id: 'PCL-3', level: 'warning'},
      {id: 'PCL-4', level: 'not-run'},
    ],
  };
  it('summarizes genuine results and duration without masking failures', () => {
    expect(buildCompletionNotification(completed)).toEqual({
      title: 'AEO audit finished · example.com',
      message: '1 PASS · 1 FAIL · 1 WARNING · 1 NOT RUN · Duration 00:01:33',
    });
  });
  it('supports the separate SEO suite and a report with zero findings', () => {
    const value = buildCompletionNotification({
      mode: 'seo', origin: 'https://example.net', stopped: false, findings: [],
    });
    expect(value?.title).toContain('SEO audit finished');
    expect(value?.message).toBe('0 PASS · 0 FAIL · 0 WARNING · 0 NOT RUN');
  });
  it('never notifies after Stop or unexpected runner errors', () => {
    expect(buildCompletionNotification({...completed, stopped:true})).toBeNull();
    expect(buildCompletionNotification({...completed,
      findings:[...completed.findings,{id:'SEO-RUN-ERROR',level:'fail'}],
    })).toBeNull();
  });
  it('rejects unrelated notifications and extracts the audit tab from its own IDs', () => {
    expect(notificationTabId(COMPLETION_NOTIFICATION_PREFIX + '123-987654321')).toBe(123);
    expect(notificationTabId('another-extension-notification')).toBeNull();
    expect(notificationTabId(COMPLETION_NOTIFICATION_PREFIX + '0-987654321')).toBeNull();
  });
});
