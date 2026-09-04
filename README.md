# JD Video Grabber

JD Video Grabber detects video streams in Firefox, Chrome, and Brave, places a compact download bar over the active player, and sends the selected source to JDownloader 2.

## Features

- Detects HLS (`.m3u8`), MPEG-DASH (`.mpd`), direct video/audio files, extensionless media responses, and page-declared video sources
- Filters tiny stream segments so JDownloader LinkGrabber is not flooded with fragments
- Shows available qualities, resolution, bitrate, and duration when the site exposes them
- Sends a smart default choice or a user-selected source to JDownloader 2
- Supports page-title package names and optional filename hints
- Includes dismissible IDM-style player bars with selectable themes, sizes, designs, and placement
- Connects through Local Click'n'Load, a direct server address, or the encrypted MyJDownloader API
- Keeps Firefox and Chromium browser-specific startup code separate

## Download

The current stable local-only packages are available from the [v1.0.4 release](https://github.com/Niburan/JD-Video-Grabber/releases/tag/v1.0.4).

- **Firefox:** `jd-video-grabber-1.0.4.zip` is the Mozilla submission/source package. Permanent installation in standard Firefox requires a Mozilla-signed XPI.
- **Chrome and Brave:** extract `jd-video-grabber-chrome-brave-1.0.4.zip`, enable Developer mode at `chrome://extensions` or `brave://extensions`, choose **Load unpacked**, and select the extracted folder.

### Server Access beta

[v1.2.0-beta.1](https://github.com/Niburan/JD-Video-Grabber/releases/tag/v1.2.0-beta.1) adds two optional ways to reach JDownloader running on another computer:

- **Direct server address** accepts LAN, VPN, WAN, public IP addresses, hostnames, and HTTPS reverse proxies.
- **MyJDownloader account** signs in through the official encrypted MyJDownloader API and sends to a selected device without opening an incoming port.

This is a prerelease intended for testing with real server configurations. It is **not Mozilla-signed**. Firefox testers can load the clearly labeled `UNSIGNED.xpi` temporarily through `about:debugging`, or extract the Firefox ZIP and select its `manifest.json`. Chrome and Brave testers should extract their ZIP and use **Load unpacked**.

JDownloader 2 must be running. Its Click'n'Load service normally listens at `http://127.0.0.1:9666`.

For direct testing, open Settings, choose **Direct server address**, enter the server address, and select **Test JDownloader connection**. Examples include `192.168.1.50:9666`, `100.80.20.10:9666`, or `https://downloads.example.com`.

The server must expose Click'n'Load and permit the connection through its firewall. A VPN or HTTPS is safer than exposing port 9666 directly to the public internet. Public HTTP sends submitted video URLs without transport encryption.

For MyJDownloader testing:

1. Sign in to a MyJDownloader account inside the remote JDownloader application.
2. Choose **MyJDownloader account** in the extension Settings.
3. Enter the account email and password and click **Sign in and find devices**.
4. Select the target online device and test the connection.

The password is used only to establish the encrypted session and is never saved in extension settings. Testers must sign in again after restarting the browser. MyJDownloader mode sends the selected video URL and page title through `https://api.jdownloader.org` to the chosen device.

## Screenshots

### In-video download bar

![JD Video Grabber download bar over a video](screenshots/video-download-bar.png)

### Extension toolbar panel

![JD Video Grabber toolbar panel](screenshots/toolbar-panel.png)

### Settings and appearance customization

![JD Video Grabber settings page](screenshots/settings.png)

## Repository layout

- [`firefox/`](firefox/) — exact extracted Firefox v1.2.0 beta package source
- [`chromium/`](chromium/) — exact extracted Chrome/Brave v1.2.0 beta package source

Each browser folder contains its own manifest and browser-specific runtime files. The two builds intentionally share functionality and appearance without requiring identical browser startup code.

## Important limits

- JD Video Grabber does not bypass DRM, encryption, access controls, or paywalls.
- Expiring stream URLs may need to be sent while playback is active.
- Some authenticated streams require cookies or request headers that Click'n'Load cannot transfer.
- JDownloader must support the selected site or media format.

Only URLs explicitly selected by the user are sent. Local and direct modes send them to the configured JDownloader endpoint. MyJDownloader mode sends the selected URL and page title through the official MyJDownloader API to the chosen device. The extension contains no analytics, remote code, or developer-operated relay service.

JD Video Grabber is an unofficial companion extension and is not affiliated with JDownloader, Internet Download Manager, Mozilla, Google, or Brave.

See the project's [Privacy Policy](PRIVACY.md) for the exact data handled by Local, Direct server, and MyJDownloader modes.

## License

[MIT](LICENSE)
