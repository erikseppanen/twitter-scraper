const api = typeof browser !== "undefined" ? browser : chrome;

const statusEl = document.getElementById("status");
const baselineEl = document.getElementById("baseline-display");
const baselineIdEl = document.getElementById("baseline-id");
const exportBtn = document.getElementById("export");
const stopBtn = document.getElementById("stop");
const baselineBtn = document.getElementById("baseline");
const pickBaselineBtn = document.getElementById("pick-baseline");
const resetBtn = document.getElementById("reset");

function setStatus(text) {
  statusEl.textContent = text;
}

function setBaselineDisplay(id) {
  baselineEl.textContent = id ? `Baseline: ${id}` : "Baseline: not set";
  baselineIdEl.textContent = "";
}

function truncateText(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function setBaselineDisplayMeta(meta) {
  if (!meta || !meta.id) {
    setBaselineDisplay(null);
    return;
  }
  const author = meta.author ? `@${meta.author}` : "Unknown";
  const text = truncateText(meta.text || "", 80);
  baselineEl.textContent = `Baseline: ${author}${text ? " — " + text : ""}`;
  baselineIdEl.textContent = `ID: ${meta.id}`;
}

async function sendToActiveTab(message) {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return { ok: false, error: "No active tab." };
  try {
    return await api.tabs.sendMessage(tabs[0].id, message);
  } catch (err) {
    return { ok: false, error: "Open your Likes page on x.com first." };
  }
}

exportBtn.addEventListener("click", async () => {
  setStatus("Collecting likes... keep the Likes page open.");
  const response = await sendToActiveTab({ type: "EXPORT_NEW_LIKES" });
  if (!response || !response.ok) {
    setStatus(response && response.error ? response.error : "Export failed.");
    return;
  }
  if (response.count === 0) {
    setStatus(response.message || "No new likes found.");
    return;
  }
  setStatus(`Exported ${response.count} new likes.`);
});

stopBtn.addEventListener("click", async () => {
  const response = await sendToActiveTab({ type: "CANCEL_EXPORT" });
  if (!response || !response.ok) {
    setStatus(response && response.error ? response.error : "Stop failed.");
    return;
  }
  setStatus("Stopping export...");
});

baselineBtn.addEventListener("click", async () => {
  const response = await sendToActiveTab({ type: "SET_BASELINE" });
  if (!response || !response.ok) {
    setStatus(response && response.error ? response.error : "Baseline failed.");
    return;
  }
  if (response.lastSeenId) {
    setBaselineDisplayMeta({
      id: response.lastSeenId,
      author: response.lastSeenAuthor,
      text: response.lastSeenText
    });
  }
  setStatus("Baseline set. Next export will include only new likes.");
});

pickBaselineBtn.addEventListener("click", async () => {
  const response = await sendToActiveTab({ type: "PICK_BASELINE" });
  if (!response || !response.ok) {
    setStatus(response && response.error ? response.error : "Pick baseline failed.");
    return;
  }
  setStatus("Click a tweet on the Likes page to set baseline.");
});

resetBtn.addEventListener("click", async () => {
  await api.runtime.sendMessage({ type: "RESET_LAST_SEEN" });
  setStatus("Last seen cleared.");
  setBaselineDisplay(null);
});

api.storage.local.get(["lastSeenId", "lastSeenAuthor", "lastSeenText"]).then((data) => {
  if (data.lastSeenId) {
    setBaselineDisplayMeta({
      id: data.lastSeenId,
      author: data.lastSeenAuthor,
      text: data.lastSeenText
    });
    return;
  }
  setBaselineDisplay(null);
});

api.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "BASELINE_PICKED") return;
  if (message.lastSeenId) {
    setBaselineDisplayMeta({
      id: message.lastSeenId,
      author: message.lastSeenAuthor,
      text: message.lastSeenText
    });
    setStatus("Baseline set from clicked tweet.");
  }
});
