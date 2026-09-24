(() => {
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const style = el('style');
  style.textContent = `.related-panel{max-width:600px;margin:auto;padding:16px}.related-tools{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.related-tools a,.knowledge-link,.copy-tweet-link{font:inherit;font-size:13px;color:var(--link-color,#1d9bf0);background:transparent;border:0;padding:4px;cursor:pointer}.related-card{margin-bottom:16px}.related-panel h2{font-size:20px;margin:20px 0}.related-card .tweet-text{overflow-wrap:anywhere}`;
  style.textContent += '.tweet-card .tweet-top-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:0;border-bottom:1px solid var(--border-color,#ddd);padding:0 0 12px;margin:0 0 12px}.tweet-card .tweet-source-footer{display:flex;justify-content:flex-end;border-top:1px solid var(--border-color,#ddd);padding-top:12px;margin-top:12px}.tweet-card .tweet-source-link{font-size:14px;color:var(--link-color,#1d9bf0);text-decoration:none}';
  document.head.append(style);
  function arrange(c) {
    if (c.querySelector('.tweet-top-actions')) return;
    const top = c.querySelector('.tweet-footer');
    if (top) { top.classList.add('tweet-top-actions'); c.prepend(top); }
    const source = c.querySelector('.tweet-link');
    if (source) { source.className = 'tweet-source-link'; source.textContent = 'View on X ↗'; source.title = 'View original tweet on X'; const bottom = el('footer', null, 'tweet-source-footer'); bottom.append(source); c.append(bottom); }
  }
  const panel = el('aside', null, 'related-panel'); panel.setAttribute('aria-label', 'Related tweets'); panel.hidden = true;
  let sequence = 0;
  const button = (text, fn) => { const b = el('button', text); b.type = 'button'; b.onclick = fn; return b; };
  const linkFor = id => location.origin + '/tweet/' + encodeURIComponent(id);
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
    if (!selected) { const related = el('a', 'Related →'); related.href = linkFor(tweet.tweetId); footer.append(related); }
    actions.append(button('Copy link', async () => { try { await navigator.clipboard.writeText(linkFor(tweet.tweetId)); notice.textContent = 'Link copied.'; } catch { notice.textContent = linkFor(tweet.tweetId); } }));
    footer.append(...actions.childNodes); arrange(t); return c;
  }
  async function open(id) {
    const seq = ++sequence;
    (document.querySelector('main') || document.body).append(panel);
    panel.hidden = false;
    const tools = el('nav', null, 'related-tools');
    const timeline = el('a', '← Back to timeline'); timeline.href = '/archive/'; tools.append(timeline);
    panel.replaceChildren(tools, notice); notice.textContent = 'Finding related tweets…';
    try {
      const response = await fetch('/api/knowledge/graph?id=' + encodeURIComponent(id));
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Unable to load related tweets.');
      if (seq !== sequence) return;
      notice.textContent = '';
      document.title = (data.nodes[0].tweet.user?.name || 'Tweet') + ' — Twitter Likes Archive';
      panel.append(card(data.nodes[0].tweet, true), el('h2', 'Related tweets'));
      panel.dataset.centerId = id;
      for (const node of data.nodes.slice(1, 7)) panel.append(card(node.tweet));
      if (data.nodes.length === 1) panel.append(el('p', 'No close semantic neighbors found yet.'));
      panel.scrollTop = 0;
    } catch (e) { if (seq === sequence) notice.textContent = e.message; }
  }
  function enhance() {
    for (const c of document.querySelectorAll('article[id^="tweet-"]')) {
      if (c.querySelector('.knowledge-link')) { arrange(c); continue; }
      const id = c.id.slice(6); if (!/^\d+$/.test(id)) continue;
      const a = el('a', 'Related ↗', 'knowledge-link'); a.href = linkFor(id); a.title = 'Explore related tweets';
      const copy = button('Copy link', async () => { try { await navigator.clipboard.writeText(linkFor(id)); copy.textContent = 'Copied'; } catch { window.prompt('Copy tweet URL', linkFor(id)); } }); copy.className = 'copy-tweet-link';
      (c.querySelector('footer') || c).append(copy);
      (c.querySelector('footer') || c).append(a);
      arrange(c);
    }
  }
  enhance(); new MutationObserver(enhance).observe(document.body, { childList:true, subtree:true });
  const initial = location.pathname.match(/^\/tweet\/(\d+)$/)?.[1];
  if (initial) open(initial);
  else { const legacy = new URLSearchParams(location.search).get('related'); if (/^\d+$/.test(legacy || '')) location.replace(linkFor(legacy)); }
})();
