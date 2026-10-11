import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import Header from './components/Header.jsx';
import Tweet from './components/Tweet.jsx';
import { PAGE_SIZE, MONTHS, filterTweets, sortTweets, facets as countFacets } from './tweets.js';

const FILTERS = ['query', 'year', 'month', 'author'];

// Keep search, filters and sort in the address so reloads and back/forward keep them.
function readLocation() {
  const params = new URLSearchParams(location.search);
  return {
    filters: Object.fromEntries(FILTERS.map(key => [key, params.get(key) || ''])),
    sort: params.get('sort') === 'asc' ? 'asc' : 'desc',
  };
}

function initialTheme() {
  const saved = document.documentElement.dataset.theme;
  return saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function describe({ query, year, month, author }) {
  const parts = [];
  if (year || month) parts.push('from ' + [month && MONTHS[month - 1], year].filter(Boolean).join(' '));
  if (author) parts.push('by @' + author);
  if (query.trim()) parts.push(`matching "${query.trim()}"`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

export default function App() {
  const [tweets, setTweets] = useState(null);
  const [error, setError] = useState('');
  const [{ filters, sort }, setView] = useState(readLocation);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [theme, setTheme] = useState(initialTheme);
  const sentinel = useRef(null);
  const deferredFilters = useDeferredValue(filters);

  useEffect(() => {
    fetch('/archive/tweets.json').then(async response => {
      if (response.status === 401) { location.replace('/?next=' + encodeURIComponent(location.pathname + location.search)); return; }
      if (!response.ok) throw Error('The archive could not be loaded.');
      setTweets(await response.json());
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const key of FILTERS) if (filters[key]) params.set(key, filters[key]);
    if (sort === 'asc') params.set('sort', 'asc');
    const search = params.toString();
    history.replaceState(null, '', location.pathname + (search ? '?' + search : ''));
  }, [filters, sort]);

  useEffect(() => {
    const onPop = () => setView(readLocation());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* Private browsing may block storage. */ }
  }, [theme]);

  const facets = useMemo(() => countFacets(tweets || []), [tweets]);
  const visible = useMemo(() => sortTweets(filterTweets(tweets || [], deferredFilters), sort), [tweets, deferredFilters, sort]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [deferredFilters, sort]);

  // Load the next page as the end of the list approaches.
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setLimit(current => current < visible.length ? current + PAGE_SIZE : current);
    }, { rootMargin: '1000px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible.length, tweets]);

  const setFilter = (key, value) => setView(view => {
    const next = { ...view.filters, [key]: value };
    if (key === 'year' && !value) next.month = '';
    return { ...view, filters: next };
  });
  const clear = () => setView(view => ({ ...view, filters: Object.fromEntries(FILTERS.map(key => [key, ''])) }));
  const showAuthor = author => { setFilter('author', author); scrollTo({ top: 0 }); };

  const shown = Math.min(limit, visible.length);
  const status = tweets ? `Showing ${shown} of ${visible.length}${describe(deferredFilters)} from ${tweets.length} tweets` : error || 'Loading…';

  return (
    <div className="layout">
      <Header filters={filters} setFilter={setFilter} clear={clear} facets={facets}
        sort={sort} toggleSort={() => setView(view => ({ ...view, sort: view.sort === 'desc' ? 'asc' : 'desc' }))}
        theme={theme} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} status={status} />
      <main className="timeline">
        {visible.slice(0, shown).map(tweet => <Tweet key={tweet.tweetId} tweet={tweet} query={deferredFilters.query} onAuthor={showAuthor} />)}
        {tweets && !visible.length && <p className="empty">No likes match these filters.</p>}
        <div ref={sentinel} />
      </main>
    </div>
  );
}
