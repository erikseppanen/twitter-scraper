// One search over two signals: keywords, ranked here with BM25, and meaning, from the
// semantic index on the Mini. The two rankings are merged with reciprocal rank fusion.

const STOP = new Set(('a an and are as at be but by can do does for from had has have how i if in into is it its ' +
  'me my no not of on or our so than that the their them then there these they this to too up us was we were what when ' +
  'where which who why will with would you your').split(' '));
const WORD = /[\p{L}\p{N}]+/gu;
// Rank fusion constant: the usual 60 keeps one list's top results from drowning the other's.
const FUSION = 60;

// Lowercase without accents, so "cafe" finds "Café".
export const fold = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

// Words and "quoted phrases". Common words are dropped unless they are all there is.
export function parseQuery(query = '') {
  const phrases = [], words = [];
  const rest = query.replace(/"([^"]+)"/g, (_, phrase) => {
    const folded = (fold(phrase).match(WORD) || []).join(' ');
    if (folded) phrases.push(folded);
    return ' ';
  });
  for (const word of fold(rest).match(WORD) || []) if (!words.includes(word)) words.push(word);
  const meaningful = words.filter(word => !STOP.has(word));
  return { words: meaningful.length ? meaningful : words, phrases };
}

// Short words must match exactly; longer ones also match words they begin, so
// "bitcoin" finds "bitcoins" but "art" does not find "start".
export const matchesWord = (word, term) => term.length < 3 ? word === term : word.startsWith(term);

export function searchText(tweet) {
  const user = tweet.user || {}, quote = tweet.quote || {};
  return [tweet.text, user.name, user.screenName, tweet.article?.title, tweet.article?.previewText,
    quote.text, quote.user?.name, quote.user?.screenName, quote.article?.title, quote.article?.previewText].filter(Boolean).join('\n');
}

// An inverted index over every tweet's words, built once per archive.
export function buildIndex(tweets) {
  const postings = new Map(), docs = [];
  let total = 0;
  tweets.forEach((tweet, doc) => {
    const words = fold(searchText(tweet)).match(WORD) || [];
    docs.push({ tweet, length: words.length, text: ' ' + words.join(' ') + ' ' });
    total += words.length;
    const counts = new Map();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    for (const [word, count] of counts) {
      if (!postings.has(word)) postings.set(word, []);
      postings.get(word).push([doc, count]);
    }
  });
  return { docs, postings, vocabulary: [...postings.keys()], average: total / (docs.length || 1) };
}

// Tweets containing every word and phrase, best first by BM25.
export function keywordSearch(index, { words, phrases }) {
  if (!words.length && !phrases.length) return [];
  const { docs, postings, vocabulary, average } = index;
  const n = docs.length, scores = new Map(), hits = new Map();
  const add = (doc, idf, tf) => {
    const { length } = docs[doc];
    scores.set(doc, (scores.get(doc) || 0) + idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length / average)));
    hits.set(doc, (hits.get(doc) || 0) + 1);
  };
  for (const term of words) {
    const tf = new Map();
    for (const word of vocabulary) {
      if (!matchesWord(word, term)) continue;
      for (const [doc, count] of postings.get(word)) tf.set(doc, (tf.get(doc) || 0) + count);
    }
    const idf = Math.log(1 + (n - tf.size + 0.5) / (tf.size + 0.5));
    for (const [doc, count] of tf) add(doc, idf, count);
  }
  for (const phrase of phrases) {
    const matched = docs.map((d, doc) => d.text.includes(' ' + phrase + ' ') ? doc : -1).filter(doc => doc >= 0);
    const idf = Math.log(1 + (n - matched.length + 0.5) / (matched.length + 0.5));
    for (const doc of matched) add(doc, idf * 2, 1);
  }
  const needed = words.length + phrases.length;
  return [...scores].filter(([doc]) => hits.get(doc) === needed)
    .sort((a, b) => b[1] - a[1]).map(([doc]) => docs[doc].tweet);
}

// Merge the keyword ranking with the meaning ranking (tweet IDs, best first).
// Each result records why it matched: 'keyword', 'meaning' or 'both'.
export function fuse(keyword, meaning, byId) {
  const results = new Map();
  const add = (tweet, rank, kind) => {
    const entry = results.get(tweet.tweetId) || { tweet, score: 0, why: kind };
    entry.score += 1 / (FUSION + rank + 1);
    if (entry.why !== kind) entry.why = 'both';
    results.set(tweet.tweetId, entry);
  };
  keyword.forEach((tweet, rank) => add(tweet, rank, 'keyword'));
  meaning.forEach((id, rank) => { const tweet = byId.get(id); if (tweet) add(tweet, rank, 'meaning'); });
  return [...results.values()].sort((a, b) => b.score - a.score);
}

// Split text into plain and matched pieces for highlighting the query's words and phrases.
export function highlight(text = '', query = '') {
  const { words, phrases } = parseQuery(query);
  if (!words.length && !phrases.length) return [{ text, match: false }];
  const marks = [];
  for (const m of text.matchAll(WORD)) {
    const word = fold(m[0]);
    if (words.some(term => matchesWord(word, term))) marks.push([m.index, m.index + m[0].length]);
  }
  const lower = fold(text);
  // Folding keeps lengths for most text; only use phrase positions when it did.
  if (lower.length === text.length) for (const phrase of phrases) {
    const pattern = new RegExp(phrase.split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}]+'), 'gu');
    for (const m of lower.matchAll(pattern)) marks.push([m.index, m.index + m[0].length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const pieces = [];
  let from = 0;
  for (const [start, end] of marks) {
    if (end <= from) continue;
    const begin = Math.max(start, from);
    if (begin > from) pieces.push({ text: text.slice(from, begin), match: false });
    pieces.push({ text: text.slice(begin, end), match: true });
    from = end;
  }
  if (from < text.length) pieces.push({ text: text.slice(from), match: false });
  return pieces;
}
