import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from './server.mjs';
import { Translations } from './translation.mjs';

// Requires a built app: npm run build --prefix web
const root = await mkdtemp(path.join(os.tmpdir(), 'web-browser-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const tweets = Array.from({ length: 120 }, (_, i) => ({
  tweetId: String(1000 + i),
  text: `Fixture tweet number ${i} about ${i % 2 ? 'rockets' : 'bread'}`,
  createdAt: new Date(Date.UTC(2025, i % 12, 1 + (i % 27))).toISOString(),
  user: { name: 'Author ' + (i % 3), screenName: 'author' + (i % 3) },
}));
Object.assign(tweets[0], {
  text: 'Long words '.repeat(40) + 'see https://example.com/page and @someone #tag',
  createdAt: '2026-05-01T12:00:00Z',
  media: [{ type: 'photo', localPath: 'photo.png', url: 'https://example.invalid/photo.png' }],
  quote: { tweetId: '9', text: 'Quoted words', user: { name: 'Quoted', screenName: 'quoted' }, media: [{ type: 'photo', localPath: 'photo.png' }] },
  article: { title: 'An article title', previewText: 'Preview of the article' },
});
tweets[4].text += ' &amp; 1 &lt; 2 &gt; 0';
tweets[2].text = 'Je voudrais présenter mes nouvelles idées pour améliorer notre bibliothèque. Nous avons beaucoup de livres intéressants à partager avec tout le monde.';
await mkdir(path.join(root, 'archive/media'), { recursive: true });
await writeFile(path.join(root, 'archive/tweets.json'), JSON.stringify(tweets));
await writeFile(path.join(root, 'archive/media/photo.png'), png);
await mkdir(path.join(root, 'archive/articles'));
await writeFile(path.join(root, 'archive/articles/1000-cover.jpg'), png);
await writeFile(path.join(root, 'archive/articles/1000-5.png'), png);
await writeFile(path.join(root, 'archive/articles/1000.json'), JSON.stringify({ tweetId: '1000', title: 'An article title', createdAt: '2026-05-01T12:00:00Z',
  user: { name: 'Author 0', screenName: 'author0' }, cover: '1000-cover.jpg', blocks: [
    { type: 'h1', text: 'First section' },
    { type: 'p', text: 'Bold start & a link', styles: [{ offset: 0, length: 4, style: 'bold' }], links: [{ offset: 15, length: 4, url: 'https://example.com/a' }] },
    { type: 'ul', text: 'One' }, { type: 'ul', text: 'Two' },
    { type: 'image', src: '1000-5.png', caption: 'A chart' },
    { type: 'code', code: 'ls -la' }, { type: 'tweet', tweetId: '1001' }] }));
const port = 14328, origin = 'http://127.0.0.1:' + port;
// Neighbors are the next two tweets; the translator is a slow stand-in for the local model.
const searches = [];
const knowledge = { rows: tweets, summary: () => ({ state: 'ready', message: 'Semantic index ready.', available: tweets.length, topics: ['Food', 'Science'] }),
  search: async (q, topic) => { searches.push([q, topic]); return tweets.filter(t => !q || t.text.includes(q)).slice(0, 5).map(tweet => ({ tweet: { ...tweet, topic: 'Science' }, score: q ? 0.5 : null })); },
  graph: id => { const i = tweets.findIndex(t => t.tweetId === id); if (i < 0) return null;
    const nodes = [i, i + 1, i + 2].map((n, k) => ({ tweet: { ...tweets[n % tweets.length], topic: 'Science' }, score: k ? 0.6 : 1 }));
    return { center: id, nodes, neighborhood: { title: 'Rockets and bread', themes: ['Science'] } }; } };
const translations = new Translations(root, path.join(root, '.service'), async () => { await new Promise(r => setTimeout(r, 800)); return 'Translated sentence.'; });
let purges = 0; const actions = [];
const { server, config } = await createApp({ root, stateDir: path.join(root, '.service'), publicOrigin: origin, schedule: false, knowledgeIndex: knowledge, translations,
  workerFactory: state => Object.assign(state, { message: 'Up to date. Imported 0 new likes.', lastSuccess: '2026-10-01T12:00:00Z' }) && ({ busy: false, purge: async () => { purges++; },
    update: async () => { actions.push('update'); }, connect: async () => { actions.push('connect'); }, finish: async () => { actions.push('finish'); } }) });
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Signed-out visitors unlock with the private link and return to the app.
  await page.goto(origin + '/app/?query=rockets');
  assert.ok(page.url().includes('?next='));
  await page.goto(origin + '/#' + config.token);
  await page.waitForURL(origin + '/app/?query=rockets');
  await page.locator('.tweet').first().waitFor();
  assert.equal(await page.locator('.tweet').count(), 50);
  assert.match(await page.locator('.status').textContent(), /Showing 50 of 60 \(matching "rockets"\) from 120 tweets/);
  assert.equal(await page.locator('.tweet mark').first().textContent(), 'rockets');
  // With a session, the bookmark's page opens the app; the generated archive remains as
  // a plain fallback without the old add-on scripts.
  await page.goto(origin + '/');
  await page.waitForURL(origin + '/app/');
  await page.goto(origin + '/app/?query=rockets');
  await page.locator('.tweet').first().waitFor();
  // Clearing restores everything; scrolling loads more.
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.waitForFunction(() => document.querySelector('.tweet')?.id === 'tweet-1000');
  await page.locator('.tweet').nth(49).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.tweet').length === 100);
  // Rich content in the newest tweet.
  const first = page.locator('#tweet-1000');
  assert.ok(await first.locator('.tweet-text .clamped').count());
  await first.getByRole('button', { name: 'Show more' }).click();
  assert.equal(await first.locator('.tweet-text .clamped').count(), 0);
  assert.equal(await first.locator('a[href="https://example.com/page"]').count(), 1);
  assert.equal(await first.locator('a[href="https://x.com/someone"]').count(), 1);
  await page.waitForFunction(() => [...document.querySelectorAll('#tweet-1000 img[src="/archive/media/photo.png"]')].length === 2 &&
    [...document.querySelectorAll('#tweet-1000 img[src="/archive/media/photo.png"]')].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await first.locator('.quote-card .quote-text').textContent(), 'Quoted words');
  // X's escaped characters show as themselves.
  assert.match(await page.locator('#tweet-1004 .tweet-text').textContent(), /bread & 1 < 2 > 0$/);
  // Articles open in the app, with their formatting and downloaded images.
  await first.locator('.article-card').click();
  await page.waitForURL(origin + '/app/article/1000');
  const article = page.locator('article.article');
  await article.locator('h1', { hasText: 'An article title' }).waitFor();
  assert.equal(await article.locator('h2').textContent(), 'First section');
  assert.equal(await article.locator('strong').first().textContent(), 'Bold');
  assert.equal(await article.locator('a[href="https://example.com/a"]').textContent(), 'link');
  assert.match(await article.locator('p').nth(1).textContent(), /^Bold start & a link$/);
  assert.equal(await article.locator('ul li').count(), 2);
  assert.equal(await article.locator('pre code').textContent(), 'ls -la');
  await page.waitForFunction(() => [...document.querySelectorAll('article.article img')].length === 2 &&
    [...document.querySelectorAll('article.article img')].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await article.locator('figcaption').textContent(), 'A chart');
  await article.getByRole('link', { name: 'View the embedded post' }).click();
  await page.waitForURL(origin + '/app/tweet/1001');
  await page.goBack();
  await page.goBack();
  await page.locator('.timeline #tweet-1000').waitFor();
  await page.locator('.tweet').nth(49).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.tweet').length === 100);
  // Links to the old article pages still arrive there.
  const oldLink = await page.request.get(origin + '/archive/articles/1000.html', { maxRedirects: 0 });
  assert.equal(oldLink.headers().location, '/app/article/1000');
  // Translation shows progress, then the English text with a toggle back to the original.
  const french = page.locator('#tweet-1002');
  await french.scrollIntoViewIfNeeded();
  await french.getByText('Translating…').waitFor();
  await french.getByRole('button', { name: 'Translated from French · Show original' }).click();
  await french.getByText('Je voudrais présenter').waitFor();
  await french.getByRole('button', { name: 'Show English translation' }).click();
  assert.match(await french.locator('.tweet-text .text').textContent(), /^Translated sentence\./);
  // Related opens in the sidebar, follows neighbors with Back, and closes.
  await first.getByRole('button', { name: 'Related' }).click();
  const sidebar = page.locator('.related-sidebar');
  await sidebar.locator('#tweet-1001').waitFor();
  assert.equal(await sidebar.locator('.tweet').count(), 2);
  // Every action fits inside its tweet; a narrow sidebar shows icons only.
  const actionsFit = () => page.evaluate(() => [...document.querySelectorAll('.actions')].every(row => {
    const right = row.closest('.tweet-body').getBoundingClientRect().right + 0.5;
    return [...row.children].every(action => action.getBoundingClientRect().right <= right);
  }));
  const labelsShown = selector => page.locator(selector + ' .action-label').first().isVisible();
  assert.ok(await actionsFit());
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.related-sidebar .action-label')).display === 'none');
  assert.ok(await actionsFit());
  assert.ok(await labelsShown('.timeline'));
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.waitForFunction(() => document.querySelector('.related-sidebar').getBoundingClientRect().width === 450);
  assert.ok(await actionsFit() && await labelsShown('.related-sidebar'));
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.ok(page.url().includes('related=1000'));
  await sidebar.locator('#tweet-1001').getByRole('button', { name: 'Related' }).click();
  await sidebar.locator('#tweet-1003').waitFor();
  await sidebar.getByRole('button', { name: 'Back' }).click();
  await sidebar.locator('#tweet-1002').waitFor();
  await sidebar.getByRole('button', { name: 'Close related' }).click();
  await page.getByText('to see similar likes here').waitFor();
  // Remove asks first, then drops the tweet here and from the served archive.
  const target = page.locator('.timeline #tweet-1003');
  await target.getByRole('button', { name: 'Remove' }).click();
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Cancel');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await target.count(), 1);
  await target.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await page.locator('.toast', { hasText: 'Removed from your archive' }).waitFor();
  assert.equal(await target.count(), 0);
  assert.equal(purges, 1);
  assert.match(await page.locator('.status').textContent(), /from 119 tweets/);
  // Dates and permalinks open the tweet's own page, with related likes alongside.
  await page.locator('.timeline #tweet-1000 .date').click();
  await page.waitForURL(origin + '/app/tweet/1000');
  await page.locator('.related-sidebar #tweet-1001').waitFor();
  assert.equal(await page.locator('.timeline .tweet').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Close related' }).count(), 0);
  assert.equal(await page.locator('.timeline #tweet-1000 a.action', { hasText: 'Permalink' }).getAttribute('href'), '/tweet/1000');
  await page.goBack();
  await page.locator('.timeline #tweet-1000').waitFor();
  // The archive data arrives compressed.
  assert.equal((await page.request.get(origin + '/archive/tweets.json')).headers()['content-encoding'], 'gzip');
  await page.reload();
  await page.locator('.status', { hasText: 'from 119 tweets' }).waitFor();
  // An author's name opens Likes filtered to them, from any tweet, and Back returns.
  await page.goto(origin + '/app/tweet/1005');
  await page.locator('.related-sidebar #tweet-1006 .display-name').click();
  await page.waitForURL(origin + '/app/?author=author0');
  await page.locator('.status', { hasText: 'of 39 (by @author0) from 119 tweets' }).waitFor();
  await page.goBack();
  await page.waitForURL(origin + '/app/tweet/1005');
  await page.locator('.timeline #tweet-1005 .handle').click();
  await page.locator('.status', { hasText: 'of 40 (by @author2) from 119 tweets' }).waitFor();
  await page.goto(origin + '/app/');
  await page.locator('.status', { hasText: 'from 119 tweets' }).waitFor();
  // Author, year/month and sort controls; the URL keeps the view.
  await page.locator('.tweet .handle', { hasText: '@author1' }).first().click();
  await page.locator('.status', { hasText: 'of 40 (by @author1)' }).waitFor();
  await page.getByLabel('Year').selectOption('2025');
  await page.getByLabel('Month').selectOption('2');
  await page.locator('.status', { hasText: '(from Feb 2025, by @author1)' }).waitFor();
  await page.getByLabel('Order').selectOption('asc');
  await page.reload();
  await page.locator('.status', { hasText: '(from Feb 2025, by @author1)' }).waitFor();
  assert.ok(page.url().includes('sort=asc'));
  // Theme persists across reloads.
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByLabel('Toggle theme').click();
  await page.reload();
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), before);
  // Explore searches by meaning and shows a tweet's neighborhood with copyable note links.
  await page.getByRole('link', { name: 'Explore' }).click();
  await page.waitForURL(origin + '/app/explore');
  await page.locator('.timeline .tweet').first().waitFor();
  assert.equal(await page.getByRole('link', { name: 'Explore' }).getAttribute('aria-current'), 'page');
  await page.locator('.status', { hasText: 'Semantic index ready.' }).waitFor();
  await page.getByLabel('Search by meaning').fill('rockets');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('.section-title', { hasText: 'Related by meaning' }).waitFor();
  assert.equal(await page.locator('.timeline .tweet').first().getAttribute('id'), 'tweet-1001');
  assert.deepEqual(searches.at(-1), ['rockets', '']);
  const result = page.locator('.timeline .tweet').first();
  const resultId = (await result.getAttribute('id')).slice(6);
  await result.getByRole('button', { name: 'Related' }).click();
  await page.waitForURL(origin + '/app/explore/tweet/' + resultId + '?q=rockets');
  await page.locator('.neighborhood h2', { hasText: 'Rockets and bread' }).waitFor();
  // Neighbors are 1002 and 1003; 1003 was removed above, so the server leaves it out.
  assert.equal(await page.locator('.timeline .tweet:not(.full)').count(), 1);
  assert.equal(await page.locator('.explore-sidebar .result').count(), 4); // five matches minus removed 1003
  await page.getByRole('button', { name: 'Copy Org link' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.startsWith(`[[${origin}/knowledge/tweet/${resultId}][@`), copied);
  assert.ok(!copied.includes(config.token));
  await page.locator('.timeline .tweet:not(.full)').first().getByRole('button', { name: 'Related' }).click();
  await page.waitForURL(url => url.pathname !== '/app/explore/tweet/' + resultId && url.pathname.startsWith('/app/explore/tweet/'));
  await page.locator('.page-bar').getByRole('link', { name: 'Back' }).click();
  await page.waitForURL(origin + '/app/explore/tweet/' + resultId + '?q=rockets');
  // Updates shows the service status and starts the dashboard actions.
  await page.getByRole('link', { name: 'Updates' }).click();
  await page.locator('.status-card', { hasText: 'Up to date. Imported 0 new likes.' }).waitFor();
  await page.getByRole('button', { name: 'Update now' }).click();
  await page.getByRole('button', { name: 'Reconnect X' }).click();
  for (let i = 0; i < 20 && actions.length < 2; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(actions, ['update', 'connect']);
  await page.getByRole('link', { name: 'Likes' }).click();
  await page.locator('.timeline .tweet').first().waitFor();
  // Shuffled order: the seed in the address keeps the order on reload; Reshuffle picks a new one.
  await page.getByLabel('Order').selectOption('random');
  await page.waitForURL(/\/app\/\?sort=random&seed=\d+$/);
  await page.locator('.status', { hasText: 'from 119 tweets, shuffled' }).waitFor();
  const firstTen = () => page.locator('.timeline .tweet').evaluateAll(list => list.slice(0, 10).map(t => t.id).join());
  const shuffled = await firstTen();
  await page.reload();
  await page.locator('.timeline .tweet').first().waitFor();
  assert.equal(await firstTen(), shuffled);
  await page.getByRole('button', { name: 'Reshuffle' }).click();
  await page.waitForFunction(before => [...document.querySelectorAll('.timeline .tweet')].slice(0, 10).map(t => t.id).join() !== before, shuffled);
  // One at a time keeps the filters and the shuffled order.
  await page.getByLabel('Author').selectOption('author1');
  await page.locator('.status', { hasText: 'of 40 (by @author1) from 119 tweets, shuffled' }).waitFor();
  const [firstId, secondId, thirdId] = await page.locator('.timeline .tweet').evaluateAll(list => list.slice(0, 3).map(t => t.id));
  await page.getByRole('link', { name: 'One at a time' }).click();
  await page.waitForURL(/\/app\/random\?seed=\d+&author=author1$/);
  await page.locator('.random .status', { hasText: '1 of 40 (by @author1)' }).waitFor();
  assert.equal(await page.locator('.timeline .tweet').count(), 1);
  assert.equal(await page.locator('.timeline .tweet').getAttribute('id'), firstId);
  assert.equal(await page.getByRole('link', { name: 'Random' }).getAttribute('aria-current'), 'page');
  await page.locator('.related-sidebar .tweet').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Close related' }).count(), 0);
  await page.keyboard.press('ArrowRight');
  await page.locator('.timeline #' + secondId).waitFor();
  assert.ok(page.url().endsWith('&n=2'), page.url());
  await page.reload();
  await page.locator('.timeline #' + secondId).waitFor();
  await page.keyboard.press('ArrowLeft');
  await page.locator('.timeline #' + firstId).waitFor();
  assert.ok(await page.getByRole('button', { name: '← Previous' }).isDisabled());
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.locator('.timeline #' + secondId).waitFor();
  // The tweet's page and Back return to the same place in the shuffle.
  await page.locator('.timeline .tweet .date').click();
  await page.waitForURL(origin + '/app/tweet/' + secondId.slice(6));
  await page.goBack();
  await page.locator('.random #' + secondId).waitFor();
  // Removing the shown tweet moves on to the next one.
  await page.locator('.timeline .tweet').getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await page.locator('.timeline #' + thirdId).waitFor();
  await page.locator('.random .status', { hasText: '2 of 39 (by @author1)' }).waitFor();
  assert.equal(purges, 2);
  // A new shuffle starts over; clearing the filters shuffles all likes.
  await page.getByRole('button', { name: 'Reshuffle' }).click();
  await page.locator('.random .status', { hasText: /^1 of 39 \(by @author1\)$/ }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.locator('.random .status', { hasText: /^1 of 118$/ }).waitFor();
  assert.ok(!page.url().includes('author'));
  // Phone width keeps the layout inside the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await actionsFit() && await labelsShown('.timeline'));
  // On a phone, swiping moves through the shuffle, and Related opens over it.
  const swipe = dx => page.evaluate(dx => {
    const el = document.querySelector('main.random');
    for (const [type, x] of [['touchstart', 200], ['touchend', 200 + dx]]) {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 });
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
    }
  }, dx);
  await page.locator('.related-sidebar').waitFor({ state: 'detached' });
  await swipe(-120);
  await page.locator('.random .status', { hasText: /^2 of 118$/ }).waitFor();
  await swipe(120);
  await page.locator('.random .status', { hasText: /^1 of 118$/ }).waitFor();
  await page.locator('.timeline .tweet').getByRole('button', { name: 'Related' }).click();
  await page.locator('.related-overlay .tweet').first().waitFor();
  // Arrow keys belong to the open panel, not the shuffle.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.random .status').textContent(), '1 of 118');
  await page.getByRole('link', { name: 'Likes' }).click();
  await page.locator('.timeline .tweet').first().waitFor();
  // On a phone, Related covers the screen and Escape closes it.
  await page.locator('.timeline .tweet').first().getByRole('button', { name: 'Related' }).click();
  await page.locator('.related-overlay .tweet').first().waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.related-overlay').count(), 0);
  // The navigation becomes a bottom tab bar, and Explore fits the screen.
  const bar = await page.locator('.nav').boundingBox();
  assert.ok(bar.y + bar.height >= 840 && bar.width >= 380, JSON.stringify(bar));
  await page.goto(origin + '/app/explore/tweet/1005');
  await page.locator('.timeline .tweet:not(.full)').first().waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS: React app timeline, articles, shuffle, Random, related, translation, removal, tweet pages, Explore, Updates and phone layout.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
