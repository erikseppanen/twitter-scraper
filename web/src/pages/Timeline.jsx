import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import Header from '../components/Header.jsx';
import Tweet from '../components/Tweet.jsx';
import RelatedPanel from '../components/RelatedPanel.jsx';
import { PAGE_SIZE, FILTERS, SORTS, readFilters, writeFilters, describeFilters, viewTweets, defaultSort, effectiveSort, newSeed, parseSeed, facets as countFacets } from '../tweets.js';
import { useSearch } from '../useSearch.js';
import { replaceAddress } from '../router.js';

// Search, filters, order and the open Related panel live in the address.
function readLocation() {
  const params = new URLSearchParams(location.search);
  const related = params.get('related');
  // No sort in the address means the default: best match while searching, else newest.
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : null;
  return {
    filters: readFilters(params),
    sort,
    seed: sort === 'random' ? parseSeed(params.get('seed')) || newSeed() : null,
    related: /^\d+$/.test(related || '') ? related : null,
  };
}

export default function Timeline({ tweets, byId, error, wide, onRemove }) {
  const [view, setView] = useState(readLocation);
  const [trail, setTrail] = useState(() => view.related ? [view.related] : []);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinel = useRef(null);
  const { filters, seed, related } = view;
  const deferredFilters = useDeferredValue(filters);
  const sort = effectiveSort(view.sort, filters.query);

  useEffect(() => {
    const params = writeFilters(new URLSearchParams(), filters);
    if (sort !== defaultSort(filters.query)) params.set('sort', sort);
    if (seed) params.set('seed', seed);
    if (related) params.set('related', related);
    const search = params.toString();
    replaceAddress('/app/' + (search ? '?' + search : ''));
  }, [filters, sort, seed, related]);

  const facets = useMemo(() => countFacets(tweets || []), [tweets]);
  const search = useSearch(tweets, byId, deferredFilters.query);
  const visible = useMemo(() => viewTweets(tweets || [], search, deferredFilters, sort, seed), [tweets, search, deferredFilters, sort, seed]);
  const matchedBy = useMemo(() => new Map((search?.results || []).map(r => [r.tweet.tweetId, r.why])), [search]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [deferredFilters, sort, seed]);

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
  // Shuffling, or shuffling again, picks a new seed; the seed in the address keeps the order on return.
  const setSort = next => { setView(current => ({ ...current, sort: next, seed: next === 'random' ? newSeed() : null })); scrollTo({ top: 0 }); };
  const oneAtATime = '/app/random?' + writeFilters(new URLSearchParams({ seed }), filters);
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
  const byMeaning = search ? visible.filter(tweet => matchedBy.get(tweet.tweetId) === 'meaning').length : 0;
  const status = tweets
    ? `Showing ${shown} of ${visible.length}${describeFilters(deferredFilters)} from ${tweets.length} tweets${sort === 'random' ? ', shuffled' : ''}` +
      (byMeaning ? ` · ${byMeaning} by meaning only` : '') + (search?.note ? ' · ' + search.note : '')
    : error || 'Loading…';
  const panel = related && tweets && (
    <RelatedPanel id={related} byId={byId} mode={wide ? 'sidebar' : 'overlay'} canGoBack={trail.length > 1}
      onBack={back} onClose={close} onRelated={openRelated} onRemove={onRemove} />
  );
  return (
    <>
      <main className="timeline">
        <Header filters={filters} setFilter={setFilter} clear={clear} facets={facets} status={status}
          sort={sort} setSort={setSort} oneAtATime={oneAtATime} />
        {visible.slice(0, shown).map(tweet => (
          <Tweet key={tweet.tweetId} tweet={tweet} query={deferredFilters.query} active={tweet.tweetId === related}
            onRelated={startRelated} onRemove={onRemove}>
            {matchedBy.get(tweet.tweetId) === 'meaning' && <span className="badge match-note" title="No exact word match; this like is about something similar">Similar meaning</span>}
          </Tweet>
        ))}
        {tweets && !visible.length && <p className="empty">{search?.note === 'searching by meaning…' ? 'Searching…' : 'No likes match these filters.'}</p>}
        <div ref={sentinel} />
      </main>
      {wide ? (panel || <aside className="related related-sidebar related-hint"><p>Choose <strong>Related</strong> on a tweet to see similar likes here.</p></aside>) : panel}
    </>
  );
}
