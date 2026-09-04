# JD Video Grabber for Chrome and Brave

This Chromium package provides the same video detection, IDM-inspired download bar, source selection, duplicate filtering, page-title filename hints, appearance settings, and JDownloader 2 Click'n'Load handoff as the Firefox release. Each video bar has an **X** that hides only that video's bar until the page is refreshed.

## Install for testing

1. Extract `jd-video-grabber-chrome-brave-1.2.1.zip` to a permanent folder.
2. Start JDownloader 2.
3. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Open a normal, non-DRM video page and begin playback.

Chrome and Brave cannot load the ZIP directly through **Load unpacked**; extract it first. A Chrome Web Store release can be installed normally in both browsers.

## JDownloader

The default Click'n'Load endpoint is `http://127.0.0.1:9666`. Existing Packagizer rules used with the Firefox version can remain unchanged.

Settings provides three connection types: Local JDownloader, Direct server address, and MyJDownloader account.

For a direct server connection, enter a LAN, VPN, WAN, or public IP address or hostname. Bare addresses such as `192.168.1.50:9666` are accepted and normalized automatically. The remote computer must expose Click'n'Load and allow the connection through its firewall.

Remote mode is opt-in. A VPN or authenticated HTTPS reverse proxy is safer than exposing port 9666 directly to the public internet. Public HTTP sends submitted video URLs without transport encryption.

For MyJDownloader, sign in to the same MyJDownloader account inside the remote JDownloader application. Select **MyJDownloader account** in the extension, sign in, and choose the target device. This encrypted API route normally needs no open incoming port, router forwarding, public IP, or VPN. The password is not saved in extension settings; sign in again after restarting the browser.

## Limits

- DRM-protected streams are not supported.
- Expiring stream URLs may need to be sent while playback is active.
- Some authenticated media requires cookies or headers that Click'n'Load cannot transfer.
- Browser-extension service workers can be suspended between events; detected state is restored from extension session storage.
- The extension contains no analytics or remote code.
- MyJDownloader mode sends the account email and encrypted authentication messages to `https://api.jdownloader.org`, then sends the selected video URL and page title through that service to the chosen device. The password is not stored or sent directly.

MyJDownloader sessions renew automatically after an explicit session rejection. Sign in once after upgrading from v1.2.0-beta.1. Session tokens and the derived device key stay in session storage and are discarded on browser restart or Forget session. Passwords are not saved. Network failures are not automatically retried; check LinkGrabber before resending.

To place the download bar outside the video, select Above top-right or Above top-left in Settings and save. The bar sits four pixels above the video and falls back inside when there is insufficient space above it in the page or iframe.
