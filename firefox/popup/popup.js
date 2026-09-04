"use strict";

let activeTabId = null;
let currentState = null;

const elements = {
  connection: document.querySelector("#connection"),
  count: document.querySelector("#count"),
  sources: document.querySelector("#sources"),
  sendBest: document.querySelector("#send-best"),
  sendPage: document.querySelector("#send-page"),
  clear: document.querySelector("#clear"),
  settings: document.querySelector("#gear-settings"),
  close: document.querySelector("#close-popup"),
  connectionMode: document.querySelector("#connection-mode"),
  message: document.querySelector("#message")
};

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.classList.toggle("error", isError);
}

function setBusy(busy) {
  elements.sendBest.disabled = busy;
  elements.sendPage.disabled = busy;
  elements.sources.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
}

async function send(message) {
  setBusy(true);
  setMessage("Sending to JDownloader…");
  try {
    const response = await browser.runtime.sendMessage({ ...message, tabId: activeTabId });
    if (!response?.ok) throw new Error(response?.error || "JDownloader rejected the link.");
    setMessage("Sent to JDownloader 2 ✓");
  } catch (error) {
    setMessage(error.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

function sourceButton(candidate) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "source";
  const title = document.createElement("strong");
  title.textContent = candidate.label;
  const detail = document.createElement("small");
  detail.textContent = candidate.fileName || candidate.url;
  button.append(title, detail);
  button.addEventListener("click", () => send({ type: "JDVG_SEND_CANDIDATE", candidateId: candidate.id }));
  return button;
}

function renderState(state) {
  currentState = state;
  const candidates = state?.candidates || [];
  elements.count.textContent = `${candidates.length} detected source${candidates.length === 1 ? "" : "s"}`;
  elements.sources.replaceChildren();
  if (!candidates.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = state?.mediaElements
      ? "Play the video to expose its stream, or analyze the page with JDownloader."
      : "No video has been detected on this page yet.";
    elements.sources.appendChild(empty);
  } else {
    candidates.forEach((candidate) => elements.sources.appendChild(sourceButton(candidate)));
  }
  elements.sendBest.textContent = state?.pagePreferred
    ? "Send page to JDownloader (recommended)"
    : "Send best match to JDownloader";
  elements.sendBest.disabled = !state?.pageUrl;
  elements.sendPage.disabled = !state?.pageUrl;
}

async function initialize() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tabs[0]?.id;
  if (!Number.isInteger(activeTabId)) {
    setMessage("No active browser tab was found.", true);
    return;
  }

  const [stateResponse, connectionResponse] = await Promise.all([
    browser.runtime.sendMessage({ type: "JDVG_GET_STATE", tabId: activeTabId }),
    browser.runtime.sendMessage({ type: "JDVG_CHECK_JD" })
  ]);

  if (stateResponse?.state) renderState(stateResponse.state);
  const connected = connectionResponse?.connected === true;
  const myjdNeedsSignIn = connectionResponse?.mode === "myjd" && connectionResponse?.authRequired;
  elements.connection.textContent = connected
    ? "JDownloader 2 is connected"
    : myjdNeedsSignIn ? "MyJDownloader sign-in required" : "JDownloader 2 is not reachable";
  elements.connection.className = `status ${connected ? "connected" : "disconnected"}`;
  if (connectionResponse?.mode === "myjd") {
    elements.connectionMode.textContent = connectionResponse.deviceName
      ? `MyJDownloader · ${connectionResponse.deviceName}`
      : "MyJDownloader";
  } else {
    elements.connectionMode.textContent = connectionResponse?.remote ? "Direct server" : "Local connection";
  }
}

elements.sendBest.addEventListener("click", () => send({ type: "JDVG_SEND_BEST" }));
elements.sendPage.addEventListener("click", () => send({ type: "JDVG_SEND_PAGE" }));
elements.clear.addEventListener("click", async () => {
  const response = await browser.runtime.sendMessage({ type: "JDVG_CLEAR", tabId: activeTabId });
  if (response?.state) renderState(response.state);
  setMessage("Detected sources cleared.");
});
elements.settings.addEventListener("click", async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
elements.close.addEventListener("click", () => window.close());

initialize().catch((error) => setMessage(error.message || String(error), true));
