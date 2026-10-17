import { useEffect, useState } from 'react';
import Tweet from './Tweet.jsx';
import { BackIcon, CloseIcon } from './Icons.jsx';
import { getJSON } from '../api.js';

const LIMIT = 8;

// Semantic neighbors of one tweet: a sidebar on wide screens, full screen on phones,
// or a section under the tweet on its own page.
export default function RelatedPanel({ id, byId, mode, canGoBack, onBack, onClose, onRelated, onRemove }) {
  const [state, setState] = useState({ id: null, ids: [], message: 'Finding related likes…' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ id, ids: [], message: 'Finding related likes…' });
    getJSON('/api/knowledge/related?id=' + encodeURIComponent(id)).then(
      body => { if (!cancelled) setState({ id, ids: body.related.map(r => r.tweetId), message: '' }); },
      error => {
        if (cancelled) return;
        // While the index builds the server answers 503; check again shortly.
        setState({ id, ids: [], message: error.status === 404 ? 'No related likes: this tweet has no text to compare, or is not indexed yet.' : error.message, building: error.status === 503 });
      },
    );
    return () => { cancelled = true; };
  }, [id, attempt]);

  useEffect(() => {
    if (!state.building) return;
    const timer = setTimeout(() => setAttempt(n => n + 1), 10000);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (mode !== 'overlay') return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [mode, onClose]);

  // Prefer the archive's own copy, and drop tweets removed since the index was built.
  const related = state.ids.map(tweetId => byId.get(tweetId)).filter(Boolean).slice(0, LIMIT);
  const center = byId.get(id);
  return (
    <aside className={'related related-' + mode} aria-label="Related likes">
      <div className="related-bar">
        {mode !== 'inline' && canGoBack && <button type="button" className="icon-button" onClick={onBack} aria-label="Back" title="Back"><BackIcon /></button>}
        <div className="related-title">
          <h2>Related</h2>
          {center?.user?.screenName && <span className="secondary">to @{center.user.screenName}</span>}
        </div>
        {onClose && mode !== 'inline' && <button type="button" className="icon-button" onClick={onClose} aria-label="Close related" title="Close"><CloseIcon /></button>}
      </div>
      {state.message && <p className="related-message" role="status">{state.message}</p>}
      {!state.message && !related.length && <p className="related-message">No close matches yet.</p>}
      {related.map(tweet => (
        <Tweet key={tweet.tweetId} tweet={tweet} onRelated={onRelated} onRemove={onRemove} />
      ))}
      {!!related.length && <p className="related-note">Matched by meaning, not by links or replies.</p>}
    </aside>
  );
}
