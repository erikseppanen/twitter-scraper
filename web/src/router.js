import { useSyncExternalStore } from 'react';

// A minimal history router. Pages mirror their own state into the address with
// replaceState, which does not count as navigation; only navigate() and Back/Forward do.
let version = 0, depth = 0;
const listeners = new Set();
const notify = () => { version++; for (const listener of listeners) listener(); };
// Count in-app history entries so Back never leaves the app.
addEventListener('popstate', event => { depth = event.state?.depth ?? 0; notify(); });

export function navigate(path, { replace = false } = {}) {
  if (!replace) depth++;
  history[replace ? 'replaceState' : 'pushState']({ depth }, '', path);
  notify();
  scrollTo({ top: 0 });
}

// Return to the previous app page, or to a fallback when this page was opened directly.
export function goBack(fallback) {
  if (depth > 0) history.back(); else navigate(fallback, { replace: true });
}

// Pages that mirror their state into the address keep the history depth.
export function replaceAddress(path) {
  history.replaceState({ depth }, '', path);
}

export function useNavigation() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => version);
}

export function parseRoute(pathname = location.pathname) {
  let match;
  if ((match = /^\/app\/tweet\/(\d+)\/?$/.exec(pathname))) return { page: 'tweet', id: match[1] };
  if (/^\/app\/updates\/?$/.test(pathname)) return { page: 'updates' };
  if (/^\/app\/random\/?$/.test(pathname)) return { page: 'random' };
  if ((match = /^\/app\/article\/(\d+)\/?$/.exec(pathname))) return { page: 'article', id: match[1] };
  return { page: 'timeline' };
}

// Follow in-app links without a page load, but let modified clicks open new tabs.
export function inApp(path) {
  return event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  };
}
