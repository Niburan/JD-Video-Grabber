"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
globalThis.crypto ||= crypto.webcrypto;
require(process.env.JDVG_CLIENT_PATH || "../lib/myjdownloader.js");
const { Client } = globalThis.JDMyJDownloader;
const hash = (...parts) => crypto.createHash("sha256").update(Buffer.concat(parts)).digest();
const secret = (domain) => hash(Buffer.from(`tester@example.compassword${domain}`));
const rotate = (key, token) => hash(key, Buffer.from(token, "hex"));
function encrypted(key, data) {
  const cipher = crypto.createCipheriv("aes-128-cbc", key.subarray(16), key.subarray(0, 16));
  return Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]).toString("base64");
}
function decrypted(key, data) {
  const cipher = crypto.createDecipheriv("aes-128-cbc", key.subarray(16), key.subarray(0, 16));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, "base64")), cipher.final()]).toString());
}
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 403, text: async () => body });

(async () => {
  let token = "11".repeat(32), regain = "22".repeat(32);
  let serverKey = rotate(secret("server"), token);
  let deviceKey = rotate(secret("device"), token);
  let expired = false, reconnects = 0, accepted = 0, attempts = 0, lastRid = 0;
  let failure = null, reconnectFailure = false, pauseReconnect = null;
  const requestLog = [];
  globalThis.fetch = async (url, options) => {
    const address = new URL(url);
    requestLog.push(address.pathname);
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const isDevice = address.pathname.startsWith("/t_");
    if (!isDevice) {
      const rid = Number(address.searchParams.get("rid"));
      assert.ok(rid > lastRid, "server request IDs increase on the wire");
      lastRid = rid;
      const signedPath = `${address.pathname}${address.search}`.split("&signature=")[0];
      const key = address.pathname === "/my/connect" ? secret("server") : serverKey;
      assert.equal(address.searchParams.get("signature"), crypto.createHmac("sha256", key).update(signedPath).digest("hex"));
    }
    if (address.pathname === "/my/connect") {
      return response(encrypted(secret("server"), { sessiontoken: token, regaintoken: regain }));
    }
    if (address.pathname === "/my/reconnect") {
      reconnects++;
      assert.equal(address.searchParams.get("sessiontoken"), token);
      assert.equal(address.searchParams.get("regaintoken"), regain);
      if (pauseReconnect) await pauseReconnect();
      if (reconnectFailure) return response(JSON.stringify({ src: "MYJD", type: "TOKEN_INVALID" }), false);
      const oldKey = serverKey;
      token = (33 + reconnects).toString(16).repeat(32);
      regain = (66 + reconnects).toString(16).repeat(32);
      serverKey = rotate(oldKey, token);
      deviceKey = rotate(secret("device"), token);
      expired = false;
      return response(encrypted(oldKey, { sessiontoken: token, regaintoken: regain }));
    }
    if (failure === "network") throw new TypeError("Failed to fetch");
    if (failure === "device") return response(JSON.stringify({ src: "DEVICE", type: "SESSION" }), false);
    if (expired || failure === "always-expired") return response(JSON.stringify({ src: "MYJD", type: "TOKEN_INVALID" }), false);
    if (address.pathname === "/my/listdevices") {
      assert.equal(address.searchParams.get("sessiontoken"), token);
      return response(encrypted(serverKey, { list: [{ id: "server", name: "Server" }] }));
    }
    if (isDevice) {
      attempts++;
      assert.ok(address.pathname.startsWith(`/t_${token}_server/`));
      const request = decrypted(deviceKey, options.body);
      assert.ok(request.rid > lastRid);
      lastRid = request.rid;
      accepted++;
      if (failure === "lost-response") throw new TypeError("Response lost after acceptance");
      return response(encrypted(deviceKey, { data: { id: accepted } }));
    }
    throw new Error("Unexpected route");
  };
  let saved;
  let client = new Client({ onSessionChanged: async () => { saved = client.exportSession(); } });
  await client.connect("tester@example.com", "password");
  assert.equal(saved.deviceSecret, secret("device").toString("hex"));
  assert.equal(saved.password, undefined);
  assert.equal(saved.loginSecret, undefined);

  expired = true;
  await Promise.all([client.listDevices(), client.listDevices(), client.addLinks("server", { urls: ["https://example.test/video.mp4"] })]);
  assert.equal(reconnects, 1, "concurrent calls share one renewal");
  assert.equal(accepted, 1);
  assert.equal(saved.sessionToken, token);
  assert.equal(saved.regainToken, regain);

  // Simulate background suspension: the restored client renews again using the
  // rotated server token, retained device secret, and persisted request ID.
  client = new Client({ onSessionChanged: async () => { saved = client.exportSession(); } });
  client.restoreSession(saved);
  expired = true;
  await client.addLinks("server", { urls: ["https://example.test/second.mp4"] });
  assert.equal(reconnects, 2);
  assert.equal(accepted, 2);

  for (const mode of ["network", "device", "lost-response"]) {
    failure = mode;
    const before = requestLog.length;
    await assert.rejects(client.addLinks("server", { urls: [] }));
    assert.equal(requestLog.length, before + 1, `${mode} must not retry`);
    assert.equal(reconnects, 2);
  }
  failure = "always-expired";
  await assert.rejects(client.listDevices(), /could not be renewed/);
  assert.equal(reconnects, 3, "second rejection stops instead of looping");
  failure = null;
  expired = true;
  reconnectFailure = true;
  await assert.rejects(client.listDevices(), /could not be renewed/);
  assert.equal(reconnects, 4);
  reconnectFailure = false;

  const legacy = { ...saved };
  delete legacy.deviceSecret;
  const oldClient = new Client();
  oldClient.restoreSession(legacy);
  await assert.rejects(oldClient.listDevices(), /Sign in once/);
  assert.equal(reconnects, 4, "old beta sessions require one new sign-in");

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.listDevices({ signal: controller.signal }), /Aborted/);
  assert.equal(reconnects, 4);

  let reached, release;
  const started = new Promise(resolve => { reached = resolve; });
  pauseReconnect = () => { reached(); return new Promise(resolve => { release = resolve; }); };
  const pending = client.listDevices();
  await started;
  client.clearSession();
  release();
  await assert.rejects(pending);
  assert.equal(client.exportSession(), null, "late renewal cannot undo Forget session");
  assert.equal(client.deviceSecret, null);
  console.log("MyJDownloader renewal, suspension, concurrency, and retry-safety tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
