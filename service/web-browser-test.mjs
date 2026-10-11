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
tweets[2].text = 'Je voudrais présenter mes nouvelles idées pour améliorer notre bibliothèque. Nous avons beaucoup de livres intéressants à partager avec tout le monde.';
await mkdir(path.join(root, 'archive/media'), { recursive: true });
await writeFile(path.join(root, 'archive/tweets.json'), JSON.stringify(tweets));
await writeFile(path.join(root, 'archive/media/photo.png'), png);
const port = 14328, origin = 'http://127.0.0.1:' + port;
// Neighbors are the next two tweets; the translator is a slow stand-in for the local model.
const knowledge = { rows: tweets, summary: () => ({ state: 'ready' }), search: async () => [],
  graph: id => { const i = tweets.findIndex(t => t.tweetId === id); return i < 0 ? null : { center: id, nodes: [i, i + 1, i + 2].map(n => ({ tweet: tweets[n % tweets.length] })), edges: [] }; } };
const translations = new Translations(root, path.join(root, '.service'), async () => { await new Promise(r => setTimeout(r, 800)); return 'Translated sentence.'; });
let purges = 0;
const { server, config } = await createApp({ root, stateDir: path.join(root, '.service'), publicOrigin: origin, schedule: false, knowledgeIndex: knowledge, translations,
  workerFactory: () => ({ busy: false, purge: async () => { purges++; } }) });
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
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
  assert.equal(await first.locator('.article-card').getAttribute('href'), '/archive/articles/1000.html');
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
  assert.equal(await page.locator('.timeline #tweet-1000 a.action', { hasText: 'Permalink' }).getAttribute('href'), '/tweet/1000');
  await page.goBack();
  await page.locator('.timeline #tweet-1000').waitFor();
  await page.reload();
  await page.locator('.status', { hasText: 'from 119 tweets' }).waitFor();
  // Author, year/month and sort controls; the URL keeps the view.
  await page.locator('.tweet .handle', { hasText: '@author1' }).first().click();
  await page.locator('.status', { hasText: 'of 40 (by @author1)' }).waitFor();
  await page.getByLabel('Year').selectOption('2025');
  await page.getByLabel('Month').selectOption('2');
  await page.locator('.status', { hasText: '(from Feb 2025, by @author1)' }).waitFor();
  await page.getByRole('button', { name: '↓ Newest' }).click();
  await page.reload();
  await page.locator('.status', { hasText: '(from Feb 2025, by @author1)' }).waitFor();
  assert.ok(page.url().includes('sort=asc'));
  // Theme persists across reloads.
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByLabel('Toggle theme').click();
  await page.reload();
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), before);
  // Phone width keeps the layout inside the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // On a phone, Related covers the screen and Escape closes it.
  await page.locator('.timeline .tweet').first().getByRole('button', { name: 'Related' }).click();
  await page.locator('.related-overlay .tweet').first().waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.related-overlay').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: React app unlocks, searches, filters, sorts, scrolls, renders, translates, relates and removes tweets.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
