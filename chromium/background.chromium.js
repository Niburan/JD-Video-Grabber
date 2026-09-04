"use strict";

// Chromium Manifest V3 permits one classic service-worker entry point.
// Add Chromium's namespace only inside this package, then import the same
// detector and background implementation used by Firefox.
importScripts("lib/chromium-api.js", "lib/detector.js", "background.js");
