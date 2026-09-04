# JD Video Grabber v1.2.0-beta.1 — MyJDownloader Server Access

This prerelease needs testing by people who run JDownloader 2 on another computer and use a MyJDownloader account.

## What changed

- Added **MyJDownloader account** as a third connection type.
- Signs in through the official `https://api.jdownloader.org` service.
- Finds the online JDownloader devices attached to the account.
- Lets the tester choose which device receives detected video links.
- Sends links through `/linkgrabberv2/addLinks` while preserving package names and autostart behavior.
- Keeps the account password out of saved extension settings.
- Retains the Local and Direct server modes from earlier builds.

## MyJDownloader test procedure

1. In the remote JDownloader application, open My.JDownloader settings and sign in to a test account.
2. Temporarily load the Firefox beta or load the unpacked Chromium beta.
3. Open the extension Settings and choose **MyJDownloader account**.
4. Enter the account email and password and click **Sign in and find devices**.
5. Select the target JDownloader device.
6. Click **Test selected MyJDownloader device**.
7. Open a normal, non-DRM video, send a detected source, and confirm it appears in that device's LinkGrabber.
8. If **Start downloads immediately** is enabled, confirm that behavior as well.

Please report the browser, operating system, number of devices found, selected device name, and the exact visible error in [GitHub Issues](https://github.com/Niburan/JD-Video-Grabber/issues). **Never post your MyJDownloader email, password, session tokens, private/public IP, hostname, or complete media URL in a public issue.**

## Direct server regression test

The earlier Direct server mode remains included. Testers who use LAN, VPN, WAN, or an HTTPS reverse proxy should verify that their existing configuration still connects and receives links.

## Package notes

- This beta has **not been signed by Mozilla** and cannot be installed permanently in standard Firefox.
- For easier Firefox sideloading, download the clearly labeled `UNSIGNED.xpi`, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose the XPI. It disappears after Firefox restarts.
- The Firefox ZIP contains the same files and can instead be extracted and loaded by selecting its `manifest.json`.
- The Chrome/Brave ZIP must be extracted before choosing **Load unpacked** in Developer mode.

## Security and privacy

MyJDownloader authentication and device messages use the API's encrypted AES-CBC and HMAC-SHA256 protocol. The password is used to derive the login session and is not stored in extension settings. Temporary session tokens are kept only in extension session storage and are discarded when the browser session ends or the tester clicks **Forget session**.

When MyJDownloader mode is selected, the chosen video URL and page title pass through `https://api.jdownloader.org` to the selected JDownloader device. Local and Direct server modes do not use MyJDownloader.

The Firefox manifest explicitly declares authentication information, personally identifying information, browsing activity, and website content so a future Mozilla submission accurately reflects every beta connection mode.

DRM, encryption, access controls, and paywalls are not bypassed.
