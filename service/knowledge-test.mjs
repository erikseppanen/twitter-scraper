import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { KnowledgeIndex, contentOf, chunks } from './knowledge.mjs';
import { createApp } from './server.mjs';

test('incremental semantic index includes quotes, ignores links, ranks neighbors, and removes deleted records', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'knowledge-'));
  t.after(() => rm(root, { recursive: true }));
  await mkdir(path.join(root, 'archive'));
  const file = path.join(root, 'archive/tweets.json');
  let calls = [];
  const embed = async text => { calls.push(text); return /space|orbit|stars/.test(text) ? [1, 0] : [0, 1]; };
  const tweets = [{ tweetId: '1', text: 'space travel' }, { tweetId: '2', text: 'A quotation', quote: { text: 'orbit among stars' } }, { tweetId: '3', text: 'baking bread' }, { tweetId: '4', text: 'https://t.co/abc' }];
  await writeFile(file, JSON.stringify(tweets));
  const index = new KnowledgeIndex(root, path.join(root, '.service'), embed);
  await index.refresh();
  assert.equal(index.status.state, 'ready');
  // Only matches near the best one are kept: bread scores 0 against "orbit".
  assert.deepEqual((await index.search('orbit')).map(r => r.tweetId), ['1', '2']);
  assert.deepEqual(await index.search('  '), []);
  assert.deepEqual(index.related('1').map(r => r.tweetId), ['2']);
  assert.equal(index.related('missing'), null);
  assert.equal(index.related('4'), null, 'link-only tweets have nothing to compare');
  assert.match(contentOf(tweets[1]), /orbit/);
  assert.equal(contentOf({ text: 'Read this https://t.co/abc now' }), 'Read this now');
  calls = [];
  const restarted = new KnowledgeIndex(root, path.join(root, '.service'), embed);
  await restarted.refresh();
  assert.ok(!calls.includes('space travel'), 'unchanged tweet embeddings survive restart');
  await writeFile(file, JSON.stringify([{ ...tweets[0], text: 'changed text' }, tweets[2]]));
  await restarted.refresh();
  assert.ok(calls.includes('changed text'));
  assert.equal(restarted.related('2'), null);
  assert.ok(chunks('word '.repeat(900)).length > 1);
});

test('knowledge routes protect data, deep links preserve destination, and assets cannot escape', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'knowledge-http-'));
  const knowledge = { rows: [{ tweetId: '1' }], summary: () => ({ state: 'ready' }), search: async () => [], related: id => id === '1' ? [] : null };
  const { server, config } = await createApp({ root, stateDir: path.join(root, '.service'), publicOrigin: 'https://archive.example', schedule: false, knowledgeIndex: knowledge });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true }); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(origin + '/api/knowledge/search?q=private')).status, 401);
  const redirect = await fetch(origin + '/knowledge/tweet/1', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/?next=%2Fknowledge%2Ftweet%2F1');
  const headers = { Cookie: '__Host-archive=' + config.token };
  // Saved note links and old Explore addresses open the tweet, or the search, in Likes.
  for (const [from, to] of [['/knowledge/tweet/1', '/app/tweet/1'], ['/knowledge', '/app/'], ['/tweet/1', '/app/tweet/1'],
    ['/app/explore/tweet/1?q=bread', '/app/tweet/1'], ['/app/explore?q=sour+dough', '/app/?query=sour+dough'], ['/app/explore', '/app/']]) {
    const response = await fetch(origin + from, { headers, redirect: 'manual' });
    assert.equal(response.status, 302); assert.equal(response.headers.get('location'), to);
  }
  assert.equal((await fetch(origin + '/api/knowledge/related?id=1', { headers })).status, 200);
  assert.equal((await fetch(origin + '/api/knowledge/related?id=9', { headers })).status, 404);
  assert.equal((await fetch(origin + '/api/knowledge/search?q=' + 'a'.repeat(2001), { headers })).status, 400);
  assert.equal((await fetch(origin + '/archive/.service/knowledge.json', { headers })).status, 404);
});
