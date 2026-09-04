# Privacy Policy — JD Video Grabber

Last updated: September 4, 2026

JD Video Grabber detects downloadable video sources in the browser and sends only a user-selected link to the JDownloader connection chosen by the user. The extension contains no advertising, analytics, tracking, telemetry, or developer-operated server.

## Data handled

- **Browsing activity and website content:** page URLs, page titles, detected media URLs, and media metadata needed to identify and label downloadable sources.
- **Connection settings:** the selected Local, Direct server, or MyJDownloader connection mode; a configured direct-server address; or the selected MyJDownloader account email and device identity.
- **Authentication information:** a MyJDownloader password entered by the user is used locally to derive the encrypted API login session. The password is not saved in extension settings.

## Where data goes

- **Local mode:** the selected link, source page URL, and package title are sent to JDownloader on `127.0.0.1:9666`.
- **Direct server mode:** the same download information is sent to the server address explicitly configured by the user. HTTP does not provide transport encryption; VPN or authenticated HTTPS is recommended.
- **MyJDownloader mode:** the account email and encrypted authentication messages are sent to `https://api.jdownloader.org`. Selected links and page titles are sent through that service to the JDownloader device chosen by the user.

Data sent through MyJDownloader is also subject to the MyJDownloader/AppWork privacy terms. JD Video Grabber is not affiliated with or operated by AppWork GmbH.

## Storage and retention

- Detection results are kept in memory or extension session storage and expire with the browser session.
- Normal preferences, the direct-server address, the MyJDownloader email, and the chosen device identity are stored in extension-local settings until changed or the extension is removed.
- MyJDownloader session tokens and derived encryption tokens are stored only in extension session storage. They are discarded when the browser session ends or when **Forget session** is selected.
- The MyJDownloader password is not written to extension storage.

## User control

Remote connection modes are optional. Users choose the connection mode, select each link that is sent, can forget the MyJDownloader session at any time, and can remove all stored extension data by uninstalling the extension.

Questions and bug reports may be submitted through the project's [GitHub Issues](https://github.com/Niburan/JD-Video-Grabber/issues). Do not include passwords, session tokens, private or public IP addresses, hostnames, or complete media URLs in public reports.
