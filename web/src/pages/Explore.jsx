import { useEffect, useState } from 'react';
import Tweet from '../components/Tweet.jsx';
import CopyLinks from '../components/CopyLinks.jsx';
import { PageBar } from './TweetPage.jsx';
import { getJSON } from '../api.js';
import { navigate, replaceAddress } from '../router.js';

function readLocation() {
  const params = new URLSearchParams(location.search);
  return { q: params.get('q') || '', topic: params.get('topic') || '' };
}

function useIndexStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () => getJSON('/api/knowledge/status').then(s => { if (!cancelled) setStatus(s); }, e => { if (!cancelled) setStatus({ state: 'error', message: e.message, topics: [], available: 0 }); });
    poll();
    const timer = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  return status;
}

function describeStatus(status) {
  if (!status) return 'Preparing your index…';
  if (status.state === 'indexing') return `Indexing ${status.indexed} of ${status.total} tweets…`;
  if (status.state === 'error') return status.message + ' The index retries automatically.';
  return status.message;
}

function ResultRow({ row, selected, onOpen }) {
  const user = row.tweet.user || {};
  return (
    <button type="button" className={'result' + (selected ? ' selected' : '')} onClick={() => onOpen(row.tweet.tweetId)}>
      <span className="result-head"><strong>{user.name || user.screenName}</strong> <span className="secondary">@{user.screenName}</span></span>
      <span className="result-text">{(row.tweet.text || row.tweet.quote?.text || '').slice(0, 160)}</span>
      {row.tweet.topic && <span className="badge">{row.tweet.topic}</span>}
    </button>
  );
}

export default function Explore({ id, tweets, byId, wide, onRemove, notify }) {
  const [{ q, topic }, setSearch] = useState(readLocation);
  const [draft, setDraft] = useState(q);
  const [results, setResults] = useState({ key: null, rows: [], message: '' });
  const [related, setRelated] = useState({ id: null, data: null, message: '' });
  const status = useIndexStatus();
  const ready = status?.available > 0;
  const suffix = new URLSearchParams(Object.entries({ q, topic }).filter(([, v]) => v)).toString();
  const open = next => navigate('/app/explore/tweet/' + next + (suffix ? '?' + suffix : ''));

  useEffect(() => {
    replaceAddress('/app/explore' + (id ? '/tweet/' + id : '') + (suffix ? '?' + suffix : ''));
  }, [id, suffix]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getJSON('/api/knowledge/search?' + new URLSearchParams({ q, topic })).then(
      body => { if (!cancelled) setResults({ key: q + '\n' + topic, rows: body.results, message: '' }); },
      e => { if (!cancelled) setResults({ key: null, rows: [], message: e.message }); },
    );
    return () => { cancelled = true; };
  }, [ready, q, topic]);

  useEffect(() => {
    if (!id || !ready) return;
    let cancelled = false;
    setRelated({ id, data: null, message: 'Finding related ideas…' });
    getJSON('/api/knowledge/graph?id=' + encodeURIComponent(id)).then(
      data => { if (!cancelled) setRelated({ id, data, message: '' }); },
      e => { if (!cancelled) setRelated({ id, data: null, message: e.status === 404 ? 'This tweet is not in the index yet.' : e.message }); },
    );
    return () => { cancelled = true; };
  }, [id, ready]);

  // Prefer the archive's copy of each tweet and skip ones removed since indexing.
  const rows = results.rows.filter(row => byId.has(row.tweet.tweetId));
  // Until results for the current search arrive, say so rather than label the old list.
  const current = results.key === q + '\n' + topic;
  const heading = results.message || (ready && !current ? (q ? 'Searching by meaning…' : 'Loading…') : q ? 'Related by meaning' : topic || 'Recent ideas');
  const form = (
    <form className="explore-search" onSubmit={e => { e.preventDefault(); setSearch(current => ({ ...current, q: draft.trim() })); }}>
      <div className="search">
        <input type="search" value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)}
          placeholder="Search by meaning" aria-label="Search by meaning" />
      </div>
      <div className="controls">
        <select value={topic} onChange={e => setSearch(current => ({ ...current, topic: e.target.value }))} aria-label="Suggested topic">
          <option value="">All topics</option>
          {(status?.topics || []).map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <button type="submit" className="pill accent">Search</button>
      </div>
      <p className="status" role="status">{describeStatus(status)}</p>
    </form>
  );

  let main;
  if (id) {
    const tweet = byId.get(id);
    const data = related.id === id ? related.data : null;
    const center = data?.nodes[0]?.tweet;
    main = (
      <>
        <PageBar title="Explore" back={'/app/explore' + (suffix ? '?' + suffix : '')} />
        {data && (
          <section className="neighborhood">
            <span className="secondary small">Semantic neighborhood</span>
            <h2>{data.neighborhood?.title || 'Connected ideas'}</h2>
            {!!data.neighborhood?.themes?.length && <div className="badges">{data.neighborhood.themes.map(theme => <span key={theme} className="badge">{theme}</span>)}</div>}
          </section>
        )}
        {(related.message || !ready) && <p className="empty" role="status">{ready ? related.message : describeStatus(status)}</p>}
        {tweet && (
          <Tweet tweet={tweet} full onRelated={open} onRemove={onRemove}>
            {center?.topic && <span className="badge topic">{center.topic}</span>}
            <CopyLinks tweet={tweet} notify={notify} />
          </Tweet>
        )}
        {ready && tweets && !tweet && <p className="empty">This tweet is not in your archive.</p>}
        {data && <h2 className="section-title">Related ideas</h2>}
        {data && data.nodes.slice(1).map(node => byId.get(node.tweet.tweetId)).filter(Boolean).map(neighbor => (
          <Tweet key={neighbor.tweetId} tweet={neighbor} onRelated={open} onRemove={onRemove} />
        ))}
        {data?.nodes.length === 1 && <p className="empty">No close matches yet.</p>}
      </>
    );
  } else {
    main = (
      <>
        <header className="page-header"><h1>Explore</h1>{form}</header>
        <h2 className="section-title">{heading}</h2>
        {rows.map(row => <Tweet key={row.tweet.tweetId} tweet={byId.get(row.tweet.tweetId)} onRelated={open} onRemove={onRemove} />)}
        {ready && current && !rows.length && <p className="empty">No tweets match yet.</p>}
      </>
    );
  }

  return (
    <>
      <main className="timeline">{main}</main>
      {wide && (
        <aside className="related related-sidebar explore-sidebar" aria-label="Search results">
          {id ? (
            <>
              <div className="sidebar-search">{form}</div>
              <h2 className="section-title">{heading}</h2>
              {rows.map(row => <ResultRow key={row.tweet.tweetId} row={row} selected={row.tweet.tweetId === id} onOpen={open} />)}
            </>
          ) : <p className="related-message">Choose <strong>Related</strong> on a tweet to see its neighborhood of similar ideas.</p>}
        </aside>
      )}
    </>
  );
}
