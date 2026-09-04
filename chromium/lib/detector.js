(function attachDetector(root) {
  "use strict";

  const HLS_CONTENT_TYPES = new Set([
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/mpegurl",
    "audio/x-mpegurl"
  ]);
  const DASH_CONTENT_TYPES = new Set([
    "application/dash+xml"
  ]);
  const VIDEO_EXTENSIONS = new Set([
    "3gp", "avi", "flv", "m2ts", "m4v", "mkv", "mov", "mp4", "mpeg",
    "mpg", "ogv", "ts", "vob", "webm", "wmv"
  ]);
  const AUDIO_EXTENSIONS = new Set([
    "aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "wma"
  ]);
  const SEGMENT_EXTENSIONS = new Set([
    "cmfa", "cmfv", "m4s"
  ]);
  const PAGE_PREFERRED_HOSTS = [
    "youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "twitch.tv",
    "facebook.com", "fb.watch", "instagram.com", "tiktok.com", "twitter.com",
    "x.com", "reddit.com"
  ];

  function safeUrl(value, base) {
    if (!value || typeof value !== "string") return null;
    if (/^(?:blob|data|mediasource):/i.test(value)) return null;
    try {
      const url = new URL(value, base);
      if (!/^https?:$/i.test(url.protocol)) return null;
      url.hash = "";
      return url;
    } catch (_error) {
      return null;
    }
  }

  function headerValue(headers, name) {
    const target = String(name).toLowerCase();
    const match = (headers || []).find((header) =>
      String(header.name || "").toLowerCase() === target
    );
    return match ? String(match.value || "").trim() : "";
  }

  function normalizedContentType(value) {
    return String(value || "").split(";", 1)[0].trim().toLowerCase();
  }

  function fileExtension(url) {
    const parsed = safeUrl(url);
    if (!parsed) return "";
    const name = parsed.pathname.split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  }

  function parseBytes(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function parseDuration(value) {
    const parsed = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function inferContainer(kind, extension, contentType, explicit) {
    if (explicit) return String(explicit).toUpperCase();
    const byType = {
      "video/mp4": "MP4",
      "audio/mp4": "M4A",
      "video/webm": "WEBM",
      "audio/webm": "WEBM",
      "video/mp2t": "TS",
      "video/quicktime": "MOV",
      "video/x-matroska": "MKV",
      "audio/mpeg": "MP3",
      "audio/ogg": "OGG",
      "audio/flac": "FLAC"
    };
    if (byType[contentType]) return byType[contentType];
    if (extension && extension !== "m3u8" && extension !== "mpd") return extension.toUpperCase();
    if (kind === "dash") return "DASH";
    if (kind === "hls") return "HLS";
    return kind === "audio" ? "Audio" : "Video";
  }

  function looksLikeSegment(url, requestType, contentLength) {
    const ext = fileExtension(url);
    if (SEGMENT_EXTENSIONS.has(ext)) return true;
    if (ext === "ts") {
      return requestType !== "media" || !contentLength || contentLength < 5_000_000;
    }
    const parsed = safeUrl(url);
    if (!parsed) return false;
    const path = parsed.pathname.toLowerCase();
    return /(?:^|[/_.-])(?:seg(?:ment)?|frag(?:ment)?|chunk|part)[-_]?\d+/.test(path);
  }

  function detectResolution(value) {
    const text = decodeURIComponent(String(value || ""));
    const explicit = text.match(/(?:^|[^\d])(2160|1440|1080|900|720|576|540|480|360|240|144)p(?:[^\d]|$)/i);
    if (explicit) return `${explicit[1]}p`;

    const dimensions = text.match(/(?:^|[^\d])(3840x2160|2560x1440|1920x1080|1600x900|1280x720|960x540|854x480|640x360|426x240)(?:[^\d]|$)/i);
    if (dimensions) return `${dimensions[1].split("x")[1]}p`;

    try {
      const parsed = safeUrl(value);
      if (!parsed) return "";
      const height = parsed.searchParams.get("height") || parsed.searchParams.get("h");
      if (height && /^\d{3,4}$/.test(height)) return `${height}p`;
      const quality = parsed.searchParams.get("quality") || parsed.searchParams.get("res");
      if (quality && /\d{3,4}p/i.test(quality)) return quality.toLowerCase();
    } catch (_error) {
      // The URL has already been validated, but malformed query escapes should not break detection.
    }
    return "";
  }

  function classify(input) {
    const url = safeUrl(input.url, input.pageUrl);
    if (!url) return null;

    const contentType = normalizedContentType(input.contentType);
    const extension = fileExtension(url.href);
    const requestType = String(input.requestType || "").toLowerCase();
    const contentLength = parseBytes(input.contentLength);

    let kind = "";
    if (extension === "m3u8" || HLS_CONTENT_TYPES.has(contentType)) {
      kind = "hls";
    } else if (extension === "mpd" || DASH_CONTENT_TYPES.has(contentType)) {
      kind = "dash";
    } else if (contentType.startsWith("video/")) {
      kind = "video";
    } else if (contentType.startsWith("audio/")) {
      kind = "audio";
    } else if (VIDEO_EXTENSIONS.has(extension)) {
      kind = "video";
    } else if (AUDIO_EXTENSIONS.has(extension)) {
      kind = "audio";
    } else if (requestType === "media" && contentLength && contentLength >= 524_288) {
      kind = "video";
    } else {
      return null;
    }

    if ((kind === "video" || kind === "audio") && looksLikeSegment(url.href, requestType, contentLength)) {
      return null;
    }

    const resolution = input.resolution || detectResolution(url.href);
    const bandwidth = parseBytes(input.bandwidth);
    const durationSeconds = parseDuration(input.durationSeconds);
    const container = inferContainer(kind, extension, contentType, input.container);
    let score = { hls: 100, dash: 98, video: 80, audio: 45 }[kind];
    if (resolution) score += Math.min(Number.parseInt(resolution, 10) / 240, 10);
    if (contentLength) score += Math.min(contentLength / 25_000_000, 8);
    if (bandwidth) score += Math.min(bandwidth / 2_000_000, 6);
    if (input.origin === "network") score += 3;

    return {
      url: url.href,
      kind,
      contentType,
      contentLength,
      bandwidth,
      durationSeconds,
      container,
      extension,
      resolution,
      origin: input.origin || "unknown",
      requestType,
      score,
      firstSeen: input.firstSeen || Date.now(),
      lastSeen: Date.now()
    };
  }

  function fingerprint(candidate) {
    const parsed = safeUrl(candidate.url);
    if (!parsed) return "";
    return [candidate.kind, parsed.origin, parsed.pathname, candidate.resolution || ""].join("|");
  }

  function stableId(value) {
    let hash = 0x811c9dc5;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `media-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function hostname(url) {
    const parsed = safeUrl(url);
    return parsed ? parsed.hostname.replace(/^www\./, "") : "unknown host";
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
  }

  function formatBitrate(bitsPerSecond) {
    if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return "";
    return `${(bitsPerSecond / 1_000_000).toFixed(bitsPerSecond >= 10_000_000 ? 0 : 1)} Mbps`;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    let remaining = Math.round(seconds);
    const hours = Math.floor(remaining / 3600);
    remaining -= hours * 3600;
    const minutes = Math.floor(remaining / 60);
    const secs = remaining - minutes * 60;
    const parts = [];
    if (hours) parts.push(`${hours} hr`);
    if (minutes) parts.push(`${minutes} min`);
    if (secs || !parts.length) parts.push(`${secs} sec`);
    return parts.join(" ");
  }

  function qualityLabel(resolution) {
    if (!resolution) return "";
    const height = Number.parseInt(resolution, 10);
    if (height >= 2160) return `${resolution} 4K`;
    if (height >= 1440) return `${resolution} QHD`;
    if (height >= 1080) return `${resolution} Full HD`;
    if (height >= 720) return `${resolution} HD`;
    return resolution;
  }

  function displayLabel(candidate) {
    const knownFileContainer = candidate.container && !["HLS", "DASH", "VIDEO", "AUDIO"].includes(candidate.container);
    const type = knownFileContainer
      ? `${candidate.container} file`
      : { hls: "HLS stream", dash: "DASH stream", video: "Video file", audio: "Audio file", page: "Web page" }[candidate.kind] || "Media";
    const duration = formatDuration(candidate.durationSeconds);
    const quality = candidate.resolution
      ? `quality ${qualityLabel(candidate.resolution)}`
      : candidate.kind === "hls" || candidate.kind === "dash" ? "auto quality" : "quality unknown";
    const calculatedBitrate = candidate.bandwidth || (
      candidate.contentLength && candidate.durationSeconds
        ? Math.round((candidate.contentLength * 8) / candidate.durationSeconds)
        : null
    );
    const bitrate = calculatedBitrate ? `${Math.round(calculatedBitrate / 1000)} kbps` : "";
    return [type, duration, quality, bitrate].filter(Boolean).join(", ");
  }

  function prefersPage(pageUrl) {
    const parsed = safeUrl(pageUrl);
    if (!parsed) return false;
    return PAGE_PREFERRED_HOSTS.some((host) =>
      parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  }

  function chooseBest(candidates, pageUrl, mainAction) {
    const action = mainAction || "smart";
    if (action === "page") return { kind: "page", url: pageUrl };
    if (action === "smart" && prefersPage(pageUrl)) return { kind: "page", url: pageUrl };
    const reliability = { network: 25, manifest: 20, dom: 0, performance: -3, unknown: -5 };
    const usable = (candidates || []).filter((candidate) => candidate.kind !== "audio");
    const best = usable.sort((left, right) =>
      (right.score + (reliability[right.origin] ?? -5)) -
      (left.score + (reliability[left.origin] ?? -5))
    )[0];
    if (best) return best;
    return { kind: "page", url: pageUrl };
  }

  root.JDDetector = {
    classify,
    chooseBest,
    detectResolution,
    displayLabel,
    fileExtension,
    fingerprint,
    formatBitrate,
    formatDuration,
    formatBytes,
    headerValue,
    normalizedContentType,
    qualityLabel,
    prefersPage,
    safeUrl,
    stableId
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
