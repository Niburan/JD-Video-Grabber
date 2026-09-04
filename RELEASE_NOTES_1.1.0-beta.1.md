# JD Video Grabber v1.1.0-beta.1 — Remote Server Access

This prerelease needs testing by people who run JDownloader 2 on another computer or server.

## What changed

- Added an opt-in **Connect to JDownloader on another computer** setting.
- Accepts LAN, VPN, WAN, and public IP addresses or hostnames.
- Bare entries such as `192.168.1.50:9666` are converted to HTTP automatically.
- Complete HTTP/HTTPS URLs, custom ports, and reverse-proxy paths are supported.
- Localhost remains the default and remote mode remains disabled until explicitly enabled.

## Test procedure

1. Install or temporarily load the appropriate beta package.
2. Open the extension Settings.
3. Enable **Connect to JDownloader on another computer**.
4. Enter the server address and click **Test JDownloader connection**.
5. Open a video, send it to JDownloader, and confirm it appears in LinkGrabber.

Please report the browser, operating system, server-address format, and any visible error in [GitHub Issues](https://github.com/Niburan/JD-Video-Grabber/issues). Do not post a private IP, public IP, hostname, password, or complete media URL in a public issue.

## Package notes

- This beta has **not been signed by Mozilla** and cannot be installed permanently in standard Firefox.
- For easier Firefox sideloading, download the clearly labeled `UNSIGNED.xpi`, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose the XPI. It disappears after Firefox restarts.
- The Firefox ZIP contains the same files and can instead be extracted and loaded by selecting its `manifest.json`.
- The Chrome/Brave ZIP must be extracted before choosing **Load unpacked** in Developer mode.

## Security warning

The remote computer must expose Click'n'Load and allow the connection through its firewall. A VPN or HTTPS is safer than exposing port 9666 directly to the public internet. Public HTTP sends submitted video URLs without transport encryption.

DRM, encryption, access controls, and paywalls are not bypassed.
