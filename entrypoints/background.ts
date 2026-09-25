import {browser} from 'wxt/browser';
import {notificationTabId} from '../lib/audit-notifications';

export default defineBackground(() => {
  browser.notifications.onClicked.addListener(notificationId => {
    const tabId = notificationTabId(notificationId);
    if (tabId === null) return;
    void (async () => {
      const tab = await browser.tabs.get(tabId);
      if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, {focused:true});
      await browser.tabs.update(tabId, {active:true});
    })().catch(() => { /* The result tab might already be closed. */ });
  });
});
