import { useEffect, useMemo, useRef, useState } from 'react';
import Tweet from '../components/Tweet.jsx';
import RelatedPanel from '../components/RelatedPanel.jsx';
import { FILTERS, readFilters, writeFilters, describeFilters, viewTweets, newSeed, parseSeed } from '../tweets.js';
import { useSearch } from '../useSearch.js';
import { navigate, replaceAddress } from '../router.js';

// The filters, shuffle seed and position live in the address, so returning here
// from a tweet's page, or reloading, shows the same tweet.
function readLocation() {
  const params = new URLSearchParams(location.search);
  const position = Number(params.get('n'));
  return {
    filters: readFilters(params),
    seed: parseSeed(params.get('seed')) || newSeed(),
    index: Number.isInteger(position) && position > 0 ? position - 1 : 0,
  };
}

const typing = target => target.closest?.('input, select, textarea, [contenteditable]');

// Likes in a shuffled order, one at a time: buttons, arrow keys, or a swipe on phones.
export default function Random({ tweets, byId, error, wide, onRemove }) {
  const [view, setView] = useState(readLocation);
  const [related, setRelated] = useState(false);
  const touch = useRef(null);
  const { filters, seed } = view;

  // The same search as Likes, so One at a time shows the same likes.
  const search = useSearch(tweets, byId, filters.query);
  const order = useMemo(() => viewTweets(tweets || [], search, filters, 'random', seed), [tweets, search, filters, seed]);
  // A removal shortens the list; stay at the same position, which now holds the next tweet.
  const index = Math.min(view.index, Math.max(order.length - 1, 0));
  const tweet = order[index];

  useEffect(() => {
    const params = writeFilters(new URLSearchParams({ seed }), filters);
    if (index) params.set('n', index + 1);
    replaceAddress('/app/random?' + params);
  }, [filters, seed, index]);

  const step = delta => {
    const next = index + delta;
    if (next < 0 || next >= order.length) return;
    setView(current => ({ ...current, index: next }));
    setRelated(false);
    scrollTo({ top: 0 });
  };
  const reshuffle = () => { setView(current => ({ ...current, seed: newSeed(), index: 0 })); setRelated(false); scrollTo({ top: 0 }); };
  const clear = () => { setView(current => ({ ...current, filters: readFilters(new URLSearchParams()), index: 0 })); scrollTo({ top: 0 }); };

  useEffect(() => {
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('dialog[open], .related-overlay')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  // A mostly sideways swipe: left for the next tweet, right for the previous one.
  const onTouchStart = e => { const t = e.touches[0]; touch.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; };
  const onTouchEnd = e => {
    const start = touch.current, t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };

  const filtered = FILTERS.some(key => filters[key]);
  const last = index === order.length - 1;
  let status = error || 'Loading…';
  if (tweets) status = order.length
    ? `${(index + 1).toLocaleString()} of ${order.length.toLocaleString()}${describeFilters(filters)}${last ? ' · that’s all of them' : ''}`
    : 'No likes match these filters.';
  const openTweet = id => navigate('/app/tweet/' + id);
  const panel = tweet && (wide || related) && (
    <RelatedPanel id={tweet.tweetId} byId={byId} mode={wide ? 'sidebar' : 'overlay'}
      onClose={wide ? undefined : () => setRelated(false)} onRelated={openTweet} onRemove={onRemove} />
  );
  return (
    <>
      <main className="timeline random" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <header className="page-header">
          <h1>Random</h1>
          <div className="controls random-controls">
            <button type="button" className="pill" onClick={() => step(-1)} disabled={!index} title="Previous (←)">← Previous</button>
            <button type="button" className="pill accent" onClick={() => step(1)} disabled={!tweet || last} title="Next (→)">Next →</button>
            <button type="button" className="pill" onClick={reshuffle} title="Shuffle into a new order">Reshuffle</button>
            {filtered && <button type="button" className="pill" onClick={clear} title="Shuffle all likes">Clear filters</button>}
          </div>
          <p className="status" role="status">{status}</p>
        </header>
        {tweet && <Tweet key={tweet.tweetId} tweet={tweet} full onRelated={wide ? undefined : () => setRelated(true)} onRemove={onRemove} />}
        {tweet && !wide && <p className="random-hint">Swipe left for the next tweet, right for the previous one.</p>}
        {tweets && !order.length && filtered && <p className="empty"><button type="button" className="pill" onClick={clear}>Shuffle all likes</button></p>}
      </main>
      {panel || (wide && <div className="sidebar-spacer" />)}
    </>
  );
}
