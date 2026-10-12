import test from 'node:test';
import assert from 'node:assert/strict';
import { segments, groupBlocks } from './article.js';

test('splits article text into styled and linked runs', () => {
  const runs = segments('Read this now', [{ offset: 0, length: 9, style: 'bold' }], [{ offset: 5, length: 4, url: 'https://example.com' }]);
  assert.deepEqual(runs.map(r => [r.text, r.bold, r.href]), [['Read ', true, null], ['this', true, 'https://example.com'], [' now', false, null]]);
  assert.deepEqual(segments('plain').map(r => r.text), ['plain']);
  // Ranges past the end are clipped rather than breaking the text.
  assert.deepEqual(segments('ab', [{ offset: 1, length: 9, style: 'italic' }]).map(r => [r.text, r.italic]), [['a', false], ['b', true]]);
});

test('groups consecutive list items into lists', () => {
  const blocks = [{ type: 'ul', text: 'a' }, { type: 'ul', text: 'b' }, { type: 'p', text: 'c' }, { type: 'ol', text: 'd' }, { type: 'ul', text: 'e' }];
  assert.deepEqual(groupBlocks(blocks).map(g => [g.type, g.items?.length]), [['ul', 2], ['p', undefined], ['ol', 1], ['ul', 1]]);
});
