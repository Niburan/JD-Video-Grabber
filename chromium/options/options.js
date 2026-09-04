"use strict";

const fields = [
  "enabled", "showOverlay", "showAudio", "showUnconfirmedSources", "minimumFileSizeKB", "overlayPosition",
  "overlayTheme", "overlaySize", "overlayDesign", "mainAction", "autoStart", "usePageTitleFilename", "jdEndpoint"
];
const form = document.querySelector("#settings-form");
const saveResult = document.querySelector("#save-result");
const testButton = document.querySelector("#test-connection");
const connectionResult = document.querySelector("#connection-result");
const preview = document.querySelector("#bar-preview");

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
  updatePreview();
}

function updatePreview() {
  preview.dataset.theme = document.querySelector("#overlayTheme").value;
  preview.dataset.size = document.querySelector("#overlaySize").value;
  preview.dataset.design = document.querySelector("#overlayDesign").value;
}

for (const id of ["overlayTheme", "overlaySize", "overlayDesign"]) {
  document.querySelector(`#${id}`).addEventListener("change", updatePreview);
}

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
  await browser.runtime.sendMessage({ type: "JDVG_SAVE_SETTINGS", settings: valuesFromForm() });
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
