const api = typeof browser !== "undefined" ? browser : chrome;

const statusEl = document.getElementById("status");
const exportBtn = document.getElementById("export");
const stopBtn = document.getElementById("stop");
const baselineBtn = document.getElementById("baseline");
const resetBtn = document.getElementById("reset");

function setStatus(text) {
  statusEl.textContent = text;
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
  setStatus("Baseline set. Next export will include only new likes.");
});

resetBtn.addEventListener("click", async () => {
  await api.runtime.sendMessage({ type: "RESET_LAST_SEEN" });
  setStatus("Last seen cleared.");
});
