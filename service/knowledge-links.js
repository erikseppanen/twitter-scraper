(() => {
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const style = el('style');
  style.textContent = `
.related-open{padding-right:50%}.related-panel{position:fixed;right:16px;top:170px;bottom:16px;width:calc(50% - 32px);max-width:600px;overflow:auto;background:var(--bg-card,#fff);color:var(--text-primary,#111);border:1px solid var(--border-color,#ddd);border-radius:16px;padding:0;z-index:20;box-sizing:border-box}
.related-panel h2{font-size:20px;margin:12px 0}.related-tools{display:flex;gap:8px;flex-wrap:wrap}.related-panel button,.knowledge-link{font:inherit;font-size:13px;color:var(--link-color,#1d9bf0);background:transparent;border:1px solid var(--border-color,#ddd);border-radius:8px;padding:7px 10px;cursor:pointer}.knowledge-link{margin-left:8px;text-decoration:none}
.related-panel>.related-tools,.related-panel>h2,.related-panel>p{margin:12px}.related-card{margin-bottom:16px}.related-card>.related-tools{padding:0 16px 12px}.related-card .tweet-card{margin:0}.related-card .tweet-text{overflow-wrap:anywhere}
@media(max-width:760px){.related-open{padding-right:0}.related-panel{position:static;width:auto;margin:12px 0;max-height:none}}
`;
  document.head.append(style);
  const panel = el('aside', null, 'related-panel'); panel.setAttribute('aria-label', 'Related tweets'); panel.hidden = true;
  let trail = [], sequence = 0, anchor;
  const button = (text, fn) => { const b = el('button', text); b.type = 'button'; b.onclick = fn; return b; };
  const linkFor = id => location.origin + '/archive/?related=' + encodeURIComponent(id);
  const notice = el('p'); notice.setAttribute('role', 'status');
  function media(tweet, target) {
    const grid = el('div', null, 'media-grid media-count-' + Math.min(4, (tweet.media || []).length));
    for (const item of tweet.media || []) {
      const src = item.localPath ? '/archive/media/' + encodeURIComponent(item.localPath) : item.url;
      if (!src || !(/^https:\/\//.test(src) || src.startsWith('/archive/media/'))) continue;
      const m = el(item.type === 'photo' ? 'img' : 'video'); m.src = src;
      if (m.tagName === 'IMG') { m.alt = 'Archived tweet image'; m.loading = 'lazy'; }
      else { m.controls = true; m.preload = 'metadata'; }
      const cell = el('div', null, 'media-item'); cell.append(m); grid.append(cell);
    }
    if (grid.childNodes.length) target.append(grid);
  }
  function card(tweet, selected = false) {
    const c = el('div', null, 'related-card'); c.dataset.tweetId = tweet.tweetId;
    const t = el('article', null, 'tweet-card');
    const header = el('header', null, 'tweet-header');
    if (/^https?:\/\//.test(tweet.user?.profileImage || '')) { const avatar = el('img', null, 'avatar'); avatar.src = tweet.user.profileImage; avatar.alt = ''; avatar.loading = 'lazy'; header.append(avatar); }
    const user = el('div', null, 'user-info'); user.append(el('span', tweet.user?.name || tweet.user?.screenName || 'Saved tweet', 'display-name'), el('span', '@' + (tweet.user?.screenName || 'unknown'), 'username'));
    const source = el('a', '↗', 'tweet-link'); source.href = 'https://twitter.com/i/status/' + tweet.tweetId; source.target = '_blank'; source.rel = 'noopener'; source.title = 'View on Twitter'; header.append(user, source); t.append(header);
    const content = el('div', null, 'tweet-content');
    const text = tweet.text || '', long = text.length > 280;
    const container = el('div', null, 'tweet-text-container' + (long ? '' : ' expanded'));
    const p = el('p', text, 'tweet-text' + (long ? ' truncated' : '')); container.append(p);
    if (long) { const more = el('a', 'Show more', 'show-more-link'); more.href = '#'; more.onclick = e => { e.preventDefault(); container.classList.toggle('expanded'); p.classList.toggle('truncated'); more.textContent = container.classList.contains('expanded') ? 'Show less' : 'Show more'; }; container.append(more); }
    content.append(container); t.append(content); media(tweet, t);
    if (tweet.article) { const a = el('a', null, 'article-card'); a.href = '/archive/articles/' + tweet.tweetId + '.html'; if (tweet.article.coverImage) { const cover = el('div', null, 'article-cover'); const img = el('img'); img.src = '/archive/articles/' + tweet.tweetId + '-cover.jpg'; img.alt = ''; cover.append(img); a.append(cover); } const info = el('div', null, 'article-info'); info.append(el('h3', tweet.article.title || '', 'article-title'), el('p', tweet.article.previewText || '', 'article-preview')); a.append(info); t.append(a); }
    if (tweet.quote) { const q = el('div', null, 'quote-card'); const h = el('div', null, 'quote-header'); h.append(el('span', tweet.quote.user?.name || '', 'quote-name'), el('span', ' @' + (tweet.quote.user?.screenName || 'unknown'), 'quote-username')); q.append(h, el('div', tweet.quote.text || '', 'quote-text')); media(tweet.quote, q); t.append(q); }
    const footer = el('footer', null, 'tweet-footer'), d = new Date(tweet.createdAt || NaN);
    footer.append(el('time', Number.isFinite(+d) ? d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : 'Date unavailable', 'tweet-date'));
    const a = el('a', 'View page →', 'tweet-page-link'); a.href = '/archive/tweets/' + tweet.tweetId + '.html'; a.target = '_blank'; a.rel = 'noopener'; footer.append(a); t.append(footer); c.append(t);
    const actions = el('div', null, 'related-tools');
    if (!selected) actions.append(button('Follow connections →', () => open(tweet.tweetId)));
    actions.append(button('Copy link', async () => { try { await navigator.clipboard.writeText(linkFor(tweet.tweetId)); notice.textContent = 'Link copied.'; } catch { notice.textContent = linkFor(tweet.tweetId); } }));
    c.append(actions); return c;
  }
  async function open(id, back = false) {
    const seq = ++sequence; if (!back) trail.push(id);
    if (!panel.isConnected) { if (anchor) anchor.after(panel); else (document.querySelector('main') || document.body).prepend(panel); }
    panel.hidden = false; document.body.classList.add('related-open');
    const tools = el('div', null, 'related-tools');
    const prev = button('← Back', () => { trail.pop(); open(trail.at(-1), true); }); prev.disabled = trail.length < 2;
    tools.append(prev, button('Close', () => { ++sequence; panel.hidden = true; document.body.classList.remove('related-open'); history.replaceState(null, '', location.pathname); }));
    panel.replaceChildren(tools, el('h2', 'Related tweets'), notice); notice.textContent = 'Finding related tweets…';
    history.replaceState(null, '', '?related=' + encodeURIComponent(id));
    try {
      const response = await fetch('/api/knowledge/graph?id=' + encodeURIComponent(id));
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Unable to load related tweets.');
      if (seq !== sequence) return;
      notice.textContent = data.neighborhood?.title || 'Connected ideas';
      panel.append(card(data.nodes[0].tweet, true), el('h2', 'Follow a connection'));
      for (const node of data.nodes.slice(1, 7)) panel.append(card(node.tweet));
      if (data.nodes.length === 1) panel.append(el('p', 'No close semantic neighbors found yet.'));
      panel.scrollTop = 0;
    } catch (e) { if (seq === sequence) notice.textContent = e.message; }
  }
  function enhance() {
    for (const c of document.querySelectorAll('article[id^="tweet-"]')) {
      if (c.querySelector('.knowledge-link')) continue;
      const id = c.id.slice(6); if (!/^\d+$/.test(id)) continue;
      const a = el('a', 'Related ↗', 'knowledge-link'); a.href = linkFor(id); a.title = 'Explore related tweets';
      a.onclick = event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); anchor = c; trail = []; c.after(panel); open(id); };
      (c.querySelector('footer') || c).append(a);
    }
  }
  enhance(); new MutationObserver(enhance).observe(document.body, { childList:true, subtree:true });
  const initial = new URLSearchParams(location.search).get('related'); if (/^\d+$/.test(initial || '')) open(initial);
})();
