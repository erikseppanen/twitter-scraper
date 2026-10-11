import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import Header from '../components/Header.jsx';
import Tweet from '../components/Tweet.jsx';
import RelatedPanel from '../components/RelatedPanel.jsx';
import { PAGE_SIZE, MONTHS, filterTweets, sortTweets, facets as countFacets } from '../tweets.js';
import { replaceAddress } from '../router.js';

const FILTERS = ['query', 'year', 'month', 'author'];

// Search, filters, sort and the open Related panel live in the address.
function readLocation() {
  const params = new URLSearchParams(location.search);
  const related = params.get('related');
  return {
    filters: Object.fromEntries(FILTERS.map(key => [key, params.get(key) || ''])),
    sort: params.get('sort') === 'asc' ? 'asc' : 'desc',
    related: /^\d+$/.test(related || '') ? related : null,
  };
}

function describe({ query, year, month, author }) {
  const parts = [];
  if (year || month) parts.push('from ' + [month && MONTHS[month - 1], year].filter(Boolean).join(' '));
  if (author) parts.push('by @' + author);
  if (query.trim()) parts.push(`matching "${query.trim()}"`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

export default function Timeline({ tweets, byId, error, wide, onRemove }) {
  const [view, setView] = useState(readLocation);
  const [trail, setTrail] = useState(() => view.related ? [view.related] : []);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinel = useRef(null);
  const { filters, sort, related } = view;
  const deferredFilters = useDeferredValue(filters);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const key of FILTERS) if (filters[key]) params.set(key, filters[key]);
    if (sort === 'asc') params.set('sort', 'asc');
    if (related) params.set('related', related);
    const search = params.toString();
    replaceAddress('/app/' + (search ? '?' + search : ''));
  }, [filters, sort, related]);

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

  // Close the panel and forget its trail when a tweet in it is removed.
  useEffect(() => {
    if (!tweets) return;
    if (related && !byId.has(related)) setView(current => ({ ...current, related: null }));
    setTrail(current => current.filter(id => byId.has(id)));
  }, [tweets, byId, related]);

  const setFilter = (key, value) => setView(current => {
    const next = { ...current.filters, [key]: value };
    if (key === 'year' && !value) next.month = '';
    return { ...current, filters: next };
  });
  const clear = () => setView(current => ({ ...current, filters: Object.fromEntries(FILTERS.map(key => [key, ''])) }));
  const showAuthor = author => { setFilter('author', author); scrollTo({ top: 0 }); };
  const openRelated = id => {
    setView(current => ({ ...current, related: id }));
    setTrail(current => current.at(-1) === id ? current : [...current, id]);
  };
  // Starting from the timeline begins a new trail; following a related tweet extends it.
  const startRelated = id => { setTrail([id]); setView(current => ({ ...current, related: id })); };
  const back = () => {
    const next = trail.slice(0, -1);
    setTrail(next);
    setView(current => ({ ...current, related: next.at(-1) || null }));
  };
  const close = () => { setTrail([]); setView(current => ({ ...current, related: null })); };

  const shown = Math.min(limit, visible.length);
  const status = tweets ? `Showing ${shown} of ${visible.length}${describe(deferredFilters)} from ${tweets.length} tweets` : error || 'Loading…';
  const panel = related && tweets && (
    <RelatedPanel id={related} byId={byId} mode={wide ? 'sidebar' : 'overlay'} canGoBack={trail.length > 1}
      onBack={back} onClose={close} onRelated={openRelated} onRemove={onRemove} />
  );
  return (
    <>
      <main className="timeline">
        <Header filters={filters} setFilter={setFilter} clear={clear} facets={facets} status={status}
          sort={sort} toggleSort={() => setView(current => ({ ...current, sort: current.sort === 'desc' ? 'asc' : 'desc' }))} />
        {visible.slice(0, shown).map(tweet => (
          <Tweet key={tweet.tweetId} tweet={tweet} query={deferredFilters.query} active={tweet.tweetId === related}
            onAuthor={showAuthor} onRelated={startRelated} onRemove={onRemove} />
        ))}
        {tweets && !visible.length && <p className="empty">No likes match these filters.</p>}
        <div ref={sentinel} />
      </main>
      {wide ? (panel || <aside className="related related-sidebar related-hint"><p>Choose <strong>Related</strong> on a tweet to see similar likes here.</p></aside>) : panel}
    </>
  );
}
