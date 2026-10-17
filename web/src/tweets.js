export const PAGE_SIZE = 50;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const time = tweet => {
  const value = Date.parse(tweet.createdAt);
  return Number.isNaN(value) ? null : value;
};

// Author, year and month filters; the search query is handled by search.js.
export function filterTweets(tweets, { author = '', year = '', month = '' }) {
  return tweets.filter(tweet => {
    if (author && tweet.user?.screenName !== author) return false;
    if (year || month) {
      const value = time(tweet);
      if (value === null) return false;
      const date = new Date(value);
      if (year && date.getFullYear() !== Number(year)) return false;
      if (month && date.getMonth() + 1 !== Number(month)) return false;
    }
    return true;
  });
}

// Tweets without dates go last in either direction.
export function sortTweets(tweets, order = 'desc') {
  return tweets.slice().sort((a, b) => {
    const x = time(a), y = time(b);
    if (x === null || y === null) return (x === null) - (y === null);
    return order === 'desc' ? y - x : x - y;
  });
}

// Each tweet's place in a shuffle depends only on the seed and its ID, so removing or
// adding tweets leaves the rest of the order as it was.
function rank(seed, id) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function shuffleTweets(tweets, seed) {
  return tweets.map(tweet => [rank(seed, String(tweet.tweetId)), tweet])
    .sort((a, b) => a[0] - b[0] || (a[1].tweetId < b[1].tweetId ? -1 : 1))
    .map(([, tweet]) => tweet);
}

export const newSeed = () => 1 + Math.floor(Math.random() * 999999);
export const parseSeed = value => /^[1-9]\d{0,8}$/.test(value || '') ? Number(value) : null;

// While searching, results come best match first unless another order is chosen.
export const SORTS = ['best', 'desc', 'asc', 'random'];
export const defaultSort = query => query.trim() ? 'best' : 'desc';
export const effectiveSort = (sort, query) => sort === 'best' && !query.trim() ? 'desc' : sort || defaultSort(query);

// Search results (already best first, see useSearch) or all tweets, then the filters and order.
export function viewTweets(tweets, search, filters, sort, seed) {
  const filtered = filterTweets(search ? search.results.map(r => r.tweet) : tweets, filters);
  if (sort === 'random') return shuffleTweets(filtered, seed);
  return sort === 'best' ? filtered : sortTweets(filtered, sort);
}

// Search and filters, as kept in the address.
export const FILTERS = ['query', 'year', 'month', 'author'];
export const readFilters = params => Object.fromEntries(FILTERS.map(key => [key, params.get(key) || '']));
export function writeFilters(params, filters) {
  for (const key of FILTERS) if (filters[key]) params.set(key, filters[key]);
  return params;
}

export function describeFilters({ query, year, month, author }) {
  const parts = [];
  if (year || month) parts.push('from ' + [month && MONTHS[month - 1], year].filter(Boolean).join(' '));
  if (author) parts.push('by @' + author);
  if (query.trim()) parts.push(`matching "${query.trim()}"`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

export function facets(tweets) {
  const authors = new Map(), years = new Map(), months = new Map();
  for (const tweet of tweets) {
    const name = tweet.user?.screenName;
    if (name) authors.set(name, (authors.get(name) || 0) + 1);
    const value = time(tweet);
    if (value === null) continue;
    const date = new Date(value), year = String(date.getFullYear()), key = year + '-' + (date.getMonth() + 1);
    years.set(year, (years.get(year) || 0) + 1);
    months.set(key, (months.get(key) || 0) + 1);
  }
  return {
    authors: [...authors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    years: [...years].sort((a, b) => b[0] - a[0]),
    monthCount: (year, month) => months.get(year + '-' + month) || 0,
  };
}

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const LINK = /(https?:\/\/[^\s]+)|@(\w+)|#(\w+)/g;

// Split text into plain, URL, mention and hashtag parts, like X renders them.
export function tokenize(text = '') {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) });
    const [whole, url, mention, tag] = match;
    if (url) parts.push({ type: 'link', text: url, href: url });
    else if (mention) parts.push({ type: 'link', text: whole, href: 'https://x.com/' + mention });
    else parts.push({ type: 'link', text: whole, href: 'https://x.com/hashtag/' + tag });
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

export function mediaSource(item) {
  return item.localPath ? '/archive/media/' + encodeURIComponent(item.localPath) : item.url;
}
