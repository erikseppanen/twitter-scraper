import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Nav from './components/Nav.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import Timeline from './pages/Timeline.jsx';
import TweetPage from './pages/TweetPage.jsx';
import Explore from './pages/Explore.jsx';
import Updates from './pages/Updates.jsx';
import Random from './pages/Random.jsx';
import ArticlePage from './pages/ArticlePage.jsx';
import { getJSON, removeTweet } from './api.js';
import { parseRoute, useNavigation, navigate } from './router.js';

function useMedia(query) {
  return useSyncExternalStore(
    notify => { const list = matchMedia(query); list.addEventListener('change', notify); return () => list.removeEventListener('change', notify); },
    () => matchMedia(query).matches,
  );
}

function initialTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export default function App() {
  const navigation = useNavigation();
  const route = parseRoute();
  const [tweets, setTweets] = useState(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(initialTheme);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const wide = useMedia('(min-width: 1100px)');
  const compact = useMedia('(max-width: 599px)');

  useEffect(() => {
    getJSON('/archive/tweets.json').then(setTweets, e => setError(e.message || 'The archive could not be loaded.'));
  }, []);

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
  const notify = useCallback(text => setToast({ text, at: Date.now() }), []);

  async function confirmRemove() {
    const tweet = removing;
    setBusy(true);
    try {
      await removeTweet(tweet.tweetId);
      setTweets(current => current.filter(t => t.tweetId !== tweet.tweetId));
      notify('Removed from your archive');
      if (route.page === 'tweet' && route.id === tweet.tweetId) navigate('/app/', { replace: true });
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false); setRemoving(null);
    }
  }

  const shared = { tweets, byId, error, wide, compact, notify, onRemove: setRemoving };
  // Each navigation remounts the page so it reads its state from the new address.
  let page;
  if (route.page === 'tweet') page = <TweetPage key={navigation} id={route.id} {...shared} />;
  else if (route.page === 'explore') page = <Explore key={navigation} id={route.id} {...shared} />;
  else if (route.page === 'article') page = <ArticlePage key={navigation} id={route.id} {...shared} />;
  else if (route.page === 'random') page = <Random key={navigation} {...shared} />;
  else if (route.page === 'updates') page = <Updates key={navigation} wide={wide} />;
  else page = <Timeline key={navigation} {...shared} />;

  return (
    <div className="shell">
      <Nav page={route.page} theme={theme} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
      {page}
      <ConfirmDialog tweet={removing} busy={busy} onConfirm={confirmRemove} onCancel={() => setRemoving(null)} />
      {toast && <div key={toast.at} className="toast" role="status">{toast.text}</div>}
    </div>
  );
}
