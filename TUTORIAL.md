# Tutorial: Archiving Your Twitter Likes

This walks you through the whole lifecycle of the tool, from a fresh Twitter
data export to a searchable offline archive you keep topped up over time.

If you just want the flag list, see [README.md](README.md). This document is
the guided tour.

---

## What this tool actually does

Twitter's data export gives you a list of **tweet IDs** you liked — no text, no
images, no author names. This tool takes that list and:

1. **Parses** the IDs out of `like.js` (and optionally `tweet.js` for retweets).
2. **Fetches** each tweet's real content from Twitter's public syndication API
   (no API key, no login).
3. **Downloads** every image, video, and GIF to local files.
4. **Generates** a static HTML site you can open straight from disk.

Everything it fetches is written to a cache file. That cache — not the Twitter
export — is the thing you back up. More on that below.

```
like.js (just IDs)  ──parse──▶  IDs  ──fetch──▶  tweet content  ──▶  .tweet-cache.edn
                                                       │
                                              download media
                                                       │
                                                       ▼
                                             archive/ (browsable HTML)
```

---

## Before you start

You need:

- **Clojure CLI** 1.11 or newer — https://clojure.org/guides/install_clojure
- **Java** 11 or newer

Check both:

```bash
clj --version
java -version
```

Then get the code:

```bash
git clone https://github.com/YOUR-GITHUB-USER/twitter-scraper.git
cd twitter-scraper
```

There's nothing to build. `clj` pulls dependencies on first run.

---

## Part 1 — Your first archive

### Step 1: Download your Twitter data

On Twitter/X: **Settings → Your account → Download an archive of your data**.
Twitter emails you a `.zip` when it's ready (this can take a day or two).

### Step 2: Unzip it somewhere

```bash
unzip twitter-2026-08-01-abc123.zip -d ~/twitter-archive
```

You should now have `~/twitter-archive/data/like.js` (large exports split this
into `like-part0.js`, `like-part1.js`, … — the tool finds all parts).

### Step 3: Do a small test run first

Don't fetch thousands of tweets on your first try. Use `--limit` to grab just
the first 10 and confirm everything works:

```bash
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive --limit 10
```

You'll see four stages run:

```
=== Step 1: Parsing Twitter Export ===
=== Step 2: Fetching Tweet Data ===
Fetching: [==============================] 10/10 (100%)
=== Step 3: Downloading Media ===
=== Step 4: Generating HTML Pages ===
=== Archive Complete ===
```

Open `./archive/index.html` in a browser. If those 10 tweets look right, run the
full thing.

### Step 4: Run the full archive

```bash
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive
```

This is the slow part. There's a deliberate 500 ms pause between fetches to stay
polite to Twitter's servers, so ~1,000 likes takes roughly 10 minutes. Deleted,
suspended, and private tweets are skipped with a warning — that's normal, and
the run reports how many were unavailable at the end.

**The run is resumable.** Anything already fetched is saved to
`archive/.tweet-cache.edn` as it goes. If it dies halfway (network drop, laptop
sleep), just run the same command again — it skips everything already cached and
picks up where it left off.

### Step 5: Browse it

```bash
open ./archive/index.html      # macOS
xdg-open ./archive/index.html  # Linux
```

---

## Part 2 — Using the generated site

The `index.html` page is a self-contained app (no server needed). It gives you:

- **Search** — matches tweet text, author name/handle, and article titles.
- **Year / Month / Author** dropdowns — filter down to a slice; author list is
  sorted by how many of your likes each account has.
- **Sort toggle** — newest-first (default) or oldest-first.
- **Click a `@handle`** in any tweet to instantly filter to that author.
- **✕** clears all filters.
- **◐** toggles dark/light mode (remembered per browser).
- Long tweets get a **Show more** link; every tweet has a **View page →** link
  to its own standalone page, and an **↗** link back to the live tweet.

### What's in the output directory

```
archive/
├── index.html          Main browsable page (tweet data embedded inline)
├── tweets.json         Same data as a plain JSON file, newest first
├── style.css           Styling
├── tweets/             One <id>.html page per tweet
├── articles/           Full text + images for linked X Articles
├── media/              Downloaded images / videos / GIFs
└── .tweet-cache.edn    ← THE IMPORTANT ONE (see below)
```

### Back up `.tweet-cache.edn`

The Twitter export only has IDs. The cache is the only place the actual tweet
**content** lives. If you delete it, every tweet has to be re-fetched from the
API — and tweets that have since been deleted are gone for good.

Everything else in `archive/` (HTML, media, JSON) can be regenerated from the
cache at any time:

```bash
# rebuild all HTML from cache, no network calls
clj -M -m twitter-scraper.core --input ~/twitter-archive --skip-fetch --skip-media
```

So: **copy `.tweet-cache.edn` somewhere safe** (a second drive, a private repo,
cloud storage). That single file *is* your archive.

---

## Part 3 — Adding new likes later

You do **not** need a fresh Twitter export every time you like more tweets. You
just need a list of the new IDs, in a text file, one per line. The tool fetches
only the ones not already in your cache, then regenerates the whole site.

The import file accepts either form per line:

```
1234567890123456789
https://x.com/someuser/status/9876543210987654321
```

Import command:

```bash
clj -M -m twitter-scraper.core --import new-tweets.txt --output ./archive
```

There are three ways to produce that file.

### Option A — Keep a text file by hand

As you browse and like things, paste the tweet URL into a running text file.
When you've got a batch, import it. Simplest possible workflow, zero setup.

### Option B — The Firefox extension

There's a small extension in `firefox-extension/` that scrapes IDs off your
Likes page for you.

**Install (temporary, gone on Firefox restart):**

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Pick `firefox-extension/manifest.json`

**Use:**

1. Open your Likes page on `x.com`.
2. Click the extension icon. First time only, establish a cutoff point so it
   knows where "new" begins:
   - **Set current as baseline** — marks the tweet currently at the top, or
   - **Pick baseline by click** — then click a specific tweet on the page to
     use as the cutoff. The popup shows the author and text of what you picked.
3. Click **Export new likes**. It scrolls your Likes, collecting IDs until it
   reaches the baseline, then downloads a
   `twitter-likes-YYYY-MM-DD.txt` file.
4. **Stop export** aborts a run in progress; **Reset last seen** clears the
   remembered position.

Then import the downloaded file:

```bash
clj -M -m twitter-scraper.core --import ~/Downloads/twitter-likes-2026-08-27.txt --output ./archive
```

### Option C — Let Claude scrape it

With Claude Code in this repo, ask:

> Scrape my new liked tweets and update my archive

Claude follows the workflow in `CLAUDE.md`: it opens a browser for you to log
in, reads the newest ID already in your cache, scrolls your Likes page
collecting IDs until it hits one you already have, writes them to
`new-tweets-to-import.txt`, and runs the import for you.

(Chrome must be fully quit first — the automation needs to drive it.)

---

## Part 4 — Retweets

Your retweets live in `tweet.js`, not `like.js`, so they're off by default.

```bash
# likes AND retweets, together in one archive
clj -M -m twitter-scraper.core --input ~/twitter-archive --include-retweets

# only retweets, skip likes entirely
clj -M -m twitter-scraper.core --input ~/twitter-archive --retweets-only
```

The tool pulls the original tweet ID out of each `RT @…` entry (from the
retweet metadata, or by parsing the embedded status URL) and archives the
original.

---

## Part 5 — Maintenance

### Re-fetch tweets that failed

Sometimes a fetch comes back empty (rate-limiting, a transient 500, a tweet that
was briefly unavailable). Those sit in the cache with no text or author. To
retry just those:

```bash
clj -M -m twitter-scraper.core --refetch-failed --output ./archive
```

It scans the cache for empty entries, re-fetches only those IDs, and rebuilds
the site. Tweets that are genuinely deleted stay empty — nothing can recover
those.

### Regenerate the site after a code/CSS change

```bash
clj -M -m twitter-scraper.core --input ~/twitter-archive --skip-fetch --skip-media
```

`--skip-fetch` uses the cache as-is; `--skip-media` leaves already-downloaded
files alone. No network, runs in seconds.

### Re-run media download without re-fetching

```bash
clj -M -m twitter-scraper.core --input ~/twitter-archive --skip-fetch
```

Existing media files are skipped; only missing ones are pulled.

### Go gentler (or faster) on the API

```bash
clj -M -m twitter-scraper.core --input ~/twitter-archive --delay 1000   # 1s between calls
```

Raise `--delay` if you see repeated failures; the default 500 ms is usually
fine.

---

## Command reference

| Flag | Meaning | Default |
|------|---------|---------|
| `-i, --input PATH` | Twitter export directory | required (except in import / refetch mode) |
| `-o, --output PATH` | Archive output directory | `./archive` |
| `-d, --delay MS` | Pause between API requests | `500` |
| `-l, --limit N` | Only process the first N tweets | all |
| `-s, --skip-fetch` | Use cached data, don't hit the API | off |
| `-m, --skip-media` | Don't download images/video | off |
| `-I, --import FILE` | Fetch IDs from a file and merge into the archive | — |
| `-r, --include-retweets` | Also archive retweets from `tweet.js` | off |
| `-R, --retweets-only` | Archive retweets, skip likes | off |
| `-F, --refetch-failed` | Retry cached tweets that came back empty | off |
| `-h, --help` | Show help | — |

`--import` and `--refetch-failed` operate on the cache in `--output` and don't
need `--input`.

---

## Troubleshooting

**"Directory must exist" / "Could not find Twitter export data"**
Point `--input` at the folder that *contains* `data/like.js`, not at `like.js`
itself and not at the `.zip`.

**"No cache found. Cannot skip fetch."**
You used `--skip-fetch` before ever doing a real run. Do one full run first.

**Lots of "Tweet not found" warnings**
Expected. Deleted, suspended-account, and protected tweets can't be fetched. The
summary line tells you how many were unavailable.

**Fetching is slow**
By design — 500 ms between requests. Use `--limit` while testing. The full run
only has to happen once; after that you're doing small incremental imports.

**A run got interrupted**
Re-run the exact same command. Cached tweets are skipped, so it resumes.

**I lost `.tweet-cache.edn`**
Re-run the full archive from the export. Anything deleted since your first run
won't come back. This is why you back that file up.

---

## How it fits together (source map)

```
src/twitter_scraper/
├── core.clj      CLI parsing, orchestrates the 4 stages, import/refetch modes
├── parser.clj    Reads like.js / tweet.js, extracts IDs, finds retweet originals
├── fetcher.clj   Syndication API calls, long-tweet + article + quote handling,
│                 media downloading, retry/backoff, rate limiting
├── html.clj      Static site generation (index app, per-tweet pages, article pages)
└── util.clj      Logging, retry, date formatting, filename helpers

resources/templates/style.css   Styling, copied into the archive on every run
firefox-extension/              Popup + content script for exporting new like IDs
```

Data flow for one tweet: `core` gets an ID from `parser` → `fetcher/fetch-tweet-data`
hits the syndication API (and `fxtwitter` for long text / articles / quotes) →
result is cached by `core/save-cache` → `fetcher/download-all-media` pulls the
files → `html/generate-all-pages` writes the HTML.
