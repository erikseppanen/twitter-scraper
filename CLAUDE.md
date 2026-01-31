# Twitter Likes Archiver

Clojure CLI tool that archives liked tweets from a Twitter data export. See README.md for full documentation.

## Quick Reference

```bash
# Initial archive from Twitter export
clj -M -m twitter-scraper.core --input /path/to/twitter-archive --output ./archive

# Import new tweets from file
clj -M -m twitter-scraper.core -I new-tweets.txt --output ./archive

# Use cached data, regenerate HTML only
clj -M -m twitter-scraper.core --input /path/to/twitter-archive --skip-fetch --skip-media
```

## Scraping Workflow

When user asks to scrape their new liked tweets:

1. Close Chrome completely (required for Playwright)
2. Open browser to Twitter login, let user authenticate
3. Load existing archive cache, find most recent tweet ID
4. Navigate to user's likes page, scroll and collect tweet IDs
5. Stop when reaching tweets already in archive
6. Save new IDs to `new-tweets-to-import.txt`
7. Run import command to fetch and merge new tweets
