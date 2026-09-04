"use strict";

// Minimal MyJDownloader API client for JD Video Grabber.
// Uses only Web Crypto and fetch so the packaged extension remains readable,
// dependency-free, and reviewable by browser stores.
(function exposeMyJDownloader(global) {
  const API_BASE = "https://api.jdownloader.org";
  const APP_KEY = "jd_video_grabber";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToHex(bytes) {
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(value) {
    const text = String(value || "");
    if (!text || text.length % 2 || !/^[a-f\d]+$/i.test(text)) {
      throw new Error("MyJDownloader returned an invalid session token.");
    }
    const bytes = new Uint8Array(text.length / 2);
    for (let index = 0; index < text.length; index += 2) {
      bytes[index / 2] = Number.parseInt(text.slice(index, index + 2), 16);
    }
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || "").trim());
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function sha256(...parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const combined = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }
    return new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
  }

  async function createSecret(email, password, domain) {
    return sha256(encoder.encode(`${String(email).toLowerCase()}${password}${domain}`));
  }

  async function updateEncryptionToken(oldToken, sessionToken) {
    return sha256(oldToken, hexToBytes(sessionToken));
  }

  async function hmacHex(keyBytes, text) {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
    return bytesToHex(new Uint8Array(signature));
  }

  async function importAesKey(token, usage) {
    return crypto.subtle.importKey("raw", token.slice(16, 32), "AES-CBC", false, [usage]);
  }

  async function encrypt(token, text) {
    const key = await importAesKey(token, "encrypt");
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: token.slice(0, 16) },
      key,
      encoder.encode(text)
    );
    return bytesToBase64(new Uint8Array(encrypted));
  }

  async function decrypt(token, text) {
    const key = await importAesKey(token, "decrypt");
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: token.slice(0, 16) },
      key,
      base64ToBytes(text)
    );
    return decoder.decode(decrypted).replace(/\0+$/g, "");
  }

  function apiError(payload, response) {
    const type = payload?.type || payload?.data?.type;
    if (type === "AUTH_FAILED") return new Error("MyJDownloader rejected the email or password.");
    if (type === "EMAIL_INVALID") return new Error("Enter a valid MyJDownloader email address.");
    if (type === "ERROR_EMAIL_NOT_CONFIRMED") return new Error("Confirm the MyJDownloader account email before signing in.");
    if (type === "TOKEN_INVALID" || type === "SESSION") return new Error("The MyJDownloader session expired. Open Settings and sign in again.");
    if (type === "OFFLINE") return new Error("The selected JDownloader device is offline.");
    if (type === "TOO_MANY_REQUESTS") return new Error("MyJDownloader is receiving too many requests. Wait briefly and try again.");
    const detail = type || (typeof payload === "string" ? payload.slice(0, 160) : "");
    return new Error(`MyJDownloader request failed${detail ? `: ${detail}` : ` (HTTP ${response.status})`}.`);
  }

  class Client {
    constructor(options = {}) {
      this.apiBase = options.apiBase || API_BASE;
      this.appKey = options.appKey || APP_KEY;
      this.rid = 0;
      this.clearSession();
    }

    nextRid() {
      this.rid = Math.max(Date.now(), this.rid + 1);
      return this.rid;
    }

    clearSession() {
      this.email = "";
      this.sessionToken = "";
      this.regainToken = "";
      this.serverEncryptionToken = null;
      this.deviceEncryptionToken = null;
    }

    hasSession() {
      return Boolean(this.sessionToken && this.serverEncryptionToken && this.deviceEncryptionToken);
    }

    restoreSession(session) {
      if (!session?.sessionToken || !session?.serverEncryptionToken || !session?.deviceEncryptionToken) {
        this.clearSession();
        return false;
      }
      this.email = String(session.email || "").toLowerCase();
      this.sessionToken = String(session.sessionToken);
      this.regainToken = String(session.regainToken || "");
      this.serverEncryptionToken = hexToBytes(session.serverEncryptionToken);
      this.deviceEncryptionToken = hexToBytes(session.deviceEncryptionToken);
      return true;
    }

    exportSession() {
      if (!this.hasSession()) return null;
      return {
        email: this.email,
        sessionToken: this.sessionToken,
        regainToken: this.regainToken,
        serverEncryptionToken: bytesToHex(this.serverEncryptionToken),
        deviceEncryptionToken: bytesToHex(this.deviceEncryptionToken)
      };
    }

    async decodeResponse(response, key) {
      const body = await response.text();
      let payload = body;
      if (body) {
        try {
          payload = JSON.parse(await decrypt(key, body));
        } catch (_decryptError) {
          try { payload = JSON.parse(body); } catch (_jsonError) { /* keep text */ }
        }
      }
      if (!response.ok) throw apiError(payload, response);
      if (typeof payload === "string") {
        throw new Error("MyJDownloader returned an unreadable response.");
      }
      return payload;
    }

    async callServer(path, key, options = {}) {
      const separator = path.includes("?") ? "&" : "?";
      const signedPath = `${path}${separator}rid=${this.nextRid()}`;
      const signature = await hmacHex(key, signedPath);
      const response = await fetch(`${this.apiBase}${signedPath}&signature=${signature}`, {
        method: "POST",
        headers: { "Content-Type": "application/aesjson-jd; charset=utf-8" },
        cache: "no-store",
        credentials: "omit",
        signal: options.signal
      });
      return this.decodeResponse(response, key);
    }

    async connect(email, password, options = {}) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || !String(password || "")) {
        throw new Error("Enter the MyJDownloader email address and password.");
      }

      const loginSecret = await createSecret(normalizedEmail, password, "server");
      const deviceSecret = await createSecret(normalizedEmail, password, "device");
      const path = `/my/connect?email=${encodeURIComponent(normalizedEmail)}&appkey=${encodeURIComponent(this.appKey)}`;
      const result = await this.callServer(path, loginSecret, options);
      if (!result?.sessiontoken) throw new Error("MyJDownloader did not return a session token.");

      this.email = normalizedEmail;
      this.sessionToken = result.sessiontoken;
      this.regainToken = result.regaintoken || "";
      this.serverEncryptionToken = await updateEncryptionToken(loginSecret, this.sessionToken);
      this.deviceEncryptionToken = await updateEncryptionToken(deviceSecret, this.sessionToken);
      return result;
    }

    async listDevices(options = {}) {
      if (!this.hasSession()) throw new Error("Open Settings and sign in to MyJDownloader first.");
      const path = `/my/listdevices?sessiontoken=${encodeURIComponent(this.sessionToken)}`;
      const result = await this.callServer(path, this.serverEncryptionToken, options);
      return Array.isArray(result?.list) ? result.list : [];
    }

    async callDevice(deviceId, action, params = [], options = {}) {
      if (!this.hasSession()) throw new Error("Open Settings and sign in to MyJDownloader first.");
      if (!deviceId) throw new Error("Select a JDownloader device in Settings.");
      const request = {
        url: action,
        params,
        rid: this.nextRid(),
        apiVer: 1
      };
      const encrypted = await encrypt(this.deviceEncryptionToken, JSON.stringify(request));
      const path = `/t_${encodeURIComponent(this.sessionToken)}_${encodeURIComponent(deviceId)}${action}`;
      const response = await fetch(`${this.apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/aesjson-jd; charset=utf-8" },
        body: encrypted,
        cache: "no-store",
        credentials: "omit",
        signal: options.signal
      });
      return this.decodeResponse(response, this.deviceEncryptionToken);
    }

    async addLinks(deviceId, { urls, pageUrl, packageName, autostart }, options = {}) {
      const query = {
        links: [...new Set(urls || [])].join("\r\n"),
        packageName: packageName || "JD Video Grabber",
        sourceUrl: pageUrl || "",
        autostart: autostart === true,
        priority: "DEFAULT"
      };
      return this.callDevice(deviceId, "/linkgrabberv2/addLinks", [JSON.stringify(query)], options);
    }
  }

  global.JDMyJDownloader = Object.freeze({
    Client,
    API_BASE,
    APP_KEY,
    test: Object.freeze({
      createSecret,
      updateEncryptionToken,
      hmacHex,
      encrypt,
      decrypt,
      bytesToHex,
      hexToBytes
    })
  });
})(globalThis);
