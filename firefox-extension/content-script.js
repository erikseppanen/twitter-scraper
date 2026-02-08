const api = typeof browser !== "undefined" ? browser : chrome;

function isLikesPage() {
  return /\/(i\/likes|likes)\b/.test(location.pathname);
}

function extractIdsFromPage() {
  const ids = [];
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  articles.forEach((article) => {
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return;
    const match = link.getAttribute("href").match(/\/status\/(\d+)/);
    if (match) ids.push(match[1]);
  });
  return ids;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectNewLikes() {
  if (!isLikesPage()) {
    return { ok: false, error: "Open your Likes page on x.com first." };
  }

  const storage = await api.storage.local.get("lastSeenId");
  const lastSeenId = storage.lastSeenId || null;

  const seen = new Set();
  const newIds = [];
  let foundLastSeen = false;
  let noNewCount = 0;

  for (let i = 0; i < 200; i += 1) {
    const ids = extractIdsFromPage();
    let addedThisRound = 0;

    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (lastSeenId && id === lastSeenId) {
        foundLastSeen = true;
        break;
      }
      newIds.push(id);
      addedThisRound += 1;
    }

    if (foundLastSeen) break;

    if (addedThisRound === 0) {
      noNewCount += 1;
    } else {
      noNewCount = 0;
    }

    if (noNewCount >= 3) break;

    window.scrollTo(0, document.body.scrollHeight);
    await sleep(800);
  }

  const newestId = newIds.length ? newIds[0] : null;
  if (newIds.length) {
    await api.runtime.sendMessage({ type: "DOWNLOAD_IDS", ids: newIds, newestId });
  }

  return {
    ok: true,
    count: newIds.length,
    newestId,
    lastSeenId,
    stoppedOnLastSeen: foundLastSeen
  };
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "EXPORT_NEW_LIKES") return;
  collectNewLikes().then(sendResponse);
  return true;
});
