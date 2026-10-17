import { useEffect, useMemo, useState } from 'react';
import { buildIndex, parseQuery, keywordSearch, fuse } from './search.js';
import { getJSON } from './api.js';

const WAIT = 250;

// Likes matching a search, by keyword at once and by meaning a moment later.
// Returns null without a query; otherwise the results best first, each with why it
// matched, and a note while meaning matches are on their way or unavailable.
export function useSearch(tweets, byId, query) {
  const text = query.trim();
  const index = useMemo(() => buildIndex(tweets || []), [tweets]);
  const keyword = useMemo(() => text ? keywordSearch(index, parseQuery(text)) : [], [index, text]);
  const [meaning, setMeaning] = useState({ query: '', ids: [], note: '' });

  useEffect(() => {
    if (!text) return;
    let cancelled = false;
    // Wait for a pause in typing before asking the Mini.
    const timer = setTimeout(() => getJSON('/api/knowledge/search?' + new URLSearchParams({ q: text })).then(
      body => { if (!cancelled) setMeaning({ query: text, ids: body.results.map(r => r.tweetId), note: '' }); },
      e => { if (!cancelled) setMeaning({ query: text, ids: [], note: e.status === 503 ? 'meaning search is still indexing' : 'meaning search is unavailable' }); },
    ), WAIT);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [text]);

  return useMemo(() => {
    if (!text) return null;
    const arrived = meaning.query === text;
    const results = fuse(keyword, arrived ? meaning.ids : [], byId);
    return { results, note: arrived ? meaning.note : 'searching by meaning…' };
  }, [text, keyword, meaning, byId]);
}
