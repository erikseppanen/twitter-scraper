import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, useSyncExternalStore } from 'react';
import Header from './components/Header.jsx';
import Tweet from './components/Tweet.jsx';
import RelatedPanel from './components/RelatedPanel.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import { BackIcon } from './components/Icons.jsx';
import { PAGE_SIZE, MONTHS, filterTweets, sortTweets, facets as countFacets } from './tweets.js';
import { getJSON, removeTweet } from './api.js';

const FILTERS = ['query', 'year', 'month', 'author'];
const WIDE = '(min-width: 1000px)';

// Routes: /app/ is the timeline; /app/tweet/ID is one tweet. The timeline keeps
// search, filters, sort and the open Related panel in the address.
function readLocation() {
  const params = new URLSearchParams(location.search);
  const tweet = /^\/app\/tweet\/(\d+)\/?$/.exec(location.pathname)?.[1] || null;
  const related = params.get('related');
  return {
    tweet,
    filters: Object.fromEntries(FILTERS.map(key => [key, params.get(key) || ''])),
    sort: params.get('sort') === 'asc' ? 'asc' : 'desc',
    related: /^\d+$/.test(related || '') ? related : null,
  };
}

function useMedia(query) {
  return useSyncExternalStore(
    notify => { const list = matchMedia(query); list.addEventListener('change', notify); return () => list.removeEventListener('change', notify); },
    () => matchMedia(query).matches,
  );
}

function initialTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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
  const [view, setView] = useState(readLocation);
  const [trail, setTrail] = useState(() => view.related ? [view.related] : []);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [theme, setTheme] = useState(initialTheme);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const sentinel = useRef(null);
  const wide = useMedia(WIDE);
  const { filters, sort, related } = view;
  const deferredFilters = useDeferredValue(filters);

  useEffect(() => {
    getJSON('/archive/tweets.json').then(setTweets, e => setError(e.message || 'The archive could not be loaded.'));
  }, []);

  const navigate = useCallback(path => {
    history.pushState(null, '', path);
    const next = readLocation();
    setView(next); setTrail(next.related ? [next.related] : []);
    scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => { const next = readLocation(); setView(next); setTrail(next.related ? [next.related] : []); };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // Mirror timeline state into the address without adding history entries.
  useEffect(() => {
    if (view.tweet) return;
    const params = new URLSearchParams();
    for (const key of FILTERS) if (filters[key]) params.set(key, filters[key]);
    if (sort === 'asc') params.set('sort', 'asc');
    if (related) params.set('related', related);
    const search = params.toString();
    history.replaceState(null, '', '/app/' + (search ? '?' + search : ''));
  }, [view.tweet, filters, sort, related]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* Private browsing may block storage. */ }
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const byId = useMemo(() => new Map((tweets || []).map(tweet => [String(tweet.tweetId), tweet])), [tweets]);
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
  }, [visible.length, tweets, view.tweet]);

  const setFilter = (key, value) => setView(current => {
    const next = { ...current.filters, [key]: value };
    if (key === 'year' && !value) next.month = '';
    return { ...current, filters: next };
  });
  const clear = () => setView(current => ({ ...current, filters: Object.fromEntries(FILTERS.map(key => [key, ''])) }));
  const showAuthor = author => { setFilter('author', author); scrollTo({ top: 0 }); };

  const openRelated = useCallback(id => {
    setView(current => ({ ...current, related: id }));
    setTrail(current => current.at(-1) === id ? current : [...current, id]);
  }, []);
  // Starting from the timeline begins a new trail; following a related tweet extends it.
  const startRelated = useCallback(id => { setTrail([]); openRelated(id); }, [openRelated]);
  const back = () => {
    const next = trail.slice(0, -1);
    setTrail(next);
    setView(current => ({ ...current, related: next.at(-1) || null }));
  };
  const closeRelated = useCallback(() => { setTrail([]); setView(current => ({ ...current, related: null })); }, []);

  async function confirmRemove() {
    const tweet = removing;
    setBusy(true);
    try {
      await removeTweet(tweet.tweetId);
      setTweets(current => current.filter(t => t.tweetId !== tweet.tweetId));
      setTrail(current => current.filter(id => id !== tweet.tweetId));
      setView(current => current.related === tweet.tweetId ? { ...current, related: null } : current);
      setToast('Removed from your archive');
      if (view.tweet === tweet.tweetId) navigate('/app/');
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false); setRemoving(null);
    }
  }

  const relatedProps = { byId, navigate, onRelated: openRelated, onRemove: setRemoving };
  let main, sidebar = null;
  if (view.tweet) {
    const tweet = byId.get(view.tweet);
    main = (
      <>
        <header className="page-header page-bar">
          <a className="icon-button" href="/app/" onClick={e => { e.preventDefault(); history.length > 1 ? history.back() : navigate('/app/'); }} aria-label="Back to timeline" title="Back"><BackIcon /></a>
          <h1>Tweet</h1>
        </header>
        {tweet && <Tweet tweet={tweet} full navigate={navigate} onRemove={setRemoving} />}
        {!tweet && <p className="empty">{tweets ? 'This tweet is not in your archive.' : error || 'Loading…'}</p>}
        {tweet && !wide && <RelatedPanel id={tweet.tweetId} mode="inline" {...relatedProps} onRelated={id => navigate('/app/tweet/' + id)} />}
      </>
    );
    if (tweet && wide) sidebar = <RelatedPanel id={tweet.tweetId} mode="sidebar" {...relatedProps} onRelated={id => navigate('/app/tweet/' + id)} />;
  } else {
    const shown = Math.min(limit, visible.length);
    const status = tweets ? `Showing ${shown} of ${visible.length}${describe(deferredFilters)} from ${tweets.length} tweets` : error || 'Loading…';
    main = (
      <>
        <Header filters={filters} setFilter={setFilter} clear={clear} facets={facets}
          sort={sort} toggleSort={() => setView(current => ({ ...current, sort: current.sort === 'desc' ? 'asc' : 'desc' }))}
          theme={theme} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} status={status} />
        {visible.slice(0, shown).map(tweet => (
          <Tweet key={tweet.tweetId} tweet={tweet} query={deferredFilters.query} active={tweet.tweetId === related}
            navigate={navigate} onAuthor={showAuthor} onRelated={startRelated} onRemove={setRemoving} />
        ))}
        {tweets && !visible.length && <p className="empty">No likes match these filters.</p>}
        <div ref={sentinel} />
      </>
    );
    const panel = related && tweets && <RelatedPanel id={related} mode={wide ? 'sidebar' : 'overlay'} canGoBack={trail.length > 1} onBack={back} onClose={closeRelated} {...relatedProps} />;
    sidebar = wide ? (panel || <aside className="related related-sidebar related-hint"><p>Choose <strong>Related</strong> on a tweet to see similar likes here.</p></aside>) : panel;
  }

  return (
    <div className="shell">
      <main className="timeline">{main}</main>
      {sidebar}
      <ConfirmDialog tweet={removing} busy={busy} onConfirm={confirmRemove} onCancel={() => setRemoving(null)} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
