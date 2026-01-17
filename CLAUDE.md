# Twitter Likes Archiver

A Clojure CLI tool that processes a Twitter data export, downloads all media from liked tweets, and generates static HTML pages for offline viewing.

## Usage

```bash
# Basic usage
clj -M -m twitter-scraper.core --input /path/to/twitter-archive --output ./archive

# Options
--input PATH     Path to Twitter export directory (required)
--output PATH    Output directory for archive (default: ./archive)
--delay MS       Delay between API requests in ms (default: 500)
--skip-fetch     Skip fetching tweet data (use cached data)
--skip-media     Skip downloading media files
--help           Show help
```

## How It Works

1. Parses `like.js` from Twitter data export (Settings → Download archive)
2. Fetches full tweet data via Twitter's syndication API (no API key needed)
3. Downloads images/videos/gifs locally
4. Generates browsable static HTML with dark/light mode

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

test-data/        # Sample data for testing
```

## Dependencies

- clj-http - HTTP client
- cheshire - JSON parsing
- hiccup - HTML generation
- tools.cli - CLI argument parsing
