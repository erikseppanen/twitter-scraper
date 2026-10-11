(() => {
  const seen=new WeakSet();
  const observer=new IntersectionObserver(entries=>{ for(const entry of entries) if(entry.isIntersecting){observer.unobserve(entry.target);translate(entry.target);} },{rootMargin:'100px'});
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  // Retry transient failures; the server joins a repeated request to the translation already running.
  const delays=[2000,5000,15000];
  async function request(id,quote) {
    for(let attempt=0;;attempt++) {
      try {
        const response=await fetch('/api/translation?'+new URLSearchParams({id,quote:quote?'1':'0'}));
        if(response.ok) return await response.json();
        if(response.status<500||attempt>=delays.length) throw Error('unavailable');
      } catch(e) { if(attempt>=delays.length) throw e; }
      await wait(delays[attempt]);
    }
  }
  async function translate(node) {
    const card=node.closest('[data-tweet-id],article[id^="tweet-"]');
    const id=card?.dataset.tweetId || card?.id.slice(6); if(!/^\d+$/.test(id||'')) return;
    const quote=!!node.closest('.quote-card');
    const toggle=document.createElement('button');toggle.type='button';toggle.className='translation-toggle';
    toggle.style.cssText='display:block;color:var(--link-color,#1d9bf0);background:none;border:0;padding:6px 0;font:inherit;font-size:12px;cursor:pointer';
    toggle.onclick=e=>{e.preventDefault();e.stopPropagation();};
    // English and cached tweets answer quickly; label only requests that are still working.
    const label=setTimeout(()=>{if(node.isConnected){toggle.textContent='Translating…';toggle.disabled=true;toggle.style.cursor='default';node.before(toggle);}},400);
    let result;
    try { result=await request(id,quote); }
    catch {
      clearTimeout(label);
      // Keep the readable original and offer another attempt.
      if(!node.isConnected) return;
      toggle.textContent='Translation unavailable · Retry';toggle.disabled=false;toggle.style.cursor='pointer';
      toggle.onclick=e=>{e.preventDefault();e.stopPropagation();toggle.remove();translate(node);};
      node.before(toggle); return;
    }
    clearTimeout(label);
    if(result.status!=='translated'||!node.isConnected){toggle.remove();return;}
    const original=[...node.childNodes].map(n=>n.cloneNode(true));
    let translated=true;
    function render(){node.replaceChildren(...(translated?[document.createTextNode(result.text)]:original.map(n=>n.cloneNode(true)))); toggle.textContent=translated?'Translated from '+result.language+' · Show original':'Show English translation';}
    toggle.disabled=false;toggle.style.cursor='pointer';
    toggle.onclick=e=>{e.preventDefault();e.stopPropagation();translated=!translated;render();};render();node.before(toggle);
  }
  function scan(){for(const node of document.querySelectorAll('.tweet-text,.quote-text'))if(!seen.has(node)){seen.add(node);observer.observe(node);}}
  scan();new MutationObserver(scan).observe(document.body,{subtree:true,childList:true});
})();
