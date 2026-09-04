# Changelog

## v1.2.1-beta.1

- Added Above top-right and Above top-left video-bar positions with an inside fallback when there is insufficient room above the player
- Automatically reconnects once after MyJDownloader explicitly rejects an expired session
- Rotates and saves session keys before retrying the rejected operation
- Serializes account requests and preserves request IDs across background suspension
- Does not retry network failures or device errors that might duplicate downloads
- Prevents an in-flight renewal from undoing Forget session
- Requires one fresh sign-in after upgrading from the first MyJDownloader beta
- Includes regression tests for renewal, suspension, concurrency, and retry safety
- Firefox XPI remains unsigned by Mozilla; temporary installation only

## v1.2.0-beta.1

- Added MyJDownloader as a third connection mode alongside Local and Direct server
- Added encrypted MyJDownloader authentication using the browser's built-in Web Crypto API
- Added online-device discovery, device selection, connection testing, and LinkGrabber submission
- Keeps the MyJDownloader password out of saved extension settings
- Stores API session material only in extension session storage and requires sign-in again after a browser restart
- Added explicit MyJDownloader privacy and testing guidance
- Added a repository privacy policy covering all three connection modes
- Preserved direct LAN, VPN, WAN, hostname, public-IP, and HTTPS reverse-proxy support

## v1.1.0-beta.1

- Added opt-in remote JDownloader server access
- Accepts LAN, VPN, WAN, and public IP addresses or hostnames
- Normalizes bare addresses such as `192.168.1.50:9666`
- Supports HTTP, HTTPS, custom ports, and reverse-proxy paths
- Keeps localhost as the default and shows remote-mode safety guidance
- Displays Local connection or Remote connection in the toolbar panel

## v1.0.4

Initial public GitHub release.

- Firefox, Chrome, and Brave support
- Layered HLS, DASH, direct-media, and page-player detection
- JDownloader 2 Click'n'Load handoff
- Quality/source selector with second-click retraction
- Dismissible per-video download bars
- Custom themes, sizes, designs, and placement
- Duplicate and tiny-segment filtering
- Page-title package names and optional filename hints
- Firefox-native background runtime kept separate from Chromium's service worker
