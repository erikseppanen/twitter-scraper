import { useEffect, useRef, useState } from 'react';
import RichText from './RichText.jsx';
import { translation } from '../translation.js';

const LONG = 280;

// Tweet or quote text that translates itself to English once it scrolls into view.
export default function TweetText({ tweetId, quoted = false, text, query, className, clampLong = true }) {
  const ref = useRef(null);
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let cancelled = false, timer;
    const start = () => {
      setState('pending');
      // Cached and English texts answer quickly; only label requests still working.
      timer = setTimeout(() => { if (!cancelled) setState(current => current === 'pending' ? 'slow' : current); }, 400);
      translation(tweetId, quoted).then(
        answer => { if (!cancelled) { setResult(answer); setState(answer.status === 'translated' ? 'translated' : 'original'); } },
        () => { if (!cancelled) setState('failed'); },
      ).finally(() => clearTimeout(timer));
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
    }, { rootMargin: '100px' });
    observer.observe(node);
    return () => { cancelled = true; clearTimeout(timer); observer.disconnect(); };
  }, [tweetId, quoted, text, attempt]);

  const shown = state === 'translated' && !showOriginal ? result.text : text;
  const long = clampLong && shown.length > LONG;
  return (
    <div ref={ref} className={className}>
      {state === 'slow' && <span className="translation-note">Translating…</span>}
      {state === 'translated' && (
        <button type="button" className="translation-note" onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? 'Show English translation' : `Translated from ${result.language} · Show original`}
        </button>
      )}
      {state === 'failed' && (
        <button type="button" className="translation-note" onClick={() => { setState('idle'); setAttempt(n => n + 1); }}>
          Translation unavailable · Retry
        </button>
      )}
      <p className={'text' + (long && !expanded ? ' clamped' : '')}><RichText text={shown} query={query} /></p>
      {long && <button type="button" className="show-more" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show more'}</button>}
    </div>
  );
}
