import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, buildIndex, keywordSearch, fuse, highlight } from './search.js';

const tweets = [
  { tweetId: '1', text: 'The price of Bitcoin keeps climbing', user: { name: 'Sam', screenName: 'sam' } },
  { tweetId: '2', text: 'Bitcoin bitcoin bitcoins everywhere', user: { name: 'Lee', screenName: 'lee' } },
  { tweetId: '3', text: 'Start the art show at the Café', user: { name: 'Ana', screenName: 'ana' } },
  { tweetId: '4', text: 'Worth reading', user: { name: 'Kim', screenName: 'kim' }, quote: { text: 'A history of sourdough bread' } },
  { tweetId: '5', text: 'Bread prices and bitcoin prices', user: { name: 'Bo', screenName: 'breadmaker' }, article: { title: 'Price of bread' } },
];
const index = buildIndex(tweets);
const ids = query => keywordSearch(index, parseQuery(query)).map(t => t.tweetId);

test('parses words and quoted phrases, dropping common words', () => {
  assert.deepEqual(parseQuery('How to bake "Sourdough Bread" at home'), { words: ['bake', 'home'], phrases: ['sourdough bread'] });
  assert.deepEqual(parseQuery('the'), { words: ['the'], phrases: [] });
  assert.deepEqual(parseQuery('#Bitcoin @Sam'), { words: ['bitcoin', 'sam'], phrases: [] });
});

test('matches every word in any order, by whole word or word start', () => {
  assert.deepEqual(ids('bitcoin price').sort(), ['1', '5']);
  assert.deepEqual(ids('art'), ['3']); // not "start"
  assert.deepEqual(ids('cafe'), ['3']); // accents ignored
  assert.deepEqual(ids('sourdough'), ['4']); // quoted tweets are searched
  assert.deepEqual(ids('breadmaker'), ['5']); // so are handles
  assert.deepEqual(ids('"price of bitcoin"'), ['1']);
  assert.deepEqual(ids('bitcoin nothing'), []);
});

test('ranks by BM25: more and rarer matches first', () => {
  assert.equal(ids('bitcoin')[0], '2');
  assert.equal(ids('bread')[0], '5');
});

test('fuses keyword and meaning rankings and says why each matched', () => {
  const byId = new Map(tweets.map(t => [t.tweetId, t]));
  const fused = fuse([tweets[1], tweets[0]], ['4', '1', 'gone'], byId);
  assert.deepEqual(fused.map(r => [r.tweet.tweetId, r.why]), [['1', 'both'], ['2', 'keyword'], ['4', 'meaning']]);
});

test('highlights words, word starts and phrases', () => {
  const marked = (text, query) => highlight(text, query).filter(p => p.match).map(p => p.text);
  assert.deepEqual(marked('Bitcoins, the bitcoin price', 'bitcoin'), ['Bitcoins', 'bitcoin']);
  assert.deepEqual(marked('Start the art show', 'art'), ['art']);
  assert.deepEqual(marked('The price of Bitcoin', '"price of bitcoin"'), ['price of Bitcoin']);
  assert.deepEqual(highlight('Plain', ''), [{ text: 'Plain', match: false }]);
});
