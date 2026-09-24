import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { KnowledgeIndex } from './knowledge.mjs';
import { createApp } from './server.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'knowledge-browser-'));
const tweets = [
  ['1', 'Neural networks and machine learning are transforming software development.'],
  ['2', 'Artificial intelligence and machine learning can help programmers write and review computer code.'],
  ['3', 'The best sourdough bread needs a healthy starter and a long fermentation.'],
  ['4', 'Baking homemade loaves is about flour, water, yeast, and patience.'],
  ['5', 'Astronauts aboard the space station watch Earth from orbit.'],
  ['6', 'Rockets carry satellites beyond our atmosphere to explore the solar system.'],
].map(([tweetId, text]) => ({ tweetId, text, user: { name: 'Example author', screenName: 'example' }, createdAt: '2026-01-01T00:00:00Z' }));
await mkdir(path.join(root, 'archive/tweets'), { recursive: true });
await writeFile(path.join(root, 'archive/tweets.json'), JSON.stringify(tweets));
await writeFile(path.join(root, 'archive/index.html'), '<html><body><article id="tweet-1"><footer></footer></article></body></html>');
for (const tweet of tweets) await writeFile(path.join(root, 'archive/tweets', tweet.tweetId + '.html'), '<html><body>Fixture</body></html>');
// Model weights are reusable and private; no fixture text is sent to the model host.
const stateDir = path.resolve('.service/knowledge-test');
const knowledge = new KnowledgeIndex(root, stateDir);
await knowledge.refresh();
assert.equal(knowledge.status.state, 'ready', knowledge.status.error);
assert.equal(knowledge.graph('1').nodes[1].tweet.tweetId, '2');
assert.ok(['3', '4'].includes((await knowledge.search('How do I make a loaf at home?'))[0].tweet.tweetId));
console.log('PASS: real local embeddings rank paraphrases and related tweets.');
const port = 14329, origin = 'http://127.0.0.1:' + port;
const { server, config } = await createApp({ root, stateDir: path.join(root, '.service'), publicOrigin: origin, schedule: false, knowledgeIndex: knowledge });
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/knowledge/tweet/1');
  assert.ok(page.url().includes('?next='));
  await page.goto(origin + '/#' + config.token);
  await page.waitForURL('**/knowledge/tweet/1');
  await page.locator('#detail .body').waitFor();
  assert.equal(await page.locator('#detail > time').getAttribute('datetime'), '2026-01-01T00:00:00.000Z');
  assert.match(await page.locator('#detail > time').innerText(), /202[56].*ago/);
  assert.ok(await page.locator('#results .result time').count() > 0);
  assert.notEqual(await page.locator('#neighborhood-title').innerText(), 'Choose an idea to explore');
  assert.ok(await page.locator('#neighborhood-themes .badge').count() > 0);
  await page.getByRole('button', { name: 'Copy Org link', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /\[\[http:\/\/127\.0\.0\.1:14329\/knowledge\/tweet\/1\]\[/);
  assert.ok(!copied.includes(config.token));
  await page.locator('#graph .node').nth(1).click();
  await page.waitForURL('**/knowledge/tweet/2');
  await page.goBack();
  await page.waitForURL('**/knowledge/tweet/1');
  await page.getByLabel('Explore an idea').fill('How do I make a loaf at home?');
  await page.getByRole('button', { name: 'Search by meaning', exact: true }).click();
  await page.waitForFunction(() => /bread|loaves/.test(document.querySelector('#results .result')?.textContent));
  await page.locator('#results .result').first().click();
  await page.waitForFunction(() => /bread|loaves/.test(document.querySelector('#detail .body')?.textContent));
  await page.screenshot({ path: '.service/knowledge-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.service/knowledge-mobile.png', fullPage: true });
  await page.goto(origin + '/archive/');
  const relatedLink = page.getByRole('link', { name: 'Related ↗', exact: true });
  await relatedLink.click();
  await page.waitForURL('**/tweet/1');
  await page.locator('.related-card').first().waitFor();
  assert.equal(await page.locator('.related-card').first().getAttribute('data-tweet-id'), '1');
  await page.getByRole('link', { name: 'Related →', exact: true }).first().click();
  await page.locator('.related-card').first().waitFor();
  assert.notEqual(await page.locator('.related-card').first().getAttribute('data-tweet-id'), '1');
  await page.goBack();
  await page.waitForURL('**/tweet/1');
  await page.locator('.related-card').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Copy link', exact: true }).first().click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), origin + '/tweet/1');
  await page.reload();
  await page.locator('.related-card').first().waitFor();
  assert.equal(await page.locator('.related-card').first().getAttribute('data-tweet-id'), '1');
  await page.getByRole('link', { name: '← Back to timeline', exact: true }).click();
  await page.waitForURL('**/archive/');
  assert.deepEqual(errors, []);
  console.log('PASS: authentication return, deep links, Org clipboard, graph navigation, back, semantic search, mobile layout, archive integration.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true }); }
