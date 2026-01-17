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
git clone https://github.com/YOUR-GITHUB-USER/twitter-scraper.git
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

## License

MIT
