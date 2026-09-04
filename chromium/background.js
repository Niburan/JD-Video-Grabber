"use strict";

const Detector = globalThis.JDDetector;

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  showOverlay: true,
  showAudio: false,
  showUnconfirmedSources: false,
  minimumFileSizeKB: 512,
  mainAction: "smart",
  autoStart: false,
  usePageTitleFilename: true,
  overlayPosition: "top-right",
  overlayTheme: "blue",
  overlaySize: "normal",
  overlayDesign: "classic",
  jdEndpoint: "http://127.0.0.1:9666"
});

const SETTINGS_KEY = "settings";
const STATE_KEY = "jdvgTabStates";
const tabStates = new Map();
const expandedHlsUrls = new Set();
const stateArea = browser.storage.session || browser.storage.local;
let settingsCache = null;
let saveTimer = null;

const stateReady = restoreState();

async function restoreState() {
  try {
    const stored = await stateArea.get(STATE_KEY);
    const states = stored[STATE_KEY] || {};
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [tabIdText, state] of Object.entries(states)) {
      const tabId = Number(tabIdText);
      if (!Number.isInteger(tabId) || !state || (state.updatedAt || 0) < cutoff) continue;
      state.candidates = Array.isArray(state.candidates) ? state.candidates : [];
      tabStates.set(tabId, state);
    }
  } catch (_error) {
    // Session persistence improves event-page reliability but is not required.
  }
}

function scheduleStateSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const serialized = {};
    for (const [tabId, state] of tabStates.entries()) serialized[tabId] = state;
    try {
      await stateArea.set({ [STATE_KEY]: serialized });
    } catch (_error) {
      // Keep operating in memory if session storage is unavailable.
    }
  }, 120);
}

async function getSettings() {
  if (settingsCache) return settingsCache;
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  settingsCache = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
  return settingsCache;
}

function cleanEndpoint(value) {
  try {
    const parsed = new URL(String(value || DEFAULT_SETTINGS.jdEndpoint));
    const localHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol !== "http:" || !localHost || parsed.port !== "9666") {
      return DEFAULT_SETTINGS.jdEndpoint;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_error) {
    return DEFAULT_SETTINGS.jdEndpoint;
  }
}

function sanitizeSettings(input) {
  const candidate = input || {};
  const mainActions = new Set(["smart", "stream", "page"]);
  const positions = new Set(["top-right", "top-left"]);
  const themes = new Set(["blue", "dark", "green", "red", "orange", "purple", "light"]);
  const sizes = new Set(["compact", "normal", "large"]);
  const designs = new Set(["classic", "flat", "pill"]);
  const size = Number.parseInt(candidate.minimumFileSizeKB, 10);
  return {
    enabled: candidate.enabled !== false,
    showOverlay: candidate.showOverlay !== false,
    showAudio: candidate.showAudio === true,
    showUnconfirmedSources: candidate.showUnconfirmedSources === true,
    minimumFileSizeKB: Number.isFinite(size) ? Math.max(0, Math.min(size, 102400)) : 512,
    mainAction: mainActions.has(candidate.mainAction) ? candidate.mainAction : "smart",
    autoStart: candidate.autoStart === true,
    usePageTitleFilename: candidate.usePageTitleFilename !== false,
    overlayPosition: positions.has(candidate.overlayPosition) ? candidate.overlayPosition : "top-right",
    overlayTheme: themes.has(candidate.overlayTheme) ? candidate.overlayTheme : "blue",
    overlaySize: sizes.has(candidate.overlaySize) ? candidate.overlaySize : "normal",
    overlayDesign: designs.has(candidate.overlayDesign) ? candidate.overlayDesign : "classic",
    jdEndpoint: cleanEndpoint(candidate.jdEndpoint)
  };
}

function newTabState(tabId) {
  return {
    tabId,
    pageUrl: "",
    title: "",
    candidates: [],
    mediaElements: 0,
    updatedAt: Date.now()
  };
}

function getTabState(tabId) {
  if (!tabStates.has(tabId)) tabStates.set(tabId, newTabState(tabId));
  return tabStates.get(tabId);
}

function filenameFromDisposition(value) {
  const encoded = String(value || "").match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try { return decodeURIComponent(encoded[1].replace(/^"|"$/g, "")); } catch (_error) { /* noop */ }
  }
  const plain = String(value || "").match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : "";
}

function totalBytes(headers) {
  const contentRange = Detector.headerValue(headers, "content-range");
  const totalMatch = contentRange.match(/\/(\d+)$/);
  if (totalMatch) return Number.parseInt(totalMatch[1], 10);
  return Detector.headerValue(headers, "content-length");
}

async function addCandidate(tabId, rawCandidate, pageMeta = {}) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  await stateReady;
  const settings = await getSettings();
  if (!settings.enabled) return false;

  const state = getTabState(tabId);
  if (pageMeta.pageUrl) state.pageUrl = pageMeta.pageUrl;
  if (pageMeta.title) state.title = pageMeta.title;
  const candidate = Detector.classify({ ...rawCandidate, pageUrl: rawCandidate.pageUrl || state.pageUrl });
  if (!candidate) return false;

  const minimumBytes = settings.minimumFileSizeKB * 1024;
  if (
    candidate.kind === "video" &&
    candidate.contentLength &&
    candidate.contentLength < minimumBytes &&
    candidate.requestType !== "media"
  ) return false;

  candidate.fileName = rawCandidate.fileName || "";
  candidate.parentUrl = rawCandidate.parentUrl || "";
  const key = Detector.fingerprint(candidate);
  const exactIndex = state.candidates.findIndex((item) => item.url === candidate.url);
  candidate.id = exactIndex >= 0 ? state.candidates[exactIndex].id : Detector.stableId(key);
  candidate.label = Detector.displayLabel(candidate);

  const existingIndex = exactIndex >= 0 ? exactIndex : state.candidates.findIndex((item) => item.id === candidate.id);
  if (existingIndex >= 0) {
    const existing = state.candidates[existingIndex];
    candidate.firstSeen = existing.firstSeen;
    candidate.resolution ||= existing.resolution;
    candidate.bandwidth ||= existing.bandwidth;
    candidate.durationSeconds ||= existing.durationSeconds;
    candidate.container = rawCandidate.container || existing.container || candidate.container;
    candidate.parentUrl ||= existing.parentUrl;
    const originPriority = { network: 4, manifest: 3, dom: 2, performance: 1, unknown: 0 };
    if ((originPriority[existing.origin] || 0) > (originPriority[candidate.origin] || 0)) {
      candidate.origin = existing.origin;
    }
    candidate.contentLength ||= existing.contentLength;
    candidate.fileName ||= existing.fileName;
    candidate.score = Math.max(candidate.score, existing.score);
    candidate.label = Detector.displayLabel(candidate);
    state.candidates.splice(existingIndex, 1, candidate);
  } else {
    state.candidates.push(candidate);
  }

  state.candidates.sort((left, right) => right.score - left.score || right.lastSeen - left.lastSeen);
  state.candidates = state.candidates.slice(0, 60);
  state.updatedAt = Date.now();
  scheduleStateSave();
  await publishState(tabId);
  if (candidate.kind === "hls" && candidate.origin !== "manifest") {
    void expandHlsMaster(tabId, candidate, { pageUrl: state.pageUrl, title: state.title });
  }
  return true;
}

function hlsAttribute(line, name) {
  const match = String(line).match(new RegExp(`(?:^|,)${name}=((?:"[^"]*")|[^,]*)`, "i"));
  return match ? match[1].replace(/^"|"$/g, "") : "";
}

async function expandHlsMaster(tabId, candidate, pageMeta) {
  if (expandedHlsUrls.has(candidate.url)) return;
  expandedHlsUrls.add(candidate.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(candidate.url, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal
    });
    if (!response.ok) return;
    const declaredSize = Number.parseInt(response.headers?.get?.("content-length") || "0", 10);
    if (declaredSize > 1_000_000) return;
    const text = await response.text();
    if (!text.startsWith("#EXTM3U") || !text.includes("#EXT-X-STREAM-INF")) return;

    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      const attributes = line.slice(line.indexOf(":") + 1);
      let variantLine = "";
      for (let next = index + 1; next < lines.length; next += 1) {
        const possible = lines[next].trim();
        if (!possible || possible.startsWith("#")) continue;
        variantLine = possible;
        index = next;
        break;
      }
      if (!variantLine) continue;
      const dimensions = hlsAttribute(attributes, "RESOLUTION").match(/\d+x(\d+)/i);
      const bandwidth = hlsAttribute(attributes, "AVERAGE-BANDWIDTH") || hlsAttribute(attributes, "BANDWIDTH");
      await addCandidate(tabId, {
        url: new URL(variantLine, candidate.url).href,
        contentType: "application/vnd.apple.mpegurl",
        resolution: dimensions ? `${dimensions[1]}p` : "",
        bandwidth,
        durationSeconds: candidate.durationSeconds,
        parentUrl: candidate.url,
        requestType: "xmlhttprequest",
        origin: "manifest"
      }, pageMeta);
    }
  } catch (_error) {
    // Some signed/authenticated playlists cannot be fetched a second time.
  } finally {
    clearTimeout(timeout);
  }
}

async function noteSegmentContainer(tabId, url, contentType) {
  await stateReady;
  const extension = Detector.fileExtension(url);
  const normalizedType = Detector.normalizedContentType(contentType);
  let container = "";
  if (extension === "ts" || normalizedType === "video/mp2t") container = "TS";
  if (["m4s", "cmfv", "cmfa"].includes(extension) || normalizedType.includes("iso.segment")) container = "MP4";
  if (!container) return;
  const state = getTabState(tabId);
  let changed = false;
  for (const candidate of state.candidates) {
    if (candidate.kind !== "hls" && candidate.kind !== "dash") continue;
    if (candidate.container === container) continue;
    candidate.container = container;
    candidate.label = Detector.displayLabel(candidate);
    changed = true;
  }
  if (changed) {
    state.updatedAt = Date.now();
    scheduleStateSave();
    await publishState(tabId);
  }
}

function visibleCandidates(state, settings) {
  const filtered = state.candidates.filter((candidate) => settings.showAudio || candidate.kind !== "audio");
  const durationHints = filtered.filter((candidate) => candidate.durationSeconds);
  const roundedDurations = [...new Set(durationHints.map((candidate) => Math.round(candidate.durationSeconds)))];
  const commonDuration = roundedDurations.length === 1 ? roundedDurations[0] : null;

  const enriched = filtered.map((candidate) => {
    if (candidate.durationSeconds || !["network", "manifest"].includes(candidate.origin)) return candidate;
    const matchingHint = durationHints.find((hint) =>
      hint.resolution && candidate.resolution && hint.resolution === candidate.resolution
    );
    const durationSeconds = matchingHint?.durationSeconds || commonDuration;
    if (!durationSeconds) return candidate;
    const copy = { ...candidate, durationSeconds };
    copy.label = Detector.displayLabel(copy);
    return copy;
  });

  const confirmed = enriched.filter((candidate) => candidate.origin === "network");
  const seenPresentations = new Set();
  return enriched.filter((candidate) => {
    const unconfirmed = candidate.origin === "dom" || candidate.origin === "performance";
    if (unconfirmed && !settings.showUnconfirmedSources) {
      const confirmedEquivalent = confirmed.some((networkCandidate) => {
        const sameMediaClass = (networkCandidate.kind === "audio") === (candidate.kind === "audio");
        if (!sameMediaClass) return false;
        if (networkCandidate.resolution && candidate.resolution) {
          return networkCandidate.resolution === candidate.resolution;
        }
        return networkCandidate.container === candidate.container;
      });
      if (confirmedEquivalent) return false;
    }

    const durationBucket = candidate.durationSeconds ? Math.round(candidate.durationSeconds / 5) : 0;
    const bitrateBucket = candidate.bandwidth ? Math.round(candidate.bandwidth / 100_000) : 0;
    const presentation = [
      candidate.origin === "network" ? "confirmed" : candidate.origin,
      candidate.kind,
      candidate.container,
      candidate.resolution,
      durationBucket,
      bitrateBucket
    ].join("|");
    if (seenPresentations.has(presentation)) return false;
    seenPresentations.add(presentation);
    return true;
  });
}

async function publicState(tabId) {
  await stateReady;
  const settings = await getSettings();
  const state = getTabState(tabId);
  const candidates = visibleCandidates(state, settings);
  return {
    tabId,
    pageUrl: state.pageUrl,
    title: state.title,
    candidates,
    count: candidates.length,
    mediaElements: state.mediaElements,
    settings,
    pagePreferred: Detector.prefersPage(state.pageUrl)
  };
}

async function publishState(tabId) {
  const state = await publicState(tabId);
  const text = state.count ? String(Math.min(state.count, 99)) : "";
  await Promise.allSettled([
    browser.action.setBadgeText({ tabId, text }),
    browser.action.setBadgeBackgroundColor({ tabId, color: "#1c75bc" }),
    browser.tabs.sendMessage(tabId, { type: "JDVG_STATE", state })
  ]);
}

function cleanPackageName(value) {
  const cleaned = String(value || "Video").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "Video";
}

function outgoingUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return /^https?:$/i.test(parsed.protocol) ? parsed.href : null;
  } catch (_error) {
    return null;
  }
}

function titleFilename(title, target) {
  const base = cleanPackageName(title);
  let extension = target?.extension || "";
  if (target?.kind === "hls" || target?.kind === "dash" || extension === "m3u8" || extension === "mpd") extension = "mp4";
  if (!extension && target?.kind === "audio") extension = "m4a";
  if (!extension) extension = "mp4";
  return `${base}.${extension}`;
}

function addFilenameHint(url, title, target, settings) {
  if (!settings.usePageTitleFilename || !target || target.kind === "page") return url;
  try {
    const parsed = new URL(url);
    parsed.hash = `filename=${encodeURIComponent(titleFilename(title, target))}`;
    return parsed.href;
  } catch (_error) {
    return url;
  }
}

async function checkJDownloader(settingsOverride) {
  const settings = settingsOverride || await getSettings();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const response = await fetch(`${cleanEndpoint(settings.jdEndpoint)}/jdcheck.js?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal
    });
    const text = await response.text();
    return { connected: response.ok && /jdownloader\s*=\s*true|jdownloader/i.test(text) };
  } catch (error) {
    return { connected: false, error: error.name === "AbortError" ? "Connection timed out" : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendToJDownloader({ urls, pageUrl, title }) {
  const settings = await getSettings();
  const cleanedUrls = [...new Set((urls || []).map(outgoingUrl).filter(Boolean))];
  if (!cleanedUrls.length) throw new Error("No usable video URL was found.");

  const endpoint = cleanEndpoint(settings.jdEndpoint);
  const params = new URLSearchParams();
  params.set("urls", cleanedUrls.join("\r\n"));
  if (pageUrl) {
    params.set("source", pageUrl);
    params.set("referer", pageUrl);
  }
  params.set("package", cleanPackageName(title));
  if (settings.autoStart) params.set("autostart", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${endpoint}/flash/add`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString(),
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal
    });
    const responseText = (await response.text()).trim();
    if (!response.ok || /^failed$/i.test(responseText)) {
      throw new Error(`JDownloader rejected the link${responseText ? `: ${responseText}` : "."}`);
    }
    return { ok: true, response: responseText || "success" };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("JDownloader did not respond. Make sure JDownloader 2 is running.");
    }
    if (/fetch|network|connection/i.test(error.message)) {
      throw new Error("Could not reach JDownloader 2 at 127.0.0.1:9666.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendSelected(tabId, candidateId, explicitUrl) {
  const settings = await getSettings();
  const state = getTabState(tabId);
  const candidate = candidateId
    ? state.candidates.find((item) => item.id === candidateId)
    : null;
  const target = candidate || { kind: "video", url: explicitUrl };
  const url = addFilenameHint(explicitUrl || candidate?.url, state.title, target, settings);
  const result = await sendToJDownloader({ urls: [url], pageUrl: state.pageUrl, title: state.title });
  return { ...result, target };
}

async function sendBest(tabId) {
  const settings = await getSettings();
  const state = getTabState(tabId);
  const candidates = visibleCandidates(state, settings);
  const target = Detector.chooseBest(candidates, state.pageUrl, settings.mainAction);
  const url = addFilenameHint(target.url, state.title, target, settings);
  const result = await sendToJDownloader({ urls: [url], pageUrl: state.pageUrl, title: state.title });
  return { ...result, target };
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.statusCode >= 400) return;
    const contentType = Detector.headerValue(details.responseHeaders, "content-type");
    const contentDisposition = Detector.headerValue(details.responseHeaders, "content-disposition");
    void noteSegmentContainer(details.tabId, details.url, contentType);
    void addCandidate(details.tabId, {
      url: details.url,
      pageUrl: details.documentUrl || details.originUrl || "",
      contentType,
      contentLength: totalBytes(details.responseHeaders),
      fileName: filenameFromDisposition(contentDisposition),
      requestType: details.type,
      origin: "network"
    }, { pageUrl: details.documentUrl || details.originUrl || "" });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    await stateReady;
    const state = getTabState(tabId);
    if (changeInfo.url && state.pageUrl && changeInfo.url.split("#")[0] !== state.pageUrl.split("#")[0]) {
      state.candidates = [];
      state.mediaElements = 0;
    }
    if (changeInfo.url || tab.url) state.pageUrl = changeInfo.url || tab.url;
    if (tab.title) state.title = tab.title;
    state.updatedAt = Date.now();
    scheduleStateSave();
    await publishState(tabId);
  })();
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  scheduleStateSave();
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[SETTINGS_KEY]) settingsCache = null;
});

browser.runtime.onMessage.addListener((message, sender) => {
  return (async () => {
    await stateReady;
    const tabId = Number.isInteger(message.tabId) ? message.tabId : sender.tab?.id;

    switch (message.type) {
      case "JDVG_PAGE_SEEN": {
        if (!Number.isInteger(tabId)) return { ok: false };
        const state = getTabState(tabId);
        if (message.pageUrl) state.pageUrl = message.pageUrl;
        if (message.title) state.title = message.title;
        state.mediaElements = Math.max(state.mediaElements || 0, Number(message.mediaElements) || 0);
        state.updatedAt = Date.now();
        scheduleStateSave();
        return { ok: true, state: await publicState(tabId) };
      }
      case "JDVG_DOM_CANDIDATES": {
        if (!Number.isInteger(tabId)) return { ok: false };
        const items = Array.isArray(message.candidates) ? message.candidates.slice(0, 30) : [];
        for (const item of items) {
          await addCandidate(tabId, { ...item, origin: item.origin || "dom", pageUrl: message.pageUrl }, {
            pageUrl: message.pageUrl,
            title: message.title
          });
        }
        const state = getTabState(tabId);
        state.mediaElements = Math.max(state.mediaElements || 0, Number(message.mediaElements) || 0);
        return { ok: true, state: await publicState(tabId) };
      }
      case "JDVG_GET_STATE":
        return Number.isInteger(tabId) ? { ok: true, state: await publicState(tabId) } : { ok: false };
      case "JDVG_CLEAR": {
        if (!Number.isInteger(tabId)) return { ok: false };
        const state = getTabState(tabId);
        state.candidates = [];
        state.updatedAt = Date.now();
        scheduleStateSave();
        await publishState(tabId);
        return { ok: true, state: await publicState(tabId) };
      }
      case "JDVG_CHECK_JD":
        return { ok: true, ...(await checkJDownloader()) };
      case "JDVG_SEND_BEST":
        if (!Number.isInteger(tabId)) throw new Error("No active browser tab was found.");
        return await sendBest(tabId);
      case "JDVG_SEND_CANDIDATE":
        if (!Number.isInteger(tabId)) throw new Error("No active browser tab was found.");
        return await sendSelected(tabId, message.candidateId, message.url);
      case "JDVG_SEND_PAGE": {
        if (!Number.isInteger(tabId)) throw new Error("No active browser tab was found.");
        const state = getTabState(tabId);
        const result = await sendToJDownloader({ urls: [state.pageUrl], pageUrl: state.pageUrl, title: state.title });
        return { ...result, target: { kind: "page", url: state.pageUrl } };
      }
      case "JDVG_GET_SETTINGS":
        return { ok: true, settings: await getSettings() };
      case "JDVG_SAVE_SETTINGS": {
        const settings = sanitizeSettings(message.settings);
        await browser.storage.local.set({ [SETTINGS_KEY]: settings });
        settingsCache = settings;
        for (const existingTabId of tabStates.keys()) void publishState(existingTabId);
        return { ok: true, settings };
      }
      default:
        return { ok: false, error: "Unknown request" };
    }
  })().catch((error) => ({ ok: false, error: error.message || String(error) }));
});
