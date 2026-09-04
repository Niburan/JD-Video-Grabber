# JD Video Grabber v1.2.1-beta.1 — MyJDownloader Session Renewal

Fixes a missing reconnect path in the first MyJDownloader beta. When the service rejects an expired session, the extension now uses the renewal token, rotates its encryption keys, and retries the rejected operation once. Requests run in order to prevent concurrent renewal conflicts.

Also adds **Above top-right** and **Above top-left** under Settings → **Download bar position**. Select one and save to place the bar just above the video, with a four-pixel gap. When there is insufficient room above the player in the page or iframe, it falls back inside. Bar height is measured to support all appearance sizes.

**After upgrading, sign in to MyJDownloader once in extension Settings.** The previous beta did not retain the derived device key needed for automatic renewal. The password is still not saved. Authentication material stays in extension session storage; restarting the browser still requires sign-in.

## Downloads and installation

- **Not Mozilla signed yet.** The `UNSIGNED.xpi` is for temporary Firefox installation through `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**. It cannot be installed permanently in standard Firefox and disappears after restart.
- The Firefox ZIP contains the same extension files.
- Extract the Chrome/Brave ZIP and choose **Load unpacked** in browser extension Developer mode.
- Internal extension version: **1.2.1**. This GitHub release is a **beta prerelease**.

## What to test

1. Sign in, select your JDownloader device, and send a video link.
2. Leave the browser open until the session would previously expire, then test the connection and send another link. Device discovery and downloads should recover automatically if the renewal token is valid.
3. Close and reopen extension Settings after a period of inactivity; the saved session should remain usable across background suspension.
4. Check that **Forget session** signs out and that restarting the browser requests a fresh sign-in.
5. Select an Above position, save settings, and scroll or resize the video page. Check outside placement where there is room and the inside fallback near the top of the viewport.

If the renewal token is also rejected, sign in again. Network timeouts and device errors are not retried automatically; check LinkGrabber before resending a link after a lost response.

## Validation

Automated tests cover renewed server signatures, device encryption with rotated keys, restored sessions, simultaneous requests, bounded retries, rejected renewal, cancellation, and sign-out during renewal. Existing detector, background, manifest, and Chromium compatibility tests also pass. Tests use a simulated API; this release still needs testing with a real MyJDownloader account.

Report the browser and visible error through [GitHub Issues](https://github.com/Niburan/JD-Video-Grabber/issues). Do not post passwords, session tokens, account emails, or private download URLs.
