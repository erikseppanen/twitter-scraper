(() => {
  function enhance() {
    for (const card of document.querySelectorAll('article[id^="tweet-"]')) {
      if (card.querySelector('.knowledge-link')) continue;
      const id = card.id.slice(6);
      if (!/^\d+$/.test(id)) continue;
      const link = document.createElement('a');
      link.className = 'knowledge-link'; link.href = '/knowledge/tweet/' + id;
      link.textContent = 'Explore related ↗';
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
