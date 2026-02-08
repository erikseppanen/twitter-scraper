const api = typeof browser !== "undefined" ? browser : chrome;

function buildFilename() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  return `twitter-likes-${stamp}.txt`;
}

api.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) return;

  if (message.type === "DOWNLOAD_IDS") {
    const ids = Array.isArray(message.ids) ? message.ids : [];
    if (!ids.length) return;

    const content = `${ids.join("\n")}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const filename = buildFilename();

    api.downloads.download({
      url,
      filename,
      saveAs: true
    }).finally(() => {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    if (message.newestId) {
      api.storage.local.set({
        lastSeenId: message.newestId,
        lastSeenAuthor: message.newestAuthor || null,
        lastSeenText: message.newestText || ""
      });
    }
  }

  if (message.type === "RESET_LAST_SEEN") {
    api.storage.local.remove(["lastSeenId", "lastSeenAuthor", "lastSeenText"]);
  }
});
