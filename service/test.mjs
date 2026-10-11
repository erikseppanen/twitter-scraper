import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp, equal } from './server.mjs';
import { selectNew, Worker } from './worker.mjs';

test('private archive gates all assets, enforces origin and blocks hidden files and symlinks', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'archive-test-'));
  await mkdir(path.join(root, 'archive'));
  await writeFile(path.join(root, 'archive/index.html'), 'private archive');
  await writeFile(path.join(root, 'archive/video.mp4'), '0123456789');
  await writeFile(path.join(root, 'archive/.tweet-cache.edn'), 'secret');
  await writeFile(path.join(root, 'outside.html'), 'secret');
  await symlink(path.join(root, 'outside.html'), path.join(root, 'archive/link.html'));
  let updates = 0;
  const origin = 'https://archive.example';
  const { server, config } = await createApp({ root, stateDir: path.join(root, '.service'), publicOrigin: origin, schedule: false,
    workerFactory: () => ({ busy: false, update: async () => { updates++; } }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const asset of ['/archive/', '/archive/video.mp4', '/archive/.tweet-cache.edn', '/api/status']) {
    assert.equal((await fetch(url + asset, { redirect: 'manual' })).status, asset.startsWith('/archive/') ? 302 : 401);
  }
  assert.equal((await fetch(url + '/session', { method: 'POST', body: JSON.stringify({ token: config.token }) })).status, 403);
  assert.equal((await fetch(url + '/session', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ token: 'wrong' }) })).status, 401);
  const login = await fetch(url + '/session', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ token: config.token }) });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict;.*Secure/);
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
  assert.equal(await (await fetch(url + '/archive/', { headers })).text(), 'private archive');
  for (const asset of ['/archive/.tweet-cache.edn', '/archive/link.html', '/archive/%2e%2e%2foutside.html']) assert.equal((await fetch(url + asset, { headers })).status, 404);
  const video = await fetch(url + '/archive/video.mp4', { headers: { ...headers, Range: 'bytes=2-5' } });
  assert.equal(video.status, 206); assert.equal(await video.text(), '2345');
  assert.equal((await fetch(url + '/api/update', { method: 'POST', headers })).status, 403);
  assert.equal((await fetch(url + '/api/update', { method: 'POST', headers: { ...headers, Origin: origin } })).status, 202);
  assert.equal(updates, 1);
});
test('deduplication uses IDs, including older tweets liked recently', () => {
  assert.deepEqual(selectNew(['12', '2', '12', 'bogus', '30'], new Set(['30'])), ['12', '2']);
  assert.equal(equal('é', 'a'), false);
});
test('failed browser connection preserves baseline and schedules retry', async () => {
  const state = { baseline: '123', lastSuccess: 'before' };
  const worker = new Worker('/unused', '/unused', async () => {}, state);
  worker.browser = async () => { throw new Error('Reconnect X'); };
  await worker.update();
  assert.equal(state.baseline, '123'); assert.equal(state.lastSuccess, 'before');
  assert.equal(state.running, false); assert.equal(worker.busy, false);
  assert.equal(state.error, 'Reconnect X'); assert.ok(Date.parse(state.nextRun) > Date.now());
});

test('normal Chrome login pauses updates, closes only its child, and resumes only after verification', async () => {
  const { EventEmitter } = await import('node:events');
  const state = {};
  const worker = new Worker('/unused', '/unused', async () => {}, state);
  const child = new EventEmitter();
  worker.closeLogin = async target => { assert.equal(target, child); child.emit('exit', 0); };
  worker.launchLogin = async () => child;
  await worker.connect();
  assert.equal(state.paused, true); assert.equal(state.loginPending, true);
  assert.equal(worker.busy, true);
  let checked = false;
  worker.update = async () => { checked = true; assert.equal(worker.login, null); assert.equal(state.paused, true); };
  await worker.finish();
  assert.equal(checked, true);
  assert.equal(state.paused, true);
});

test('failed normal Chrome launch leaves automatic checks paused', async () => {
  const state = {};
  const worker = new Worker('/unused', '/unused', async () => {}, state);
  worker.launchLogin = async () => { throw new Error('Chrome could not open'); };
  await assert.rejects(worker.connect(), /Chrome could not open/);
  assert.equal(state.paused, true); assert.equal(worker.busy, false);
});

test('removing a tweet hides it at once, keeps it out of updates, and starts a purge', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'archive-remove-'));
  await mkdir(path.join(root, 'archive/tweets'), { recursive: true });
  await mkdir(path.join(root, 'archive/media'));
  await writeFile(path.join(root, 'archive/index.html'), '<html><head></head><body><script>window.TWEET_DATA = [];</script></body></html>');
  await writeFile(path.join(root, 'archive/tweets.json'), JSON.stringify([{ tweetId: '10' }, { tweetId: '20' }]));
  for (const file of ['tweets/10.html', 'tweets/20.html', 'media/10_0.jpg']) await writeFile(path.join(root, 'archive', file), 'x');
  let purges = 0;
  const origin = 'https://archive.example', stateDir = path.join(root, '.service');
  const worker = { busy: false, update: async () => {}, purge: async () => { purges++; } };
  const { server, config, state } = await createApp({ root, stateDir, publicOrigin: origin, schedule: false, workerFactory: () => worker });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(url + '/session', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ token: config.token }) });
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
  const remove = (id, extra = { Origin: origin }) => fetch(url + '/api/remove', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ id }) });
  assert.equal((await remove('10', {})).status, 403);
  assert.equal((await remove('../10')).status, 400);
  assert.equal((await remove('10')).status, 202);
  assert.equal(purges, 1); assert.equal(state.removalPending, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(stateDir, 'removed.json'), 'utf8')), ['10']);
  assert.deepEqual(await (await fetch(url + '/archive/tweets.json', { headers })).json(), [{ tweetId: '20' }]);
  for (const file of ['tweets/10.html', 'media/10_0.jpg']) assert.equal((await fetch(url + '/archive/' + file, { headers })).status, 404);
  assert.equal((await fetch(url + '/archive/tweets/20.html', { headers })).status, 200);
  const index = await (await fetch(url + '/archive/', { headers })).text();
  assert.match(index, /new Set\(\["10"\]\).*<\/head>/); assert.match(index, /archive-remove\.js/);
});

test('purge publishes only a staged archive without the removed tweets', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'archive-purge-'));
  t.after(() => rm(root, { recursive: true }));
  await mkdir(path.join(root, 'archive'));
  const tweets = () => readFile(path.join(root, 'archive/tweets.json'), 'utf8').then(JSON.parse);
  await writeFile(path.join(root, 'archive/tweets.json'), JSON.stringify([{ tweetId: '10' }, { tweetId: '20' }]));
  const state = { removalPending: true, error: 'Reconnect X', message: 'Reconnect X' };
  const worker = new Worker(root, root, async () => {}, state);
  worker.removed = new Set(['10']);
  worker.clojure = async () => {};
  await worker.purge();
  assert.equal(state.removalPending, true); assert.match(state.message, /retrying/);
  assert.deepEqual((await tweets()).map(t => t.tweetId), ['10', '20']);
  worker.clojure = async args => writeFile(path.join(args.at(-1), 'tweets.json'), JSON.stringify([{ tweetId: '20' }]));
  await worker.purge();
  assert.equal(state.removalPending, false); assert.equal(state.message, 'Reconnect X'); assert.equal(worker.busy, false);
  assert.deepEqual((await tweets()).map(t => t.tweetId), ['20']);
  assert.equal(await readFile(path.join(root, 'removed.txt'), 'utf8'), '10');
});
