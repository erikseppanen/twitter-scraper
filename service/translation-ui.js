(() => {
  const seen=new WeakSet();
  const observer=new IntersectionObserver(entries=>{ for(const entry of entries) if(entry.isIntersecting){observer.unobserve(entry.target);translate(entry.target);} },{rootMargin:'100px'});
  async function translate(node) {
    const card=node.closest('[data-tweet-id],article[id^="tweet-"]');
    const id=card?.dataset.tweetId || card?.id.slice(6); if(!/^\d+$/.test(id||'')) return;
    const quote=!!node.closest('.quote-card');
    try {
      const response=await fetch('/api/translation?'+new URLSearchParams({id,quote:quote?'1':'0'}));
      if(!response.ok) throw Error('unavailable'); const result=await response.json();
      if(result.status!=='translated'||!node.isConnected)return;
      const original=[...node.childNodes].map(n=>n.cloneNode(true));
      const toggle=document.createElement('button');toggle.type='button';toggle.className='translation-toggle';
      toggle.style.cssText='display:block;color:var(--link-color,#1d9bf0);background:none;border:0;padding:6px 0;font:inherit;font-size:12px;cursor:pointer';
      let translated=true;
      function render(){node.replaceChildren(...(translated?[document.createTextNode(result.text)]:original.map(n=>n.cloneNode(true)))); toggle.textContent=translated?'Translated from '+result.language+' · Show original':'Show English translation';}
      toggle.onclick=e=>{e.preventDefault();e.stopPropagation();translated=!translated;render();};render();node.before(toggle);
    } catch { /* Preserve the readable original if the local translator is unavailable. */ }
  }
  function scan(){for(const node of document.querySelectorAll('.tweet-text,.quote-text'))if(!seen.has(node)){seen.add(node);observer.observe(node);}}
  scan();new MutationObserver(scan).observe(document.body,{subtree:true,childList:true});
})();
