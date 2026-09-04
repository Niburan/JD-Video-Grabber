# JD Video Grabber for Chrome and Brave

This Chromium package provides the same video detection, IDM-inspired download bar, source selection, duplicate filtering, page-title filename hints, appearance settings, and JDownloader 2 Click'n'Load handoff as the Firefox release. Each video bar has an **X** that hides only that video's bar until the page is refreshed.

## Install for testing

1. Extract `jd-video-grabber-chrome-brave-1.1.0.zip` to a permanent folder.
2. Start JDownloader 2.
3. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Open a normal, non-DRM video page and begin playback.

Chrome and Brave cannot load the ZIP directly through **Load unpacked**; extract it first. A Chrome Web Store release can be installed normally in both browsers.

## JDownloader

The default Click'n'Load endpoint is `http://127.0.0.1:9666`. Existing Packagizer rules used with the Firefox version can remain unchanged.

To use JDownloader on another computer, open Settings, enable **Connect to JDownloader on another computer**, and enter a LAN, VPN, WAN, or public IP address or hostname. Bare addresses such as `192.168.1.50:9666` are accepted and normalized automatically. The remote computer must expose Click'n'Load and allow the connection through its firewall.

Remote mode is opt-in. A VPN or authenticated HTTPS reverse proxy is safer than exposing port 9666 directly to the public internet. Public HTTP sends submitted video URLs without transport encryption.

## Limits

- DRM-protected streams are not supported.
- Expiring stream URLs may need to be sent while playback is active.
- Some authenticated media requires cookies or headers that Click'n'Load cannot transfer.
- Browser-extension service workers can be suspended between events; detected state is restored from extension session storage.
- The extension contains no analytics or remote code.
