import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
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
