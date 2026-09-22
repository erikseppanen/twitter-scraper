# Autonomous archive service

Runs the existing Clojure importer from a Node dashboard and a dedicated Chrome profile.
No local LLM is required or installed. Updates run every four hours, with an Update now button.

## Mac Mini installation

Install Java 21 and Clojure using Homebrew. Copy this project and the archive to a private
folder on the Mini (for example `~/twitter-scraper`). Do not copy node_modules.

For a new tailnet-only installation, configure Tailscale Serve to proxy HTTPS to
`http://127.0.0.1:4318`. The existing Mini uses Funnel on port 8443 instead; preserve
that configuration and its `PUBLIC_ORIGIN` when upgrading:

```sh
tailscale serve --bg http://127.0.0.1:4318
PUBLIC_ORIGIN=https://YOUR-MINI.YOUR-TAILNET.ts.net bash scripts/install-mini.sh
```

The installer installs locked Node dependencies, checks Clojure dependencies, runs tests,
and creates `local.twitter-archive` in the signed-in user's LaunchAgents. The service
restarts after a crash and starts when that user logs in. **After a reboot, the user must
log into macOS**; FileVault and the GUI login cannot be bypassed by this service.

Open **Twitter Archive** on the Mini desktop. Choose **Reconnect X**, sign into X in the
new normal Chrome window on the Mini, then click **Finish sign-in** on the dashboard.
Chrome runs without Playwright or remote debugging during sign-in. Automatic checks remain
paused, including across service restarts, until a subsequent update succeeds. Finish sign-in
closes only the dedicated Chrome process before verifying the saved session. If the service
restarted during login, quit that dedicated Chrome instance before choosing Finish sign-in. This is a
separate browser profile; normal Chrome tabs are unaffected. X may require verification
or renewed sign-in. The dashboard reports failures and keeps the last successful archive.

## Access

The bookmark's fragment contains a random 256-bit bearer token. It is exchanged for an
HttpOnly, Secure, SameSite cookie; the browser removes the fragment from its address bar.
Anyone possessing the link can view the archive and operate the dashboard. Keep it private.
All archive files and API routes require authentication. There is no public static-files
origin. The service listens only on loopback; it requires an HTTPS reverse proxy.

The current Mini deployment uses Tailscale Funnel at
`https://YOUR-MINI.YOUR-TAILNET.ts.net:8443`, proxying the authenticated service on loopback
port 4318. Viewing devices do not need Tailscale; access still requires the private-link
login. The bare URL above contains no access token.

Tailscale Serve remains an alternative for tailnet-only installations, where viewing
devices need Tailscale connected. Never expose the archive directory directly.
`PUBLIC_ORIGIN` must match the external URL, including its port.

The token is stored in `.service/access.json`; the full link is in `.service/private-link.txt`.
To revoke all sessions: stop the service, replace the token with 32 cryptographically random
bytes encoded as base64url, restart, and update the bookmark. Credentials and the dedicated
Chrome profile are excluded from Git. They must not be uploaded as website assets.

## Updates and recovery

Likes are collected in displayed order using each tweet's timestamp link, not quoted-tweet
links. Tweet creation IDs are never used as chronological cutoffs. First sync stops after
20 consecutive already-archived tweets, or after the page stops yielding new items; this
is incremental discovery, not a guaranteed complete backfill. Subsequent syncs seek the
last successful like-order cutoff. X page changes, removed cutoffs, empty Likes, login
challenges, and scroll limits can require intervention. A stalled initial page cannot be
proven complete and a full historical audit is outside this collector's scope.

Imports run in `archive-staging`, an APFS copy-on-write clone. Before publication all
collected tweet IDs must have content. A failed import preserves the live archive and
cutoff for retry. The previous published archive is retained as `archive-previous` and
recovered at startup if interrupted between publication renames. One update runs at a time.
The copy-on-write staging command targets macOS/APFS, not Linux. Keep an independent backup of the entire archive, including the hidden metadata cache,
downloaded media, and article assets. The cache alone cannot restore media whose source
has disappeared. Back up service credentials/state separately and securely.

Failed/deleted tweets currently block publication of that batch rather than silently
skipping them. Logs are `.service/service.log` and `.service/error.log`. Status survives
service restarts in `.service/status.json`. Restart with:

```sh
launchctl kickstart -k gui/$(id -u)/local.twitter-archive
```

For application upgrades, copy code and lockfile without overwriting `archive` or `.service`,
then rerun the installer. The installer does not expose the site or alter firewall settings.

## Tests

```sh
npm ci --prefix service
npm test --prefix service
```

Tests cover authentication for data and media, CSRF protection, hidden files, path traversal,
symlink escapes, video ranges, deduplication, and preserving state when browser startup fails.
Live X collection and restart testing require the deployed Mini and a signed-in X session.

The cache loader also recovers paths for media already downloaded by older versions, and
imports now persist those paths. `clojure -M:test` verifies this migration and incremental
imports. `node service/browser-test.mjs` checks dashboard interactions and collection from
a controlled Likes page in Chrome. `deployed-test.mjs` checks a running Mini deployment;
provide its `PUBLIC_ORIGIN` environment variable. Do not run its `--connect` option unless
you intend to open the X sign-in browser.

On macOS both sign-in and scraping launch Chrome through LaunchServices (`open`), so they
use the same keychain-backed cookie store. The scraper attaches over an ephemeral loopback-only
CDP port after launching its dedicated profile. Sign-in itself has no debugging connection.
Headless Chrome is closed with CDP `Browser.close`; visible login Chrome receives a normal
quit request targeted to that exact process. `node service/login-persistence-test.mjs` verifies
the full normal-Chrome → saved cookie → headless scraper → clean shutdown flow using a
harmless local HTTP fixture, without contacting X.
