import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTweets, sortTweets, shuffleTweets, parseSeed, describeFilters, facets, tokenize, highlight, mediaSource } from './tweets.js';

const tweets = [
  { tweetId: '1', text: 'Sourdough bread', createdAt: '2024-03-05T12:00:00Z', user: { name: 'Baker', screenName: 'baker' } },
  { tweetId: '2', text: 'Rockets', createdAt: '2025-07-01T12:00:00Z', user: { name: 'Space', screenName: 'space' }, article: { title: 'Orbit guide' } },
  { tweetId: '3', text: 'Undated', user: { name: 'Baker', screenName: 'baker' } },
];

test('filters by text, article title, author, year and month', () => {
  assert.deepEqual(filterTweets(tweets, { query: 'BREAD' }).map(t => t.tweetId), ['1']);
  assert.deepEqual(filterTweets(tweets, { query: 'orbit' }).map(t => t.tweetId), ['2']);
  assert.deepEqual(filterTweets(tweets, { author: 'baker' }).map(t => t.tweetId), ['1', '3']);
  assert.deepEqual(filterTweets(tweets, { year: '2024', month: '3' }).map(t => t.tweetId), ['1']);
  assert.deepEqual(filterTweets(tweets, { month: '7' }).map(t => t.tweetId), ['2']);
});

test('sorts by date with undated tweets last', () => {
  assert.deepEqual(sortTweets(tweets, 'desc').map(t => t.tweetId), ['2', '1', '3']);
  assert.deepEqual(sortTweets(tweets, 'asc').map(t => t.tweetId), ['1', '2', '3']);
});

test('counts authors, years and months', () => {
  const f = facets(tweets);
  assert.deepEqual(f.authors, [['baker', 2], ['space', 1]]);
  assert.deepEqual(f.years, [['2025', 1], ['2024', 1]]);
  assert.equal(f.monthCount('2024', 3), 1);
  assert.equal(f.monthCount('2024', 4), 0);
});

test('links URLs, mentions and hashtags and highlights matches', () => {
  assert.deepEqual(tokenize('Hi @ann see https://a.example/x #tag!').map(p => [p.type, p.text]),
    [['text', 'Hi '], ['link', '@ann'], ['text', ' see '], ['link', 'https://a.example/x'], ['text', ' '], ['link', '#tag'], ['text', '!']]);
  assert.deepEqual(highlight('Bread and bread', 'BREAD').map(p => p.match), [true, false, true]);
  assert.equal(mediaSource({ localPath: 'a b.jpg', url: 'https://x/y' }), '/archive/media/a%20b.jpg');
});

test('shuffles the same way for a seed and keeps the order when tweets are removed', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ tweetId: String(5000 + i) }));
  const ids = list => list.map(t => t.tweetId);
  const once = ids(shuffleTweets(many, 42));
  assert.deepEqual(ids(shuffleTweets(many.slice().reverse(), 42)), once);
  assert.deepEqual(once.slice().sort(), ids(many));
  assert.notDeepEqual(once, ids(many));
  assert.notDeepEqual(ids(shuffleTweets(many, 43)), once);
  assert.deepEqual(ids(shuffleTweets(many.filter(t => t.tweetId !== once[5]), 42)), once.filter(id => id !== once[5]));
  assert.equal(parseSeed('123'), 123);
  for (const bad of ['', '0', '01', 'x', '1234567890']) assert.equal(parseSeed(bad), null);
  assert.equal(describeFilters({ query: ' bread ', year: '2024', month: '3', author: 'baker' }), ' (from Mar 2024, by @baker, matching "bread")');
});
