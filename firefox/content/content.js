"use strict";

(function startVideoOverlay() {
  // Firefox can leave an older content-script overlay attached while a
  // temporary add-on is being reloaded. Remove it before creating this
  // instance so the user never sees two bars stacked on the same player.
  for (const staleOverlay of document.querySelectorAll("[data-jdvg-overlay]")) {
    staleOverlay.remove();
  }

  const mediaBars = new Map();
  const dismissedMedia = new WeakSet();
  const pendingCandidates = new Map();
  let currentState = null;
  let scanQueued = false;
  let positionQueued = false;
  let candidateTimer = null;

  const MEDIA_URL_PATTERN = /(?:\.m3u8|\.mpd|\.(?:mp4|m4v|webm|mkv|mov|flv|avi|wmv|mp3|m4a|aac|ogg|opus|flac|wav))(?:$|[?#])/i;

  function absoluteMediaUrl(value) {
    if (!value || /^(?:blob|data|mediasource):/i.test(value)) return null;
    try {
      const parsed = new URL(value, document.baseURI);
      return /^https?:$/i.test(parsed.protocol) ? parsed.href : null;
    } catch (_error) {
      return null;
    }
  }

  function candidateFromUrl(value, type, origin, metadata = {}) {
    const url = absoluteMediaUrl(value);
    if (!url) return null;
    return {
      url,
      contentType: String(type || ""),
      requestType: origin === "dom" ? "media" : "other",
      origin,
      ...metadata
    };
  }

  function queueCandidate(candidate) {
    if (!candidate) return;
    pendingCandidates.set(candidate.url, candidate);
    clearTimeout(candidateTimer);
    candidateTimer = setTimeout(flushCandidates, 80);
  }

  async function flushCandidates() {
    if (!pendingCandidates.size) return;
    const candidates = [...pendingCandidates.values()];
    pendingCandidates.clear();
    try {
      const response = await browser.runtime.sendMessage({
        type: "JDVG_DOM_CANDIDATES",
        pageUrl: location.href,
        title: document.title,
        mediaElements: document.querySelectorAll("video, audio").length,
        candidates
      });
      if (response?.state) applyState(response.state);
    } catch (_error) {
      // The page can outlive the extension during development reloads.
    }
  }

  function collectElementCandidates(media) {
    const resolution = media instanceof HTMLVideoElement && media.videoHeight ? `${media.videoHeight}p` : "";
    const durationSeconds = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null;
    const metadata = { resolution, durationSeconds };
    queueCandidate(candidateFromUrl(media.currentSrc, media.getAttribute("type"), "dom", metadata));
    queueCandidate(candidateFromUrl(media.getAttribute("src"), media.getAttribute("type"), "dom", metadata));
    for (const source of media.querySelectorAll("source[src]")) {
      queueCandidate(candidateFromUrl(source.getAttribute("src"), source.getAttribute("type"), "dom", metadata));
    }
  }

  function hasMediaEvidence(media) {
    return Boolean(
      media.currentSrc ||
      media.getAttribute("src") ||
      media.querySelector("source[src]") ||
      media.readyState > 0
    );
  }

  function overlayStyles() {
    return `
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      .wrap {
        --bar-bg: linear-gradient(#339ddd 0%, #1881c7 48%, #0b6eaf 52%, #075f9e 100%);
        --bar-hover: linear-gradient(#51b5eb, #1788ce 50%, #0870b2 51%, #06598f);
        --bar-solid: #147ebb;
        --bar-solid-hover: #2494d1;
        --bar-border: #075f9e;
        --bar-top: #58b8ee;
        --bar-text: #fff;
        --accent: #7de047;
        --menu-bg: rgba(27, 32, 37, .98);
        --menu-border: #3c4650;
        --menu-text: #f5f7f9;
        --menu-muted: #c1c8cd;
        --menu-title: #a9d9f5;
        --menu-hover: #126fa9;
        --control-height: 31px;
        --toggle-width: 27px;
        position: relative;
        display: flex;
        width: max-content;
        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .48));
        font: 600 13px/1.15 "Segoe UI", Arial, sans-serif;
        color: #fff;
      }
      .wrap[data-theme="dark"] {
        --bar-bg: linear-gradient(#505961, #353d43 49%, #292f34 51%, #20262b);
        --bar-hover: linear-gradient(#68747d, #414b52 49%, #323a40 51%, #252b30);
        --bar-solid: #30383e; --bar-solid-hover: #465159; --bar-border: #161b1f; --bar-top: #76828b;
        --accent: #56b9ed; --menu-title: #8fd7fc; --menu-hover: #40515c;
      }
      .wrap[data-theme="green"] {
        --bar-bg: linear-gradient(#69b947, #439638 49%, #347f2f 51%, #287328);
        --bar-hover: linear-gradient(#83d45e, #50aa42 49%, #3c9135 51%, #2d7d2d);
        --bar-solid: #3f9235; --bar-solid-hover: #55a947; --bar-border: #205e24; --bar-top: #9cdd7e;
        --accent: #d9ff7c; --menu-title: #b8ef9f; --menu-hover: #367c31;
      }
      .wrap[data-theme="red"] {
        --bar-bg: linear-gradient(#dc5a55, #b53538 49%, #9d282d 51%, #8d2027);
        --bar-hover: linear-gradient(#ed7671, #ca4447 49%, #ad3035 51%, #97232a);
        --bar-solid: #b52f34; --bar-solid-hover: #cf4549; --bar-border: #741a21; --bar-top: #ff918b;
        --accent: #ffd05a; --menu-title: #ffaaa5; --menu-hover: #9f3034;
      }
      .wrap[data-theme="orange"] {
        --bar-bg: linear-gradient(#ed963d, #ce6a24 49%, #ba591a 51%, #a94c14);
        --bar-hover: linear-gradient(#f6aa59, #df7a31 49%, #c96520 51%, #b65417);
        --bar-solid: #c96822; --bar-solid-hover: #df7e32; --bar-border: #873b0f; --bar-top: #ffc078;
        --accent: #fff173; --menu-title: #ffc992; --menu-hover: #a9571e;
      }
      .wrap[data-theme="purple"] {
        --bar-bg: linear-gradient(#9b6cdb, #7649b9 49%, #653aa7 51%, #593096);
        --bar-hover: linear-gradient(#ae84e6, #875bc7 49%, #7047b4 51%, #6236a1);
        --bar-solid: #7045ad; --bar-solid-hover: #865bc1; --bar-border: #452277; --bar-top: #c7a2f3;
        --accent: #9cf05d; --menu-title: #d7bdff; --menu-hover: #6842a0;
      }
      .wrap[data-theme="light"] {
        --bar-bg: linear-gradient(#fff, #e7ebee 49%, #d8dee2 51%, #c8d0d5);
        --bar-hover: linear-gradient(#fff, #f1f4f6 49%, #e4e9ec 51%, #d4dce1);
        --bar-solid: #e2e7ea; --bar-solid-hover: #f2f5f6; --bar-border: #87939a; --bar-top: #fff;
        --bar-text: #182127; --accent: #228a35; --menu-bg: rgba(246, 248, 249, .99); --menu-border: #909aa0;
        --menu-text: #1d272d; --menu-muted: #58666e; --menu-title: #186994; --menu-hover: #cce9f8;
      }
      .wrap[data-size="compact"] { --control-height: 25px; --toggle-width: 22px; font-size: 11px; }
      .wrap[data-size="large"] { --control-height: 39px; --toggle-width: 33px; font-size: 15px; }
      button { font: inherit; }
      .main, .toggle, .close {
        min-height: var(--control-height);
        border: 1px solid var(--bar-border);
        border-top-color: var(--bar-top);
        background: var(--bar-bg);
        color: var(--bar-text);
        text-shadow: 0 1px 1px rgba(0, 0, 0, .65);
        cursor: pointer;
      }
      .main {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 5px 10px 5px 7px;
        border-radius: 4px 0 0 4px;
        white-space: nowrap;
      }
      .toggle {
        width: var(--toggle-width);
        padding: 0;
        border-left-color: rgba(255, 255, 255, .25);
        border-radius: 0;
      }
      .close {
        width: var(--toggle-width);
        padding: 0 0 2px;
        border-left-color: rgba(255, 255, 255, .25);
        border-radius: 0 4px 4px 0;
        font-size: 19px;
        font-weight: 400;
        line-height: 1;
      }
      .main:hover, .toggle:hover, .toggle[aria-expanded="true"], .close:hover {
        background: var(--bar-hover);
      }
      .wrap[data-design="flat"] .main, .wrap[data-design="flat"] .toggle,
      .wrap[data-design="flat"] .close { background: var(--bar-solid); border-top-color: var(--bar-border); }
      .wrap[data-design="flat"] .main:hover, .wrap[data-design="flat"] .toggle:hover, .wrap[data-design="flat"] .close:hover,
      .wrap[data-design="flat"] .toggle[aria-expanded="true"] { background: var(--bar-solid-hover); }
      .wrap[data-design="pill"] .main { border-radius: 999px 0 0 999px; padding-left: 9px; }
      .wrap[data-design="pill"] .close { border-radius: 0 999px 999px 0; padding: 0 3px 2px 0; }
      .main:active, .toggle:active, .close:active { transform: translateY(1px); }
      .main:disabled, .toggle:disabled, .close:disabled { cursor: wait; opacity: .78; }
      .icon {
        position: relative;
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 1px solid rgba(0, 0, 0, .55);
        border-radius: 3px;
        background: linear-gradient(135deg, #263746 0 48%, #111b23 49% 100%);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.16);
      }
      .icon::before {
        content: "";
        position: absolute;
        left: 7px;
        top: 3px;
        width: 5px;
        height: 9px;
        border-radius: 1px;
        background: var(--accent);
        box-shadow: 0 0 2px #000;
      }
      .icon::after {
        content: "";
        position: absolute;
        left: 4px;
        bottom: 3px;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid var(--accent);
        filter: drop-shadow(0 1px 0 #000);
      }
      .caret { font-size: 12px; transform: translateY(-1px); }
      .menu {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        width: min(370px, calc(100vw - 18px));
        max-height: min(360px, calc(100vh - 55px));
        overflow: auto;
        padding: 5px;
        border: 1px solid var(--menu-border);
        border-radius: 4px;
        background: var(--menu-bg);
        box-shadow: 0 5px 16px rgba(0,0,0,.58);
        color: var(--menu-text);
      }
      .menu[hidden] { display: none; }
      .menu-title {
        padding: 6px 8px 5px;
        color: var(--menu-title);
        font-size: 11px;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .choice {
        display: block;
        width: 100%;
        padding: 8px;
        border: 0;
        border-radius: 3px;
        background: transparent;
        color: var(--menu-text);
        text-align: left;
        cursor: pointer;
      }
      .choice:hover, .choice:focus-visible { background: var(--menu-hover); outline: 0; }
      .choice strong, .choice small { display: block; overflow: hidden; text-overflow: ellipsis; }
      .choice strong { white-space: nowrap; font-size: 12px; }
      .choice small { margin-top: 3px; color: var(--menu-muted); font-size: 10px; white-space: nowrap; }
      .choice:hover small { color: var(--bar-text); }
      .separator { height: 1px; margin: 4px 3px; background: #46515b; }
      .message { padding: 9px 8px; color: #cbd2d8; font-size: 11px; }
      .wrap[data-size="compact"] .main { gap: 4px; padding: 3px 7px 3px 4px; }
      .wrap[data-size="compact"] .icon { transform: scale(.78); margin: -2px; }
      .wrap[data-size="compact"] .menu { width: min(330px, calc(100vw - 18px)); }
      .wrap[data-size="large"] .main { gap: 9px; padding: 7px 13px 7px 9px; }
      .wrap[data-size="large"] .icon { transform: scale(1.16); margin: 2px; }
      .wrap[data-size="large"] .choice strong { font-size: 13px; }
      .wrap[data-size="large"] .choice small { font-size: 11px; }
    `;
  }

  function applyAppearance(bar) {
    const settings = currentState?.settings || {};
    bar.wrap.dataset.theme = settings.overlayTheme || "blue";
    bar.wrap.dataset.size = settings.overlaySize || "normal";
    bar.wrap.dataset.design = settings.overlayDesign || "classic";
  }

  function createBar(media) {
    const host = document.createElement("div");
    host.dataset.jdvgOverlay = "true";
    host.style.cssText = "position:fixed;z-index:2147483646;display:none;width:max-content;height:auto;pointer-events:auto;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = overlayStyles();

    const wrap = document.createElement("div");
    wrap.className = "wrap";

    const main = document.createElement("button");
    main.className = "main";
    main.type = "button";
    main.title = "Send the best detected video to JDownloader 2";

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Download this video";
    main.append(icon, label);

    const toggle = document.createElement("button");
    toggle.className = "toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Choose detected video");
    toggle.setAttribute("aria-expanded", "false");

    const caret = document.createElement("span");
    caret.className = "caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▼";
    toggle.appendChild(caret);

    const menu = document.createElement("div");
    menu.className = "menu";
    menu.hidden = true;

    const close = document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.setAttribute("aria-label", "Hide the download bar for this video");
    close.title = "Hide the download bar for this video";
    close.textContent = "×";

    wrap.append(main, toggle, close, menu);
    shadow.append(style, wrap);

    const bar = {
      media,
      host,
      wrap,
      main,
      label,
      toggle,
      close,
      menu,
      resetTimer: null
    };
    applyAppearance(bar);

    bar.main.addEventListener("click", () => sendFromBar(bar, { type: "JDVG_SEND_BEST" }));
    bar.toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!bar.menu.hidden) {
        bar.menu.hidden = true;
        bar.toggle.setAttribute("aria-expanded", "false");
        return;
      }
      closeAllMenus(bar);
      renderMenu(bar);
      bar.menu.hidden = false;
      bar.toggle.setAttribute("aria-expanded", "true");
    });
    bar.close.addEventListener("click", () => dismissBar(bar));
    shadow.addEventListener("click", (event) => event.stopPropagation());
    (document.documentElement || document).appendChild(host);
    mediaBars.set(media, bar);
    return bar;
  }

  function dismissBar(bar) {
    dismissedMedia.add(bar.media);
    clearTimeout(bar.resetTimer);
    bar.resizeObserver?.disconnect();
    bar.host.remove();
    mediaBars.delete(bar.media);
  }

  function closeAllMenus(except) {
    for (const bar of mediaBars.values()) {
      if (bar === except) continue;
      bar.menu.hidden = true;
      bar.toggle.setAttribute("aria-expanded", "false");
    }
  }

  function menuChoice(title, subtitle, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = subtitle;
    button.append(strong, small);
    button.addEventListener("click", onClick);
    return button;
  }

  function renderMenu(bar) {
    bar.menu.replaceChildren();
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "Detected video sources";
    bar.menu.appendChild(title);

    const candidates = currentState?.candidates || [];
    if (!candidates.length) {
      const message = document.createElement("div");
      message.className = "message";
      message.textContent = "No direct stream yet. Play the video, or let JDownloader analyze the page.";
      bar.menu.appendChild(message);
    } else {
      for (const candidate of candidates.slice(0, 12)) {
        const detail = candidate.fileName || candidate.url;
        bar.menu.appendChild(menuChoice(candidate.label, detail, () => {
          sendFromBar(bar, { type: "JDVG_SEND_CANDIDATE", candidateId: candidate.id });
        }));
      }
    }

    const separator = document.createElement("div");
    separator.className = "separator";
    bar.menu.appendChild(separator);
    bar.menu.appendChild(menuChoice(
      `${currentState?.pagePreferred ? "Auto quality · Analyze page (recommended)" : "Auto quality · Analyze this page"}`,
      location.href,
      () => sendFromBar(bar, { type: "JDVG_SEND_PAGE" })
    ));
  }

  async function sendFromBar(bar, message) {
    bar.menu.hidden = true;
    bar.toggle.setAttribute("aria-expanded", "false");
    bar.main.disabled = true;
    bar.toggle.disabled = true;
    setBarText(bar, "Sending…");
    collectElementCandidates(bar.media);
    await flushCandidates();
    try {
      const response = await browser.runtime.sendMessage(message);
      if (!response?.ok) throw new Error(response?.error || "JDownloader did not accept the link.");
      setBarText(bar, "Sent to JDownloader ✓");
    } catch (error) {
      setBarText(bar, "JDownloader not reached", error.message);
    } finally {
      bar.main.disabled = false;
      bar.toggle.disabled = false;
      clearTimeout(bar.resetTimer);
      bar.resetTimer = setTimeout(() => setBarText(bar, "Download this video"), 2600);
    }
  }

  function setBarText(bar, text, title) {
    bar.label.textContent = text;
    bar.main.title = title || "Send the best detected video to JDownloader 2";
  }

  function shouldShowBar(media) {
    if (!currentState?.settings?.enabled || !currentState.settings.showOverlay) return false;
    if (!media.isConnected || !hasMediaEvidence(media)) return false;
    const rect = media.getBoundingClientRect();
    const style = getComputedStyle(media);
    return rect.width >= 160 && rect.height >= 80 && style.display !== "none" && style.visibility !== "hidden";
  }

  function updateBarPosition(bar) {
    const { media, host } = bar;
    if (!shouldShowBar(media)) {
      host.style.display = "none";
      return;
    }
    const rect = media.getBoundingClientRect();
    const inset = 8;
    host.style.display = "block";
    const position = currentState?.settings?.overlayPosition || "top-right";
    const above = position.startsWith("above-");
    // Measure after showing and applying appearance: compact/large bars differ
    // in height. The absolute source menu does not affect the bar's height.
    const aboveTop = above ? rect.top - bar.wrap.getBoundingClientRect().height - 4 : 0;
    host.style.top = `${above && aboveTop >= inset ? aboveTop : Math.max(inset, rect.top + inset)}px`;
    if (position.endsWith("top-left")) {
      host.style.left = `${Math.max(inset, rect.left + inset)}px`;
      host.style.right = "auto";
    } else {
      const right = Math.max(inset, document.documentElement.clientWidth - rect.right + inset);
      host.style.right = `${right}px`;
      host.style.left = "auto";
    }
  }

  function updateAllPositions() {
    positionQueued = false;
    for (const [media, bar] of mediaBars.entries()) {
      if (!media.isConnected) {
        clearTimeout(bar.resetTimer);
        bar.host.remove();
        mediaBars.delete(media);
      } else {
        updateBarPosition(bar);
      }
    }
  }

  function queuePositionUpdate() {
    if (positionQueued) return;
    positionQueued = true;
    requestAnimationFrame(updateAllPositions);
  }

  function scan() {
    scanQueued = false;
    const mediaElements = document.querySelectorAll("video, audio");
    for (const media of mediaElements) {
      collectElementCandidates(media);
      if (!mediaBars.has(media) && !dismissedMedia.has(media)) {
        const bar = createBar(media);
        const refresh = () => {
          collectElementCandidates(media);
          queuePositionUpdate();
        };
        media.addEventListener("loadedmetadata", refresh);
        media.addEventListener("durationchange", refresh);
        media.addEventListener("play", refresh);
        media.addEventListener("emptied", refresh);
        if (typeof ResizeObserver === "function") {
          const resizeObserver = new ResizeObserver(queuePositionUpdate);
          resizeObserver.observe(media);
          bar.resizeObserver = resizeObserver;
        }
      }
    }
    void browser.runtime.sendMessage({
      type: "JDVG_PAGE_SEEN",
      pageUrl: location.href,
      title: document.title,
      mediaElements: mediaElements.length
    }).then((response) => {
      if (response?.state) applyState(response.state);
    }).catch(() => {});
    queuePositionUpdate();
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  function applyState(state) {
    currentState = state;
    for (const bar of mediaBars.values()) {
      applyAppearance(bar);
      if (!bar.menu.hidden) renderMenu(bar);
    }
    queuePositionUpdate();
  }

  function observePerformance() {
    const inspect = (entry) => {
      if (entry?.name && MEDIA_URL_PATTERN.test(entry.name)) {
        queueCandidate(candidateFromUrl(entry.name, "", "performance"));
      }
    };
    try {
      performance.getEntriesByType("resource").forEach(inspect);
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(inspect));
      observer.observe({ type: "resource", buffered: true });
    } catch (_error) {
      // Some restricted pages expose no resource timing information.
    }
  }

  function initialize() {
    const observer = new MutationObserver((records) => {
      const pageChanged = records.some((record) => {
        const target = record.target;
        return !(target instanceof Element && target.closest("[data-jdvg-overlay]"));
      });
      if (pageChanged) queueScan();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "type", "style", "class"]
    });
    window.addEventListener("scroll", queuePositionUpdate, { capture: true, passive: true });
    window.addEventListener("resize", queuePositionUpdate, { passive: true });
    document.addEventListener("fullscreenchange", queuePositionUpdate);
    document.addEventListener("click", () => closeAllMenus());
    observePerformance();
    queueScan();
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "JDVG_STATE" && message.state) applyState(message.state);
  });

  if (document.documentElement) initialize();
  else document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();
