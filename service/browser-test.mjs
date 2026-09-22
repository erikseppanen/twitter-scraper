import { chromium } from 'playwright';
import { createApp } from './server.mjs';
import { Worker } from './worker.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = await mkdtemp(path.join(os.tmpdir(), 'archive-ui-'));
await mkdir(path.join(root, 'archive'));
await writeFile(path.join(root, 'archive/index.html'), '<h1>Test archive</h1>');
const { server, config } = await createApp({ root, stateDir: path.join(root, '.service'), publicOrigin: 'http://127.0.0.1:14318', schedule: false, workerFactory: state => ({ busy: false, update: async () => { state.message = 'Test update completed'; } }) });
await new Promise(resolve => server.listen(14318, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:14318/#' + config.token);
  await page.getByRole('button', { name: 'Update now', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  await page.getByRole('button', { name: 'Update now', exact: true }).click();
  await page.getByText('Test update completed', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Browse archive' }).click();
  await page.getByRole('heading', { name: 'Test archive' }).waitFor();
  await writeFile(path.join(root, 'archive/tweets.json'), JSON.stringify([{tweetId:'12'},{tweetId:'11'},{tweetId:'10'}]));
  const state = { baseline: '10' };
  const worker = new Worker(root, path.join(root, '.service'), async () => {}, state);
  worker.browser = async () => {
    const context = await browser.newContext();
    await context.route('https://x.com/**', async route => {
      const html = route.request().url().endsWith('/likes')
        ? ['12','11','10'].map(id => `<article data-testid="tweet"><a href="/quoted/status/999">Quoted link</a><a href="/owner/status/${id}"><time>Today</time></a></article>`).join('')
        : '<a data-testid="AppTabBar_Profile_Link" href="/owner">Profile</a>';
      await route.fulfill({ contentType: 'text/html', body: html });
    });
    return context;
  };
  await worker.update();
  assert.equal(state.error, null);
  assert.equal(state.baseline, '12');
  assert.ok(state.lastSuccess);
  assert.equal(state.message, 'Up to date. Imported 0 new likes.');
  console.log('PASS: browser collection uses timestamp links, ignores quoted links, and stops at the saved like-order cutoff');
  console.log('PASS: private-link exchange, fragment removal, update button, archive navigation in Chrome');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true });
}
