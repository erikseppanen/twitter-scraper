(() => {
  const style = document.createElement('style');
  style.textContent = '.tweet-remove{font:inherit;font-size:13px;color:#e0245e;background:transparent;border:0;padding:4px;margin-left:auto;cursor:pointer}.tweet-remove:disabled{opacity:.6;cursor:wait}';
  document.head.append(style);
  const reset = (button, text = 'Remove') => { button.disabled = false; button.dataset.confirm = ''; button.textContent = text; };
  async function remove(card, id, button) {
    // Removal deletes saved media, so require a second click.
    if (button.dataset.confirm !== '1') {
      button.dataset.confirm = '1'; button.textContent = 'Confirm remove';
      setTimeout(() => { if (button.dataset.confirm === '1' && !button.disabled) reset(button); }, 4000);
      return;
    }
    button.disabled = true; button.textContent = 'Removing…';
    try {
      const response = await fetch('/api/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || 'Could not remove this tweet.');
      // The index keeps a reference to this array, so later searches and filters omit the tweet.
      const data = window.TWEET_DATA, index = Array.isArray(data) ? data.findIndex(t => String(t.tweetId) === id) : -1;
      if (index >= 0) data.splice(index, 1);
      if (location.pathname.startsWith('/archive/tweets/')) return location.replace('/archive/');
      card.remove();
    } catch (e) { reset(button, 'Remove failed — retry'); button.title = e.message; }
  }
  function enhance() {
    for (const card of document.querySelectorAll('article[id^="tweet-"]')) {
      if (card.querySelector('.tweet-remove')) continue;
      const id = card.id.slice(6); if (!/^\d+$/.test(id)) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'tweet-remove'; button.textContent = 'Remove';
      button.title = 'Remove this tweet and its saved media from the archive';
      button.onclick = e => { e.preventDefault(); remove(card, id, button); };
      (card.querySelector('footer') || card).append(button);
    }
  }
  enhance(); new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
})();
