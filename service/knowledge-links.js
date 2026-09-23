(() => {
  function enhance() {
    for (const card of document.querySelectorAll('article[id^="tweet-"]')) {
      if (card.querySelector('.knowledge-link')) continue;
      const id = card.id.slice(6);
      if (!/^\d+$/.test(id)) continue;
      const link = document.createElement('a');
      link.className = 'knowledge-link'; link.href = '/knowledge/tweet/' + id;
      link.title = 'Open in Knowledge Explorer';
      link.setAttribute('aria-label', 'Open in Knowledge Explorer');
      link.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-left:8px;flex-shrink:0;color:var(--accent,#1d9bf0)';
      link.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7M7 7v10M17 7v10"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/></svg>';
      (card.querySelector('footer') || card).append(link);
    }
    if (!document.querySelector('.knowledge-nav')) {
      const nav = document.createElement('a'); nav.className = 'knowledge-nav'; nav.href = '/knowledge';
      nav.textContent = 'Knowledge explorer'; nav.style.cssText = 'display:inline-block;margin:12px;padding:8px';
      (document.querySelector('header') || document.body).prepend(nav);
    }
  }
  enhance(); new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
})();
