import { browser } from 'wxt/browser';
import { httpUrl } from '../../lib/feed';
import { viewerHref } from '../../lib/navigation';

const form = document.querySelector<HTMLFormElement>('#openForm')!;
const input = document.querySelector<HTMLInputElement>('#url')!;
const lastButton = document.querySelector<HTMLButtonElement>('#lastFeed')!;
const directButton = document.querySelector<HTMLButtonElement>('#openDirect')!;
const runTestsButton = document.querySelector<HTMLButtonElement>('#runTests')!;
const errorEl = document.querySelector<HTMLParagraphElement>('#error')!;

async function openViewer(raw: string, llmsFirst: boolean): Promise<void> {
  let parsed: URL;
  try {
    parsed = httpUrl(raw.trim());
  } catch {
    errorEl.textContent = 'Enter a valid HTTP or HTTPS URL.';
    return;
  }
  const target = llmsFirst ? new URL('/llms.txt', parsed.origin).href : parsed.href;
  try {
    errorEl.textContent = '';
    await browser.storage.local.set({lastUrl: target});
    await browser.tabs.create({url: viewerHref(browser.runtime.getURL('/viewer.html'), target, [],
      llmsFirst ? 'llms.txt' : undefined)});
    window.close();
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : 'Could not open viewer.';
  }
}

void browser.storage.local.get('lastUrl').then(({lastUrl}) => {
  if (typeof lastUrl === 'string' && lastUrl) {
    input.value = lastUrl;
    lastButton.disabled = false;
  } else {
    lastButton.disabled = true;
  }
});

form.addEventListener('submit', event => {
  event.preventDefault();
  void openViewer(input.value, true);
});
directButton.addEventListener('click', () => { void openViewer(input.value, false); });
lastButton.addEventListener('click', () => { void openViewer(input.value, false); });

runTestsButton.addEventListener('click', async () => {
  let url: URL;
  try { url = httpUrl(input.value.trim()); }
  catch {
    errorEl.textContent = 'Enter a valid HTTP or HTTPS site URL.';
    return;
  }
  const root = new URL('/llms.txt', url.origin).href;
  await browser.storage.local.set({lastUrl: root});
  await browser.tabs.create({
    url: browser.runtime.getURL('/test-runner.html') + '?url=' + encodeURIComponent(root),
  });
  window.close();
});
