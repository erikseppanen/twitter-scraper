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

function extractTweetMetaFromArticle(article) {
  const link = article.querySelector('a[href*="/status/"]');
  if (!link) return null;
  const match = link.getAttribute("href").match(/^\/([^/]+)\/status\/(\d+)/);
  if (!match) return null;
  const author = match[1];
  const id = match[2];
  const textEl = article.querySelector('div[data-testid="tweetText"]');
  const text = textEl ? textEl.innerText.trim() : "";
  return { id, author, text };
}

function getFirstVisibleId() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  for (const article of articles) {
    const rect = article.getBoundingClientRect();
    const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
    if (!isVisible) continue;
    const meta = extractTweetMetaFromArticle(article);
    if (meta) return meta;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let cancelExport = false;
let pickBaselineMode = false;

function enablePickBaselineMode() {
  pickBaselineMode = true;
}

function disablePickBaselineMode() {
  pickBaselineMode = false;
}

async function collectNewLikes() {
  if (!isLikesPage()) {
    return { ok: false, error: "Open your Likes page on x.com first." };
  }

  const storage = await api.storage.local.get("lastSeenId");
  const lastSeenId = storage.lastSeenId || null;
  if (!lastSeenId) {
    return {
      ok: true,
      count: 0,
      message: "No baseline set. Click 'Set current as baseline' first."
    };
  }

  const seen = new Set();
  const newIds = [];
  let foundLastSeen = false;
  let noNewCount = 0;
  let newestMeta = null;

  for (let i = 0; i < 200; i += 1) {
    if (cancelExport) {
      cancelExport = false;
      return { ok: true, count: 0, message: "Export stopped." };
    }
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
      if (!newestMeta) {
        const article = document.querySelector(`a[href$="/status/${id}"]`)?.closest('article[data-testid="tweet"]');
        if (article) {
          newestMeta = extractTweetMetaFromArticle(article);
        }
      }
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
    await api.runtime.sendMessage({
      type: "DOWNLOAD_IDS",
      ids: newIds,
      newestId,
      newestAuthor: newestMeta ? newestMeta.author : null,
      newestText: newestMeta ? newestMeta.text : null
    });
  }

  return {
    ok: true,
    count: newIds.length,
    newestId,
    lastSeenId,
    stoppedOnLastSeen: foundLastSeen
  };
}

async function setBaseline() {
  if (!isLikesPage()) {
    return { ok: false, error: "Open your Likes page on x.com first." };
  }
  const meta = getFirstVisibleId();
  if (!meta) {
    return { ok: false, error: "No tweets found on the page yet." };
  }
  await api.storage.local.set({
    lastSeenId: meta.id,
    lastSeenAuthor: meta.author || null,
    lastSeenText: meta.text || ""
  });
  return {
    ok: true,
    lastSeenId: meta.id,
    lastSeenAuthor: meta.author || null,
    lastSeenText: meta.text || ""
  };
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return;
  if (message.type === "EXPORT_NEW_LIKES") {
    collectNewLikes().then(sendResponse);
    return true;
  }
  if (message.type === "CANCEL_EXPORT") {
    cancelExport = true;
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "SET_BASELINE") {
    setBaseline().then(sendResponse);
    return true;
  }
  if (message.type === "PICK_BASELINE") {
    if (!isLikesPage()) {
      sendResponse({ ok: false, error: "Open your Likes page on x.com first." });
      return;
    }
    enablePickBaselineMode();
    sendResponse({ ok: true });
    return;
  }
});

document.addEventListener(
  "click",
  async (event) => {
    if (!pickBaselineMode) return;
    const article = event.target.closest('article[data-testid="tweet"]');
    const meta = article ? extractTweetMetaFromArticle(article) : null;
    if (!meta) return;
    event.preventDefault();
    event.stopPropagation();
    disablePickBaselineMode();
    await api.storage.local.set({
      lastSeenId: meta.id,
      lastSeenAuthor: meta.author || null,
      lastSeenText: meta.text || ""
    });
    api.runtime.sendMessage({
      type: "BASELINE_PICKED",
      lastSeenId: meta.id,
      lastSeenAuthor: meta.author || null,
      lastSeenText: meta.text || ""
    });
  },
  true
);
