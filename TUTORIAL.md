# Using your Twitter archive

## Everyday use

Open your saved private bookmark. Choose **Browse archive** to search and filter tweets.
Updates run automatically every four hours while the Mini service is running. Use
**Update now** on the dashboard when you want to check sooner. The dashboard shows the
last result and any error that needs attention.

No Firefox extension, manual ID export, or Claude scraping session is required.
The service uses its own Chrome profile and invokes the Clojure importer internally.

If X asks you to sign in again:

1. Choose **Reconnect X** on the dashboard.
2. Sign into X in the dedicated Chrome window on the Mini.
3. Choose **Finish sign-in** on the dashboard.

Automatic checks stay paused during sign-in. Your ordinary Chrome windows can stay open.
After the Mini reboots, log into its macOS account so the LaunchAgent can start.

## Viewing remotely

The current Mini installation uses Tailscale Funnel on HTTPS port 8443. Your viewing
device does not need Tailscale. Use your saved private link to establish access;
opening the bare address in a new browser does not sign you in.

Anyone with that link can view the archive and operate its dashboard. Keep it private.
For configuration and token rotation, see [service operations](service/README.md).

## Browsing

- Search tweet text, author names/handles, and article titles.
- Filter by year, month, or author; switch between newest and oldest first.
- Use **Show more** for long tweets and **View page** for an individual page.
- Quoted photos, videos, and GIFs appear inside quoted cards.
- Use the theme button for light or dark mode.

## Backups

Back up the **entire `archive/` directory**, including hidden files:

```text
archive/
├── .tweet-cache.edn    Tweet metadata, text, and media references
├── media/             Downloaded photos, videos, and GIFs
├── articles/          Article pages and downloaded article images
├── tweets/            Individual tweet pages
├── tweets.json        Data for consumers of the archive
├── index.html         Browsable archive
└── style.css
```

The cache does not contain image or video bytes. HTML and JSON can be regenerated
from the cache; missing media requires downloading from its source again, which may
no longer be available. A cache-only backup is incomplete. Keep an independent private
backup; `archive-previous` is a rollback copy, not a complete backup strategy.

For recovery of the service itself, also keep a secure backup of its configuration
and `.service/` state. This includes credentials and browser session data; keep it out
of Git and public storage. Restoring browser data may still require signing into X again.

## Initial historical import

This is an administrator workflow for a new archive or older likes missed by incremental
collection. The automated collector does not guarantee a complete historical backfill.
Install the service using [the installation guide](service/README.md).

Download your Twitter/X data export and extract it. The directory supplied to `--input`
should contain `data/like.js` (split exports are supported). With Clojure and Java installed:

```bash
# Small initial test, in a separate output directory
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./test-output --limit 10

# Historical archive, kept separate from the live service during preparation
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive-repair
```

An interrupted run can reuse data already saved in its output cache. Preserve its media
files too. Unavailable source tweets may not be recoverable.

## Maintenance and recovery

These commands are optional administrator tools, not daily user steps. Use a staged copy
of the archive (`./archive-repair` in these examples). Preserve the current live archive,
avoid concurrent writes, and check that its cache has not changed before publishing a
replacement. The service does this automatically for its normal updates.

### Import specific tweets

Put tweet IDs or tweet URLs in a text file, one per line:

```bash
clj -M -m twitter-scraper.core --import /path/to/tweet-ids.txt --output ./archive-repair
```

Already archived IDs are skipped. This importer is also used by the automated service.

### Optional retweets

Retweets come from the export's tweet data and are not collected by the Likes automation:

```bash
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive-repair --include-retweets
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive-repair --retweets-only
```

### Retry empty tweet records

```bash
clj -M -m twitter-scraper.core --refetch-failed --output ./archive-repair
```

This retries cached entries with missing text or author information. It cannot restore
permanently unavailable source content.

### Rebuild pages or retry media downloads

```bash
# Rebuild HTML/JSON without network access
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive-repair --skip-fetch --skip-media

# Reuse cached tweet data and download missing media
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive-repair --skip-fetch
```

### Repair quotes from older versions

New imports include quoted media automatically. For archives created before that support:

```bash
clojure -M scripts/backfill-quote.clj ./archive-repair
clojure -M scripts/restore-syndication-quotes.clj ./archive-repair
```

The first script fetches media for existing quotes; the second also recovers quote data
from saved Twitter responses. These are migration tools, not scheduled user tasks.

For all CLI flags, run `clj -M -m twitter-scraper.core --help`. For installation, service
logs, restart commands, and automated tests, see [service operations](service/README.md).
