# Using your Twitter archive

## Everyday use

Open your saved private bookmark; it opens your likes. Updates run automatically every
four hours while the Mini service is running. Choose **Updates** in the menu (the circular
arrows on a phone) and then **Update now** when you want to check sooner. Updates shows
the last result and any error that needs attention.

No Firefox extension, manual ID export, or Claude scraping session is required.
The service uses its own Chrome profile and invokes the Clojure importer internally.

If X asks you to sign in again:

1. Choose **Reconnect X** in Updates.
2. Sign into X in the dedicated Chrome window on the Mini.
3. Choose **Finish sign-in** in Updates.

Automatic checks stay paused during sign-in. Your ordinary Chrome windows can stay open.
After the Mini reboots, log into its macOS account so the LaunchAgent can start.

## Viewing remotely

The current Mini installation uses Tailscale Funnel on HTTPS port 8443. Your viewing
device does not need Tailscale. Use your saved private link to establish access;
opening the bare address in a new browser does not sign you in.

Anyone with that link can view the archive and use its controls. Keep it private.
For configuration and token rotation, see [service operations](service/README.md).

## Browsing

- Search finds likes containing all your words, in the tweet, its quoted tweet, an
  article, or the author's name, and also likes about the same thing in other words
  (labeled **Similar meaning**). Put a phrase in "quotes" to match it exactly. Results
  come best match first; your search, filters and sort stay in the address, so
  reloading or sharing the link keeps them.
- Filter by year, month, or author. Select an author's name or @handle on any tweet to
  see all your likes from them.
- Order newest first, oldest first, or **Shuffled**. **Reshuffle** picks a new order; the shuffle is kept in the
  address, so returning or reloading shows the same order.
- **Random** shows one like at a time in a shuffled order. Use **Next** and
  **Previous**, the arrow keys, or swipe left and right on a phone. **One at a time** on a
  shuffled timeline opens it with the same filters and order.
- Use **Show more** for long tweets. Select a tweet's date or **Permalink** for its own
  page with related likes.
- Select an article card to read the article in the app, with its images.
- **Related** shows similar likes: in a sidebar on wide screens, full screen on phones.
- A tweet's own page has **Copy link** and **Copy Org link** for notes.
- Non-English text appears in English; select the note above it to see the original.
- Use the half-circle in the menu for light or dark mode.
- Choose **Remove**, then confirm, to delete a tweet from the archive. It
  disappears at once; the service then deletes its data and any media no other tweet uses.
  Removed IDs are kept in `.service/removed.json` and `archive/.removed-ids`, so updates and
  imports never add them back. There is no undo button; `archive-previous` holds the
  version before the most recent change.

## Backups

Back up the **entire `archive/` directory**, including hidden files:

```text
archive/
├── .tweet-cache.edn    Tweet metadata, text, and media references
├── media/             Downloaded photos, videos, and GIFs
├── articles/          Article text (ID.json) and downloaded article images
└── tweets.json        Tweet data the app loads
```

The cache does not contain image or video bytes. The JSON files can be regenerated
from the cache with `--rebuild`; missing media requires downloading from its source again, which may
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

### Rebuild app data or retry media downloads

```bash
# Rewrite tweets.json and article files from the cache, without network access
clj -M -m twitter-scraper.core --rebuild --output ./archive-repair

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
