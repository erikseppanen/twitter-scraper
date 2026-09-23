const $ = s => document.querySelector(s);
let selected = null, request = 0, graphData, statusTimer;
const NS = 'http://www.w3.org/2000/svg';
function element(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }
async function api(url) {
  const response = await fetch(url);
  if (response.status === 401) { location.href = '/?next=' + encodeURIComponent(location.pathname + location.search); throw Error('Sign in using your private bookmark.'); }
  const data = await response.json(); if (!response.ok) throw Error(data.error || 'Request failed'); return data;
}
function note(text) { $('#notice').textContent = text; }
function urlFor(id) { return location.origin + '/knowledge/tweet/' + encodeURIComponent(id); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); note('Copied to clipboard.'); }
  catch { const input = element('textarea', undefined, 'copy-fallback'); input.value = text; input.readOnly = true; $('#detail').append(input); input.focus(); input.select(); note('Select and copy the link below.'); }
}
function title(tweet) { return '@' + (tweet.user?.screenName || 'unknown') + ': ' + (tweet.text || tweet.quote?.text || 'Saved tweet').replace(/\s+/g, ' ').slice(0, 90); }
function tweetDate(tweet) {
  const date = new Date(tweet.createdAt || NaN);
  if (!Number.isFinite(date.getTime())) return element('span', 'Date unavailable', 'tweet-date muted');
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) || ['second', 1];
  const age = Math.abs(seconds) < 60 ? 'just now' : new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.trunc(seconds / size), unit);
  const time = element('time', `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${age}`, 'tweet-date muted');
  time.dateTime = date.toISOString(); time.title = 'Posted ' + date.toLocaleString();
  return time;
}
function card(row) {
  const b = element('button', undefined, 'result' + (row.tweet.tweetId === selected ? ' selected' : ''));
  b.dataset.tweetId = row.tweet.tweetId;
  b.append(element('strong', '@' + (row.tweet.user?.screenName || 'unknown')), element('p', (row.tweet.text || row.tweet.quote?.text || '').slice(0, 190)), element('span', row.tweet.topic, 'badge'));
  b.append(tweetDate(row.tweet));
  b.onclick = () => openTweet(row.tweet.tweetId); return b;
}
async function search() {
  const seq = ++request, q = $('#query').value.trim(), topic = $('#topic').value;
  $('#results-title').textContent = q ? 'Searching by meaning…' : 'Recent ideas';
  try {
    const { results } = await api('/api/knowledge/search?' + new URLSearchParams({ q, topic }));
    if (seq !== request) return;
    $('#results-title').textContent = q ? 'Semantically related results' : 'Recent ideas';
    $('#results').replaceChildren(...results.map(card));
    if (!results.length) $('#results').append(element('p', 'No tweets in this topic yet.'));
    if (!selected && results.length) await openTweet(results[0].tweet.tweetId, false);
  } catch (e) { if (seq === request) $('#results-title').textContent = e.message; }
}
function media(items, container) {
  const grid = element('div', undefined, 'media');
  for (const item of items || []) {
    let src = item.localPath ? '/archive/media/' + encodeURIComponent(item.localPath) : item.url;
    if (!src || (!src.startsWith('/archive/media/') && !/^https:\/\//.test(src))) continue;
    if (item.type === 'photo') { const a = element('a'); a.href = src; a.target = '_blank'; a.rel = 'noopener'; const img = element('img'); img.src = src; img.alt = 'Archived tweet image'; img.loading = 'lazy'; a.append(img); grid.append(a); }
    else if (['video', 'gif'].includes(item.type)) { const video = element('video'); video.src = src; video.controls = true; video.preload = 'metadata'; grid.append(video); }
  }
  if (grid.childNodes.length) container.append(grid);
}
function detail(data) {
  const t = data.nodes[0].tweet, panel = $('#detail'); panel.replaceChildren();
  panel.append(element('h2', t.user?.name || t.user?.screenName || 'Saved tweet'), element('span', '@' + (t.user?.screenName || 'unknown') + ' · ' + t.topic, 'muted'), tweetDate(t), element('p', t.text || '', 'body'));
  media(t.media, panel);
  if (t.quote) { const q = element('div', undefined, 'quote'); q.append(element('strong', '@' + (t.quote.user?.screenName || 'unknown')), tweetDate(t.quote), element('p', t.quote.text || '', 'body')); media(t.quote.media, q); panel.append(q); }
  if (t.article) panel.append(element('h3', t.article.title || 'Article'), element('p', t.article.previewText || ''));
  const actions = element('div', undefined, 'actions');
  for (const [label, handler] of [['Copy link', () => copy(urlFor(t.tweetId))], ['Copy Org link', () => copy(`[[${urlFor(t.tweetId)}][${title(t).replace(/[\[\]\r\n]/g, '')}]]`)]]) { const b = element('button', label); b.onclick = handler; actions.append(b); }
  const original = element('a', 'View archived page ↗'); original.href = '/archive/tweets/' + t.tweetId + '.html'; actions.append(original); panel.append(actions);
  const related = element('div', undefined, 'related'); related.append(element('h3', 'Related ideas'));
  for (const row of data.nodes.slice(1)) { const b = element('button', title(row.tweet)); b.append(tweetDate(row.tweet)); b.onclick = () => openTweet(row.tweet.tweetId); related.append(b); }
  if (data.nodes.length === 1) related.append(element('p', 'No close semantic neighbors found yet.'));
  panel.append(related);
}
function svgElement(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
function graph(data) {
  $('#neighborhood-title').textContent = data.neighborhood?.title || 'Semantic neighborhood';
  const themes = data.neighborhood?.themes || [];
  $('#neighborhood-themes').replaceChildren(...themes.map(theme => element('span', theme, 'badge')));
  $('#neighborhood-caption').textContent = themes.length ? 'Shared themes in this neighborhood' : 'A suggested topic for these connected tweets';
  graphData = data; const svg = svgElement('svg', { viewBox: '0 0 800 440', role: 'group', 'aria-label': 'Related tweet graph. Use Tab and Enter to navigate nodes.' });
  const group = svgElement('g'); svg.append(group);
  const points = new Map(data.nodes.map((n, i) => { const angle = (i - 1) * 2 * Math.PI / Math.max(1, data.nodes.length - 1); const radius = 125 + (1 - n.score) * 100; return [n.tweet.tweetId, i ? [400 + Math.cos(angle) * radius * 1.35, 220 + Math.sin(angle) * radius * 0.78] : [400, 220]]; }));
  for (const edge of data.edges) { const [x1, y1] = points.get(edge.source), [x2, y2] = points.get(edge.target); group.append(svgElement('line', { x1, y1, x2, y2, class: 'edge', opacity: edge.source === data.center ? 0.3 + edge.score * 0.6 : 0.15, 'stroke-width': 1 + edge.score * 3 })); }
  for (const node of data.nodes) {
    const [x, y] = points.get(node.tweet.tweetId), center = node.tweet.tweetId === data.center;
    const g = svgElement('g', { transform: `translate(${x},${y})`, class: 'node' + (center ? ' center' : ''), tabindex: '0', role: 'button', 'aria-label': title(node.tweet) });
    g.append(svgElement('circle', { r: center ? 21 : 12 + node.score * 7 }));
    const label = svgElement('text', { y: 38, 'text-anchor': 'middle' }); label.textContent = (node.tweet.text || node.tweet.quote?.text || 'Saved tweet').replace(/\s+/g, ' ').slice(0, 29) + '…'; g.append(label);
    const tooltip = svgElement('title'); tooltip.textContent = title(node.tweet) + '\n' + tweetDate(node.tweet).textContent; g.append(tooltip);
    const activate = () => openTweet(node.tweet.tweetId);
    g.onclick = activate; g.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } }; group.append(g);
  }
  let scale = 1, dx = 0, dy = 0, drag;
  const transform = () => group.setAttribute('transform', `translate(${dx},${dy}) translate(400,220) scale(${scale}) translate(-400,-220)`);
  svg.onwheel = e => { e.preventDefault(); scale = Math.min(2.5, Math.max(0.6, scale * (e.deltaY > 0 ? 0.9 : 1.1))); transform(); };
  svg.onpointerdown = e => { if (!e.target.closest('.node')) { drag = [e.clientX, e.clientY, dx, dy]; svg.setPointerCapture(e.pointerId); } };
  svg.onpointermove = e => { if (drag) { const ratio = 800 / svg.getBoundingClientRect().width; dx = drag[2] + (e.clientX - drag[0]) * ratio; dy = drag[3] + (e.clientY - drag[1]) * ratio; transform(); } };
  svg.onpointerup = svg.onpointercancel = () => { drag = null; };
  $('#graph').replaceChildren(svg);
}
let selectionRequest = 0;
async function openTweet(id, push = true) {
  const seq = ++selectionRequest; note('Finding related ideas…');
  try {
    const data = await api('/api/knowledge/graph?id=' + encodeURIComponent(id));
    if (seq !== selectionRequest) return;
    selected = id; if (push) history.pushState(null, '', '/knowledge/tweet/' + id);
    for (const result of document.querySelectorAll('.result')) result.classList.toggle('selected', result.dataset.tweetId === id);
    document.title = title(data.nodes[0].tweet) + ' · Knowledge explorer'; graph(data); detail(data); note('');
  } catch (e) { if (seq === selectionRequest) note(e.message); }
}
$('#search').onsubmit = e => { e.preventDefault(); search(); };
$('#topic').onchange = search;
$('#reset').onclick = () => { if (graphData) graph(graphData); };
window.onpopstate = () => { const id = location.pathname.match(/\/tweet\/(\d+)$/)?.[1]; if (id) openTweet(id, false); else { selected = null; search(); } };
let started = false, topicsKey = '';
async function poll() {
  try {
    const status = await api('/api/knowledge/status');
    $('#status').textContent = status.state === 'indexing' ? `Indexing ${status.indexed} of ${status.total} tweets…` : status.message;
    const key = JSON.stringify(status.topics);
    if (key !== topicsKey) { const value = $('#topic').value; $('#topic').replaceChildren(new Option('All topics', ''), ...status.topics.map(t => new Option(t, t))); $('#topic').value = value; topicsKey = key; }
    if (!started && status.available) { started = true; const id = location.pathname.match(/\/tweet\/(\d+)$/)?.[1]; selected = id || null; await search(); if (id) await openTweet(id, false); }
    if (status.state === 'error') note('The index will retry automatically. Your archive is still available from Timeline.');
  } catch (e) { $('#status').textContent = e.message; }
}
poll(); statusTimer = setInterval(poll, 5000);
