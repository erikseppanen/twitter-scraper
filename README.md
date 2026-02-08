# Twitter Likes Archiver

A Clojure CLI tool that processes a Twitter data export, downloads all media from liked tweets, and generates static HTML pages for offline viewing.

## Features

- Parses `like.js` from Twitter data exports
- Fetches full tweet data via Twitter's syndication API (no API key needed)
- Downloads images, videos, and GIFs locally
- Generates browsable static HTML with dark/light mode support
- Caches fetched data to resume interrupted runs

## Prerequisites

- [Clojure CLI](https://clojure.org/guides/install_clojure) (1.11+)
- Java 11+

## Installation

```bash
git clone https://github.com/erikseppanen/twitter-scraper.git
cd twitter-scraper
```

## Usage

### 1. Download your Twitter archive

Go to Twitter Settings → Your Account → Download an archive of your data

### 2. Extract the archive

```bash
unzip twitter-*.zip -d ~/twitter-archive
```

### 3. Run the archiver

```bash
clj -M -m twitter-scraper.core --input ~/twitter-archive --output ./archive
```

### 4. View the results

Open `./archive/index.html` in your browser.

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input PATH` | Path to Twitter export directory | (required) |
| `-o, --output PATH` | Output directory for archive | `./archive` |
| `-d, --delay MS` | Delay between API requests (ms) | `500` |
| `-l, --limit N` | Limit to first N tweets | (all) |
| `-s, --skip-fetch` | Skip fetching (use cached data) | |
| `-m, --skip-media` | Skip downloading media files | |
| `-I, --import FILE` | Import tweet IDs from file | |
| `-h, --help` | Show help | |

## Examples

```bash
# Archive all liked tweets
clj -M -m twitter-scraper.core --input ~/twitter-archive

# Test with first 10 tweets
clj -M -m twitter-scraper.core --input ~/twitter-archive --limit 10

# Resume with cached data, re-download media
clj -M -m twitter-scraper.core --input ~/twitter-archive --skip-fetch

# Fast run: use cache, skip media
clj -M -m twitter-scraper.core --input ~/twitter-archive --skip-fetch --skip-media
```

## Firefox Extension (export new likes)

There is a simple Firefox extension to export newly liked tweet IDs to a text file.

### Install

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `firefox-extension/manifest.json`

### Use

1. Open your Likes page on `x.com` (or `twitter.com`)
2. Click the extension button → **Export new likes**
3. A `.txt` file downloads with one tweet ID per line

### Import

```bash
clj -M -m twitter-scraper.core --import /path/to/twitter-likes-YYYY-MM-DD.txt --output ./archive
```

## Project Structure

```
src/twitter_scraper/
├── core.clj      # CLI entry point, orchestrates pipeline
├── parser.clj    # Parses Twitter export like.js files
├── fetcher.clj   # Fetches tweet data, downloads media
├── html.clj      # Generates static HTML pages
└── util.clj      # Shared utilities (logging, retry, file ops)

resources/templates/
└── style.css     # Styling for generated HTML
```

## Data Flow

```
+---------------------+
| Twitter Data Export |
| (from Settings)     |
|                     |
| data/like.js        |<-- Contains only tweet IDs, not content
+---------+-----------+
          |
          | --input
          v
+------------------------------------------------------------------+
|                        twitter-scraper                           |
|                                                                  |
|  +-----------+    +-----------+    +-----------+    +----------+ |
|  | parser    |--->| fetcher   |--->| fetcher   |--->| html     | |
|  |           |    |           |    |           |    |          | |
|  | Extract   |    | Fetch     |    | Download  |    | Generate | |
|  | tweet IDs |    | tweet data|    | media     |    | HTML     | |
|  +-----------+    | from API  |    | files     |    | pages    | |
|                   +-----+-----+    +-----+-----+    +----+-----+ |
+-------------------------|--------------|--------------|----------+
                          |              |              |
                          v              v              v
                    +---------------------------------------------+
                    |                 ./archive/                  |
                    |                                             |
                    |  .tweet-cache.edn  <-- Tweet metadata cache |
                    |                       (text, authors, dates,|
                    |                        media URLs, articles)|
                    |                       BACK UP THIS FILE!    |
                    |                                             |
                    |  media/            <-- Downloaded images    |
                    |  articles/         <-- Article covers       |
                    |  tweets/           <-- Individual pages     |
                    |  index.html        <-- Main browsable page  |
                    |                                             |
                    +---------------------------------------------+
```

**Important:** The cache file (`.tweet-cache.edn`) stores all fetched tweet data. The Twitter export only contains tweet IDs, not content. Without the cache, content must be re-fetched from the API.

## Incremental Updates

After your initial archive, you can add new liked tweets without requesting another Twitter data export.

### Option 1: Manual collection

As you browse Twitter and like tweets, copy their URLs to a text file:

```bash
# new-tweets.txt (one per line)
https://x.com/user/status/1234567890123456789
https://x.com/other/status/9876543210987654321
```

Then import:

```bash
clj -M -m twitter-scraper.core -I new-tweets.txt --output ./archive
```

### Option 2: Browser scraping with Claude

Ask Claude: "Scrape my new liked tweets and update my archive"

Claude will open a browser for you to log in, then scrape your likes page and import new tweets automatically.

### Import file format

The import file accepts one entry per line:
- Tweet IDs: `1234567890123456789`
- Tweet URLs: `https://x.com/username/status/1234567890123456789`

The tool automatically skips tweets already in your archive.

## License

MIT
