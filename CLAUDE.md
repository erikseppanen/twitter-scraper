# Twitter Likes Archiver

The normal workflow is the autonomous Mac Mini service. Read README.md and
service/README.md before changing the installation or running maintenance.

## Routine updates

Use the authenticated dashboard's **Update now** action when asked to update likes.
The service already runs every four hours. Do not start a competing browser scraper,
require the Firefox extension, or ask the user to collect tweet IDs manually.

If sign-in expires, use **Reconnect X**, let the user sign into the dedicated Chrome
window on the Mini, then use **Finish sign-in**. Do not close unrelated Chrome windows
or use the user's normal browser profile. The service manages its own profile.

The worker tracks the order of likes, not the largest tweet ID. Older tweets can be
new likes. Preserve its saved cutoff and existing archive during changes.

## Import and recovery

The Clojure importer remains part of the service. Export parsing, optional retweet
import, cache regeneration, and repair tools are still supported. See TUTORIAL.md
for commands. Run maintenance on a staged copy; avoid concurrent writes to the live
archive and verify the live cache is unchanged before publishing.

Back up all of archive/, including the hidden cache and downloaded media and articles.
Keep .service/ credentials, the private link, and Chrome session out of Git and public
assets. Use the existing private bookmark without printing its token in logs or docs.
