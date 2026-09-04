"use strict";

const fields = [
  "enabled", "showOverlay", "showAudio", "showUnconfirmedSources", "minimumFileSizeKB", "overlayPosition",
  "overlayTheme", "overlaySize", "overlayDesign", "mainAction", "autoStart", "usePageTitleFilename",
  "allowRemoteJDownloader", "jdEndpoint"
];
const form = document.querySelector("#settings-form");
const saveResult = document.querySelector("#save-result");
const testButton = document.querySelector("#test-connection");
const connectionResult = document.querySelector("#connection-result");
const preview = document.querySelector("#bar-preview");
const remoteToggle = document.querySelector("#allowRemoteJDownloader");
const endpointHelp = document.querySelector("#endpoint-help");

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

function populate(settings) {
  for (const id of fields) {
    const field = document.querySelector(`#${id}`);
    if (field.type === "checkbox") field.checked = settings[id] === true;
    else field.value = settings[id];
  }
  updateEndpointHelp();
  updatePreview();
}

function updateEndpointHelp() {
  endpointHelp.replaceChildren();
  if (remoteToggle.checked) {
    endpointHelp.textContent = "Accepts LAN, VPN, WAN, or public IP addresses and hostnames over HTTP or HTTPS. Include a port when your server requires one.";
  } else {
    endpointHelp.append("Local mode accepts only ");
    const loopback = document.createElement("code");
    loopback.textContent = "127.0.0.1:9666";
    endpointHelp.append(loopback, " or ");
    const localhost = document.createElement("code");
    localhost.textContent = "localhost:9666";
    endpointHelp.append(localhost, ".");
  }
}

function updatePreview() {
  preview.dataset.theme = document.querySelector("#overlayTheme").value;
  preview.dataset.size = document.querySelector("#overlaySize").value;
  preview.dataset.design = document.querySelector("#overlayDesign").value;
}

for (const id of ["overlayTheme", "overlaySize", "overlayDesign"]) {
  document.querySelector(`#${id}`).addEventListener("change", updatePreview);
}
remoteToggle.addEventListener("change", updateEndpointHelp);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await browser.runtime.sendMessage({ type: "JDVG_SAVE_SETTINGS", settings: valuesFromForm() });
  if (!response?.ok) {
    showResult(saveResult, response?.error || "Could not save settings.", true);
    return;
  }
  populate(response.settings);
  showResult(saveResult, "Settings saved ✓");
  setTimeout(() => showResult(saveResult, ""), 2200);
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  showResult(connectionResult, "Checking…");
  const saved = await browser.runtime.sendMessage({ type: "JDVG_SAVE_SETTINGS", settings: valuesFromForm() });
  if (!saved?.ok) {
    showResult(connectionResult, saved?.error || "Could not save the JDownloader address.", true);
    testButton.disabled = false;
    return;
  }
  populate(saved.settings);
  const response = await browser.runtime.sendMessage({ type: "JDVG_CHECK_JD" });
  showResult(
    connectionResult,
    response?.connected ? "Connected to JDownloader 2 ✓" : "JDownloader was not found. Start it and try again.",
    !response?.connected
  );
  testButton.disabled = false;
});

browser.runtime.sendMessage({ type: "JDVG_GET_SETTINGS" }).then((response) => {
  if (response?.settings) populate(response.settings);
});
