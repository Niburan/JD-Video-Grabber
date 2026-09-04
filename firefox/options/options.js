"use strict";

const fields = [
  "enabled", "showOverlay", "showAudio", "showUnconfirmedSources", "minimumFileSizeKB", "overlayPosition",
  "overlayTheme", "overlaySize", "overlayDesign", "mainAction", "autoStart", "usePageTitleFilename",
  "connectionMode", "jdEndpoint", "myjdEmail", "myjdDeviceId", "myjdDeviceName"
];
const form = document.querySelector("#settings-form");
const saveResult = document.querySelector("#save-result");
const testButton = document.querySelector("#test-connection");
const connectionResult = document.querySelector("#connection-result");
const preview = document.querySelector("#bar-preview");
const connectionMode = document.querySelector("#connectionMode");
const localPanel = document.querySelector("#local-connection-panel");
const directPanel = document.querySelector("#direct-connection-panel");
const myjdPanel = document.querySelector("#myjd-connection-panel");
const myjdPassword = document.querySelector("#myjdPassword");
const myjdConnect = document.querySelector("#myjd-connect");
const myjdDisconnect = document.querySelector("#myjd-disconnect");
const myjdDevice = document.querySelector("#myjdDeviceId");
const myjdDeviceName = document.querySelector("#myjdDeviceName");
const myjdResult = document.querySelector("#myjd-result");
let knownDevices = [];

function showResult(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}

function valuesFromForm() {
  const values = {};
  for (const id of fields) {
    const field = document.querySelector(`#${id}`);
    values[id] = field.type === "checkbox" ? field.checked : field.value;
  }
  values.minimumFileSizeKB = Number.parseInt(values.minimumFileSizeKB, 10);
  return values;
}

function renderDevices(devices, selectedId = "") {
  knownDevices = Array.isArray(devices) ? devices : [];
  myjdDevice.replaceChildren();
  if (!knownDevices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No connected devices found";
    myjdDevice.appendChild(option);
    myjdDevice.disabled = true;
    myjdDeviceName.value = "";
    return;
  }
  for (const device of knownDevices) {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = device.name || device.id;
    myjdDevice.appendChild(option);
  }
  myjdDevice.disabled = false;
  myjdDevice.value = knownDevices.some((device) => device.id === selectedId)
    ? selectedId
    : knownDevices[0].id;
  myjdDeviceName.value = knownDevices.find((device) => device.id === myjdDevice.value)?.name || "";
}

function populate(settings) {
  for (const id of fields) {
    const field = document.querySelector(`#${id}`);
    if (field.type === "checkbox") field.checked = settings[id] === true;
    else if (id !== "myjdDeviceId" || !knownDevices.length) field.value = settings[id] ?? "";
  }
  if (knownDevices.length) renderDevices(knownDevices, settings.myjdDeviceId);
  updateConnectionMode();
  updatePreview();
}

function updateConnectionMode() {
  const mode = connectionMode.value;
  localPanel.hidden = mode !== "local";
  directPanel.hidden = mode !== "direct";
  myjdPanel.hidden = mode !== "myjd";
  testButton.textContent = mode === "myjd" ? "Test selected MyJDownloader device" : "Test JDownloader connection";
}

function updatePreview() {
  preview.dataset.theme = document.querySelector("#overlayTheme").value;
  preview.dataset.size = document.querySelector("#overlaySize").value;
  preview.dataset.design = document.querySelector("#overlayDesign").value;
}

async function saveForm() {
  const response = await browser.runtime.sendMessage({ type: "JDVG_SAVE_SETTINGS", settings: valuesFromForm() });
  if (!response?.ok) throw new Error(response?.error || "Could not save settings.");
  populate(response.settings);
  return response.settings;
}

for (const id of ["overlayTheme", "overlaySize", "overlayDesign"]) {
  document.querySelector(`#${id}`).addEventListener("change", updatePreview);
}
connectionMode.addEventListener("change", updateConnectionMode);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveForm();
    showResult(saveResult, "Settings saved ✓");
    setTimeout(() => showResult(saveResult, ""), 2200);
  } catch (error) {
    showResult(saveResult, error.message || String(error), true);
  }
});

myjdConnect.addEventListener("click", async () => {
  myjdConnect.disabled = true;
  showResult(myjdResult, "Signing in securely…");
  try {
    connectionMode.value = "myjd";
    await saveForm();
    const response = await browser.runtime.sendMessage({
      type: "JDVG_MYJD_CONNECT",
      email: document.querySelector("#myjdEmail").value,
      password: myjdPassword.value
    });
    myjdPassword.value = "";
    if (!response?.ok) throw new Error(response?.error || "MyJDownloader sign-in failed.");
    renderDevices(response.devices, response.settings?.myjdDeviceId);
    if (response.settings) populate(response.settings);
    showResult(
      myjdResult,
      response.devices?.length
        ? `Connected to ${response.settings.myjdDeviceName} ✓`
        : "Account connected, but no JDownloader devices are currently online.",
      !response.devices?.length
    );
  } catch (error) {
    myjdPassword.value = "";
    showResult(myjdResult, error.message || String(error), true);
  } finally {
    myjdConnect.disabled = false;
  }
});

myjdDevice.addEventListener("change", async () => {
  const selected = knownDevices.find((device) => device.id === myjdDevice.value);
  myjdDeviceName.value = selected?.name || "";
  showResult(myjdResult, "Selecting device…");
  const response = await browser.runtime.sendMessage({
    type: "JDVG_MYJD_SELECT_DEVICE",
    deviceId: myjdDevice.value
  });
  if (!response?.ok) {
    showResult(myjdResult, response?.error || "Could not select that device.", true);
    return;
  }
  populate(response.settings);
  showResult(myjdResult, `Connected to ${response.settings.myjdDeviceName} ✓`);
});

myjdDisconnect.addEventListener("click", async () => {
  const response = await browser.runtime.sendMessage({ type: "JDVG_MYJD_DISCONNECT" });
  if (!response?.ok) {
    showResult(myjdResult, response?.error || "Could not forget the MyJDownloader session.", true);
    return;
  }
  knownDevices = [];
  renderDevices([], "");
  populate(response.settings);
  showResult(myjdResult, "MyJDownloader session forgotten.");
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  showResult(connectionResult, "Checking…");
  try {
    await saveForm();
    const response = await browser.runtime.sendMessage({ type: "JDVG_CHECK_JD" });
    if (!response?.connected) throw new Error(response?.error || "JDownloader was not found. Start it and try again.");
    const detail = response.mode === "myjd" && response.deviceName ? ` (${response.deviceName})` : "";
    showResult(connectionResult, `Connected to JDownloader 2${detail} ✓`);
  } catch (error) {
    showResult(connectionResult, error.message || String(error), true);
  } finally {
    testButton.disabled = false;
  }
});

(async () => {
  const response = await browser.runtime.sendMessage({ type: "JDVG_GET_SETTINGS" });
  if (!response?.settings) return;
  populate(response.settings);
  if (response.settings.connectionMode !== "myjd") return;
  showResult(myjdResult, "Checking saved session…");
  const status = await browser.runtime.sendMessage({ type: "JDVG_MYJD_STATUS" });
  if (!status?.ok || !status.connected) {
    renderDevices([], "");
    showResult(myjdResult, status?.error || "Sign in to start a MyJDownloader session.", true);
    return;
  }
  renderDevices(status.devices, status.settings?.myjdDeviceId);
  showResult(myjdResult, status.devices?.length ? "MyJDownloader session is active ✓" : "No JDownloader devices are online.", !status.devices?.length);
})().catch((error) => showResult(myjdResult, error.message || String(error), true));
