const urlInput = document.getElementById("url");
const form = document.getElementById("openForm");
const errorEl = document.getElementById("error");
const lastFeedBtn = document.getElementById("lastFeed");

chrome.storage.local.get(["lastUrl"], ({ lastUrl }) => {
  if (lastUrl) urlInput.value = lastUrl;
  lastFeedBtn.disabled = !lastUrl;
});

async function openUrl(value) {
  let url;
  try {
    url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    errorEl.textContent = "Enter a valid HTTP or HTTPS URL.";
    return;
  }

  errorEl.textContent = "";
  await chrome.storage.local.set({ lastUrl: url.href });
  await chrome.tabs.create({
    url: chrome.runtime.getURL("viewer.html") + "?url=" + encodeURIComponent(url.href)
  });
  window.close();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await openUrl(urlInput.value.trim());
  } catch (err) {
    errorEl.textContent = err.message || "Could not open viewer.";
  }
});

lastFeedBtn.addEventListener("click", async () => {
  const { lastUrl } = await chrome.storage.local.get(["lastUrl"]);
  if (lastUrl) await openUrl(lastUrl);
});
