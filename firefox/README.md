# JD Video Grabber for Firefox

JD Video Grabber watches video activity in Firefox, puts an IDM-inspired **Download this video** bar over detected players, and sends the chosen source to JDownloader 2.

## What this first build detects

- HLS manifests (`.m3u8` and HLS response content types)
- HLS master-playlist variants, including advertised resolution and bitrate
- MPEG-DASH manifests (`.mpd`)
- Direct video and optional audio files
- Extensionless media responses identified by their HTTP content type
- Video URLs exposed by `<video>` / `<source>` elements and the browser resource timeline
- Pages that use `blob:` / MediaSource playback, using the page URL as a JDownloader fallback
- Local Click'n'Load, direct server addresses, and encrypted MyJDownloader account connections

Detection is deliberately layered because no single Firefox API sees every player. Tiny HLS/DASH segments are filtered out so LinkGrabber is not flooded with hundreds of fragments.

Network-confirmed CDN links are preferred over page-declared `<video>` sources. When both describe the same quality, the unconfirmed page source is hidden and its duration is reused only as display metadata. This avoids repeated player URLs that look valid but cannot be resolved by JDownloader. Enable **Show unconfirmed page-source alternatives** only when troubleshooting a site.

## Customize the video bar

Click the gear icon in the extension popup to open Settings. The video overlay has a live preview and supports:

- IDM blue, graphite, JDownloader green, ruby, orange, purple, and silver themes
- Compact, normal, and large sizes
- Classic gradient, flat, and rounded-pill designs
- Top-left or top-right placement

The **X** button closes the toolbar popup immediately. Clicking outside the popup continues to work normally.

Each in-page video bar also has its own **X** button. It hides only that video's bar for the rest of the current page visit, so unwanted bars can be dismissed without disabling video detection elsewhere. Refresh the page to show a dismissed bar again.

When a temporary build is reloaded on an already-open video page, the new content script removes any stale overlay left by the previous build so the bars do not stack. Refreshing the page is no longer required to clear the old bar.

Selectable sources use IDM-style descriptions when metadata is available, for example:

`MP4 file, 38 min 6 sec, quality 720p HD, 1394 kbps`

Duration comes from the active player, while HLS resolution and bitrate come from the master playlist. Unknown fields are labeled honestly instead of being guessed.

## Install the development build

1. Start **JDownloader 2**.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select this folder's `manifest.json` file.
5. Open a page containing a normal, non-DRM video and begin playback.

Temporary extensions remain installed until Firefox restarts. A permanently installable release must be signed through Mozilla Add-ons.

## Choose how to reach JDownloader

JDownloader normally exposes Click'n'Load at `http://127.0.0.1:9666`. Open the extension toolbar panel or its Settings page and use **Test JDownloader connection**.

The Settings page offers three connection types:

- **Local JDownloader** — uses Click'n'Load on this computer at `127.0.0.1:9666`.
- **Direct server address** — connects to Click'n'Load on another computer by LAN, VPN, WAN, hostname, or public IP address.
- **MyJDownloader account** — uses the official encrypted MyJDownloader API and a selected device attached to the account.

For a direct server connection, the address can be entered with or without the `http://` prefix. Examples:

- `192.168.1.50:9666`
- `100.80.20.10:9666`
- `http://203.0.113.50:9666`
- `https://downloads.example.com`

The remote computer must expose its Click'n'Load service at that address and allow the connection through its firewall. Remote mode is deliberately opt-in. Avoid exposing port 9666 directly to the public internet; a VPN or an authenticated HTTPS reverse proxy is safer. Public HTTP sends the submitted video URLs without transport encryption.

For MyJDownloader, first sign in to the same account inside the remote JDownloader application. Then select **MyJDownloader account** in the extension, enter the account email and password, choose an online device, and test the connection. This route normally requires no incoming port, router forwarding, public IP, or VPN. The password is used only to derive the encrypted API session and is not saved in extension settings. The temporary session ends when the browser is restarted.

When the first link is sent, JDownloader may ask whether to allow an external application to add links. Accept that prompt. By default, links go to **LinkGrabber**. Settings can instead start them immediately.

## How the main button chooses

The default **Smart choice** sends the best detected HLS, DASH, or direct-video source on ordinary sites. On sites such as YouTube, Vimeo, TikTok, Reddit, and Twitch, it sends the page URL so JDownloader's site-specific extractor can choose the correct audio/video combination. The arrow beside the bar always lets you override that choice.

## Rename downloads to the web-page title

The extension always sets the JDownloader **package name** to the cleaned web-page title. JDownloader's Click'n'Load interface does not provide a direct filename field, so the extension also adds a safe `#filename=Page Title.mp4` hint to direct media links. Apply this one-time Packagizer rule to turn that hint into the downloaded filename:

1. Open **JDownloader → Settings → Packagizer** and click **Add**.
2. Name the rule `JD Video Grabber – Page Title`.
3. Under **If**, enable **File Name** and enter `*#filename=*`.
4. Under **Then set**, enable **Filename** and enter `<jd:orgfilename:2>`.
5. Leave **Download Link(s)** enabled and save the rule.

This is the anchor-based filename rule documented by JDownloader. It affects only links containing the `#filename=` hint. You can disable **Add the page title as a filename hint** in the extension settings at any time.

## Limits

- DRM-protected streams cannot be downloaded. The extension does not bypass encryption, access controls, or paywalls.
- Expiring stream URLs may need to be sent while playback is active.
- Some authenticated streams require cookies or request headers that Click'n'Load cannot transfer. A future native companion could securely hand those headers to a local resolver.
- Players inside a closed Shadow DOM may be detected by network activity but may not allow a bar to be positioned directly over the hidden `<video>` element. The toolbar panel still lists the stream.
- JDownloader must support the site or media format it receives.

Only URLs selected by the user are sent. Local and direct modes send them only to the user-configured JDownloader endpoint. MyJDownloader mode sends the account email and encrypted authentication messages to `https://api.jdownloader.org`, then sends the selected URL and page title through that service to the chosen device. The password is not stored or sent directly. The extension contains no analytics, remote code, or developer-operated relay service.

## Developer commands

```bash
npm test
npm run build
```

The build command creates `dist/jd-video-grabber-1.2.0.zip` and an identical unsigned `.xpi` for temporary installation/testing.
