import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, parseJSON } from './api.js';

test('decodes the entities X escapes in tweet text, once', () => {
  assert.equal(decodeEntities('a &gt; b &lt; c &amp; d'), 'a > b < c & d');
  // An escaped entity becomes the literal text, not a second character.
  assert.equal(decodeEntities('&amp;gt; &quot;'), '&gt; &quot;');
  const data = parseJSON(JSON.stringify([{ text: '1 &lt; 2', url: 'https://a.example/?x=1&amp;y=2', quote: { text: 'Q&amp;A' }, article: { title: 'A &gt; B', previewText: '&amp;' } }]));
  assert.equal(data[0].text, '1 < 2');
  assert.equal(data[0].url, 'https://a.example/?x=1&amp;y=2');
  assert.equal(data[0].quote.text, 'Q&A');
  assert.deepEqual(data[0].article, { title: 'A > B', previewText: '&' });
});
