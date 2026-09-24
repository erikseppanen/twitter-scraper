(() => {
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const style = el('style');
  style.textContent = `
.related-open{padding-right:410px}.related-panel{position:fixed;right:16px;top:170px;bottom:16px;width:374px;overflow:auto;background:var(--bg-card,#fff);color:var(--text-primary,#111);border:1px solid var(--border-color,#ddd);border-radius:16px;padding:16px;z-index:20;box-sizing:border-box}
.related-panel h2{font-size:20px;margin:12px 0}.related-tools{display:flex;gap:8px;flex-wrap:wrap}.related-panel button,.knowledge-link{font:inherit;font-size:13px;color:var(--link-color,#1d9bf0);background:transparent;border:1px solid var(--border-color,#ddd);border-radius:8px;padding:7px 10px;cursor:pointer}.knowledge-link{margin-left:8px;text-decoration:none}
.related-card{border:1px solid var(--border-color,#ddd);border-radius:12px;padding:12px;margin:12px 0}.related-card p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;margin:10px 0}.related-card small{color:var(--text-secondary,#777)}.related-card img,.related-card video{max-width:100%;max-height:240px;object-fit:contain;border-radius:8px;margin:6px 0}.related-quote{border-left:2px solid var(--border-color,#ddd);padding-left:10px;margin:10px 0}.related-card a{color:var(--link-color,#1d9bf0)}
@media(max-width:760px){.related-open{padding-right:0}.related-panel{position:static;width:auto;margin:12px 0;max-height:none}}
`;
  document.head.append(style);
  const panel = el('aside', null, 'related-panel'); panel.setAttribute('aria-label', 'Related tweets'); panel.hidden = true;
  let trail = [], sequence = 0, anchor;
  const button = (text, fn) => { const b = el('button', text); b.type = 'button'; b.onclick = fn; return b; };
  const linkFor = id => location.origin + '/archive/?related=' + encodeURIComponent(id);
  const notice = el('p'); notice.setAttribute('role', 'status');
  function media(tweet, target) {
    for (const item of tweet.media || []) {
      const src = item.localPath ? '/archive/media/' + encodeURIComponent(item.localPath) : item.url;
      if (!src || !(/^https:\/\//.test(src) || src.startsWith('/archive/media/'))) continue;
      const m = el(item.type === 'photo' ? 'img' : 'video'); m.src = src;
      if (m.tagName === 'IMG') { m.alt = 'Archived tweet image'; m.loading = 'lazy'; }
      else { m.controls = true; m.preload = 'metadata'; }
      target.append(m);
    }
  }
  function card(tweet, selected = false) {
    const c = el('div', null, 'related-card'); c.dataset.tweetId = tweet.tweetId;
    c.append(el('strong', tweet.user?.name || tweet.user?.screenName || 'Saved tweet'), el('div', '@' + (tweet.user?.screenName || 'unknown')));
    const d = new Date(tweet.createdAt || NaN);
    c.append(el('small', Number.isFinite(+d) ? d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : 'Date unavailable'));
    const text = tweet.text || ''; c.append(el('p', text.length > 280 ? text.slice(0, 280) + '…' : text));
    if (text.length > 280) { const more = el('details'); more.append(el('summary', 'Read full tweet'), el('p', text)); c.append(more); }
    media(tweet, c);
    if (tweet.quote) { const q = el('div', null, 'related-quote'); q.append(el('strong', '@' + (tweet.quote.user?.screenName || 'unknown')), el('p', tweet.quote.text || '')); media(tweet.quote, q); c.append(q); }
    if (tweet.article) c.append(el('strong', tweet.article.title || ''), el('p', tweet.article.previewText || ''));
    const actions = el('div', null, 'related-tools');
    if (!selected) actions.append(button('Follow connections →', () => open(tweet.tweetId)));
    actions.append(button('Copy link', async () => { try { await navigator.clipboard.writeText(linkFor(tweet.tweetId)); notice.textContent = 'Link copied.'; } catch { notice.textContent = linkFor(tweet.tweetId); } }));
    const a = el('a', 'Archived page ↗'); a.href = '/archive/tweets/' + tweet.tweetId + '.html'; a.target = '_blank'; a.rel = 'noopener'; actions.append(a); c.append(actions); return c;
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
