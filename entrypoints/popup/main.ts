import { browser } from 'wxt/browser';
import { httpUrl } from '../../lib/feed';

const form = document.querySelector<HTMLFormElement>('#openForm')!;
const input = document.querySelector<HTMLInputElement>('#url')!;
const previous = document.querySelector<HTMLButtonElement>('#lastFeed')!;
const errorEl = document.querySelector<HTMLParagraphElement>('#error')!;

async function openViewer(raw: string): Promise<void> {
  let url: URL;
  try {
    url = httpUrl(raw);
  } catch {
    errorEl.textContent = 'Enter a valid HTTP or HTTPS URL.';
    return;
  }
  try {
    errorEl.textContent = '';
    await browser.storage.local.set({lastUrl: url.href});
    const viewer = browser.runtime.getURL('/viewer.html');
    await browser.tabs.create({url: viewer + '?url=' + encodeURIComponent(url.href)});
    window.close();
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : 'Could not open the viewer.';
  }
}

void browser.storage.local.get('lastUrl').then(({lastUrl}) => {
  if (typeof lastUrl === 'string' && lastUrl) {
    input.value = lastUrl;
    previous.disabled = false;
  } else {
    previous.disabled = true;
  }
});

form.addEventListener('submit', event => {
  event.preventDefault();
  void openViewer(input.value.trim());
});

previous.addEventListener('click', () => {
  void openViewer(input.value.trim());
});
