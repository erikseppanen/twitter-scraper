# Twitter Likes Archiver

A Clojure CLI tool that processes a Twitter data export, downloads all media from liked tweets, and generates static HTML pages for offline viewing.

## Usage

```bash
# Basic usage - initial archive from Twitter data export
clj -M -m twitter-scraper.core --input /path/to/twitter-archive --output ./archive

# Import new tweets from a file of tweet IDs/URLs
clj -M -m twitter-scraper.core -I new-tweets.txt --output ./archive

# Options
--input PATH     Path to Twitter export directory (required for initial archive)
--output PATH    Output directory for archive (default: ./archive)
--delay MS       Delay between API requests in ms (default: 500)
--limit N        Limit to first N tweets
--skip-fetch     Skip fetching tweet data (use cached data)
--skip-media     Skip downloading media files
-I, --import FILE    Import tweet IDs from file and merge with existing archive
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

## Incremental Updates

After your initial archive, you can add new liked tweets without requesting another full Twitter data export:

### Option 1: Manual collection
1. As you browse Twitter and like tweets, copy their URLs to a text file (one per line)
2. Run the import command:
   ```bash
   clj -M -m twitter-scraper.core -I new-tweets.txt --output ./archive
   ```

### Option 2: Ask Claude to scrape your likes
1. Close Chrome completely (Cmd+Q on Mac)
2. Ask Claude: "Scrape my new liked tweets and update my archive"
3. Claude will:
   - Open a browser for you to log into Twitter
   - Load the existing archive and find the most recent tweet ID
   - Scroll through your likes page, stopping when it reaches that tweet
   - Collect only the new tweet IDs (not already in archive)
   - Save them and run the import automatically

### Import file format
The import file accepts one entry per line:
- Tweet IDs: `1234567890123456789`
- Tweet URLs: `https://x.com/username/status/1234567890123456789`
- Mixed formats are supported

The tool will automatically skip tweets that are already in your archive.

## Dependencies

- clj-http - HTTP client
- cheshire - JSON parsing
- hiccup - HTML generation
- tools.cli - CLI argument parsing
