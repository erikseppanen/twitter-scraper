import { useState } from 'react';

// Stable links for notes. They carry no access token: a signed-out browser is asked
// to unlock with the private bookmark, then returns to the tweet.
export function orgTitle(tweet) {
  const text = (tweet.text || tweet.quote?.text || 'Saved tweet').replace(/\s+/g, ' ').slice(0, 90);
  return ('@' + (tweet.user?.screenName || 'unknown') + ': ' + text).replace(/[[\]\r\n]/g, '');
}

export default function CopyLinks({ tweet, notify }) {
  const [fallback, setFallback] = useState('');
  const url = location.origin + '/knowledge/tweet/' + tweet.tweetId;
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setFallback(''); notify('Copied to clipboard'); }
    catch { setFallback(text); }
  }
  return (
    <div className="copy-links">
      <button type="button" className="pill" onClick={() => copy(url)}>Copy link</button>
      <button type="button" className="pill" onClick={() => copy(`[[${url}][${orgTitle(tweet)}]]`)}>Copy Org link</button>
      {fallback && <input className="copy-fallback" readOnly value={fallback} aria-label="Link to copy" ref={input => input?.select()} />}
    </div>
  );
}
