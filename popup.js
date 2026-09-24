const urlInput = document.getElementById("url");
const form = document.getElementById("openForm");
const errorEl = document.getElementById("error");

chrome.storage.local.get(["lastUrl"], ({ lastUrl }) => {
  if (lastUrl) urlInput.value = lastUrl;
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const value = urlInput.value.trim();
  let url;
  try {
    url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Use an HTTP or HTTPS URL.");
    }
  } catch (err) {
    errorEl.textContent = "Enter a valid HTTP or HTTPS URL.";
    return;
  }
  try {
    await chrome.storage.local.set({ lastUrl: url.href });
    await chrome.tabs.create({
      url: chrome.runtime.getURL("viewer.html") + "?url=" + encodeURIComponent(url.href)
    });
    window.close();
  } catch (err) {
    errorEl.textContent = err.message || "Could not open viewer.";
  }
});
