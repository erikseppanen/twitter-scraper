import http from 'node:http';
import { readFile, mkdir, stat, realpath, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, atomicJSON } from './worker.mjs';
import { KnowledgeIndex } from './knowledge.mjs';
import { Translations } from './translation.mjs';

export function equal(a, b) {
  return typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
const webDist = fileURLToPath(new URL('../web/dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
// Text bodies are compressed once and reused. The ETag lets a browser keep its copy
// and ask whether it is still current instead of downloading it again.
export function cacheEntry(body) {
  body = Buffer.from(body);
  return { body, gzip: gzipSync(body), etag: '"' + createHash('sha256').update(body).digest('base64url').slice(0, 27) + '"' };
}
export function sendEntry(req, res, entry, type, cacheControl) {
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', entry.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(entry.etag)) { res.writeHead(304); return res.end(); }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gzip ? entry.gzip : entry.body;
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, ...(gzip && { 'Content-Encoding': 'gzip' }) });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export async function createApp({ root, stateDir, publicOrigin, workerFactory, schedule = true, knowledgeIndex, translations: translationService, indexKnowledge = schedule }) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  // Recover the small publication rename window after an unexpected shutdown.
  try { await stat(path.join(root, 'archive')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; try { await rename(path.join(root, 'archive-previous'), path.join(root, 'archive')); } catch (e) { if (e.code !== 'ENOENT') throw e; await mkdir(path.join(root, 'archive'), { recursive: true }); } }
  let config;
  try { config = JSON.parse(await readFile(path.join(stateDir, 'access.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; config = { token: randomBytes(32).toString('base64url') }; await atomicJSON(path.join(stateDir, 'access.json'), config); }
  let state = { message: 'Connect X to enable automatic updates.', nextRun: new Date().toISOString() };
  try { state = JSON.parse(await readFile(path.join(stateDir, 'status.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  state.running = false;
  const save = () => atomicJSON(path.join(stateDir, 'status.json'), state);
  const worker = workerFactory ? workerFactory(state) : new Worker(root, stateDir, save, state);
  // Removed IDs stay hidden immediately and are never re-imported; the worker purges their files.
  const removedFile = path.join(stateDir, 'removed.json');
  try { worker.removed = new Set(JSON.parse(await readFile(removedFile, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') throw e; worker.removed = new Set(); }
  const removed = worker.removed;
  const purge = () => { if (!worker.busy) worker.purge().catch(() => {}); };
  const secure = publicOrigin.startsWith('https:');
  const cookieName = secure ? '__Host-archive' : 'archive';
  const dashboard = await readFile(new URL('./dashboard.html', import.meta.url));
  const translations = translationService || new Translations(root, stateDir);
  const knowledge = knowledgeIndex || new KnowledgeIndex(root, stateDir);
  const background = () => { void knowledge.refresh(); translations.warm().catch(() => {}); };
  if (indexKnowledge) background();
  const knowledgeTimer = indexKnowledge ? setInterval(background, 60000) : null;
  // tweets.json without removed tweets, rebuilt only when the file or the removed list changes.
  let archiveData = null;
  const tweetsEntry = async (file, info) => {
    const key = `${info.mtimeMs}:${info.size}:${removed.size}`;
    if (archiveData?.key !== key) {
      let body = await readFile(file);
      if (removed.size) body = JSON.stringify(JSON.parse(body).filter(t => !removed.has(String(t.tweetId))));
      archiveData = { key, ...cacheEntry(body) };
    }
    return archiveData;
  };
  const appFiles = new Map();
  const appEntry = async name => {
    const file = path.join(webDist, name), { mtimeMs } = await stat(file);
    if (appFiles.get(name)?.mtimeMs !== mtimeMs) appFiles.set(name, { mtimeMs, ...cacheEntry(await readFile(file)) });
    return appFiles.get(name);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const reply = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    try {
      const url = new URL(req.url, publicOrigin);
      if (req.headers.host !== new URL(publicOrigin).host && req.headers.host !== `127.0.0.1:${server.address().port}`) return reply(403, { error: 'Invalid host' });
      if (req.method === 'POST' && req.headers.origin !== publicOrigin) return reply(403, { error: 'Invalid origin' });
      if (req.method === 'POST' && url.pathname === '/session') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1024) return reply(413, { error: 'Too large' }); }
        if (!equal(JSON.parse(body).token, config.token)) return reply(401, { error: 'Invalid link' });
        res.setHeader('Set-Cookie', `${cookieName}=${config.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure ? '; Secure' : ''}`);
        return reply(200, { ok: true });
      }
      const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')));
      const authorized = equal(cookies[cookieName], config.token);
      if (req.method === 'GET' && url.pathname === '/') return reply(200, dashboard, 'text/html; charset=utf-8');
      const tweetPage = /^\/tweet\/\d+$/.test(url.pathname);
      const knowledgePage = url.pathname === '/knowledge' || /^\/knowledge\/tweet\/\d+$/.test(url.pathname);
      // Explore became part of Likes; its old addresses still arrive at the same tweet or search.
      const explorePage = /^\/app\/explore(\/tweet\/\d+)?\/?$/.exec(url.pathname);
      const appPage = url.pathname === '/app' || url.pathname.startsWith('/app/');
      if (!authorized && req.method === 'GET' && (knowledgePage || tweetPage || appPage || url.pathname.startsWith('/archive/'))) {
        res.writeHead(302, { Location: '/?next=' + encodeURIComponent(url.pathname + url.search) }); return res.end();
      }
      if (!authorized) return reply(401, { error: 'Open your private bookmark to access the archive.' });
      // Stable links (Permalink, and /knowledge/tweet/ID in saved notes) open the app.
      if (req.method === 'GET' && (tweetPage || knowledgePage || explorePage)) {
        const id = /\/tweet\/(\d+)\/?$/.exec(url.pathname)?.[1];
        const query = explorePage && url.searchParams.get('q');
        res.writeHead(302, { Location: id ? '/app/tweet/' + id : '/app/' + (query ? '?' + new URLSearchParams({ query }) : '') });
        return res.end();
      }
      if (req.method === 'GET' && appPage) {
        if (url.pathname === '/app') { res.writeHead(302, { Location: '/app/' + url.search }); return res.end(); }
        // The React app (web/, built by Vite). Hashed assets are immutable; other paths are app routes.
        const asset = /^\/app\/(assets\/[\w.-]+)$/.exec(url.pathname)?.[1];
        try {
          if (!asset) return sendEntry(req, res, await appEntry('index.html'), mime['.html'], 'no-cache');
          if (!mime[path.extname(asset)]) return reply(404, { error: 'Not found' });
          return sendEntry(req, res, await appEntry(asset), mime[path.extname(asset)], 'private, max-age=31536000, immutable');
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
          return asset ? reply(404, { error: 'Not found' }) : reply(503, 'The web app has not been built. Run npm run build --prefix web.', 'text/plain; charset=utf-8');
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/translation') {
        const id = url.searchParams.get('id');
        if (!/^\d+$/.test(id || '')) return reply(400, { error: 'Invalid tweet ID' });
        return reply(200, await translations.get(id, url.searchParams.get('quote') === '1'));
      }
      if (req.method === 'GET' && url.pathname === '/api/knowledge/status') return reply(200, knowledge.summary());
      if (req.method === 'GET' && ['/api/knowledge/search', '/api/knowledge/related'].includes(url.pathname)) {
        if (!knowledge.rows.length) return reply(503, { error: knowledge.status.message });
        // The index drops removed tweets on its next refresh; hide them until then.
        const kept = list => list.filter(r => !removed.has(r.tweetId));
        if (url.pathname.endsWith('/search')) {
          const query = url.searchParams.get('q') || '';
          if (query.length > 2000) return reply(400, { error: 'Search is limited to 2,000 characters.' });
          return reply(200, { results: kept(await knowledge.search(query)) });
        }
        const id = url.searchParams.get('id');
        const related = removed.has(id) ? null : knowledge.related(id);
        if (!related) return reply(404, { error: 'Tweet not found in the semantic index.' });
        return reply(200, { related: kept(related) });
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return reply(200, { ...state, busy: worker.busy });
      if (req.method === 'POST' && ['/api/update', '/api/connect', '/api/finish'].includes(url.pathname)) {
        if ((worker.busy || (state.loginPending && url.pathname === '/api/update')) && url.pathname !== '/api/finish') return reply(409, { error: 'An update or sign-in is already running.' });
        if (url.pathname === '/api/finish' && !worker.login && !state.loginPending) return reply(409, { error: 'No sign-in is in progress.' });
        const action = url.pathname.split('/').at(-1);
        worker[action]().catch(async e => { state.error = e.message; state.message = e.message; await save(); });
        return reply(202, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/remove') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1024) return reply(413, { error: 'Too large' }); }
        const id = String(JSON.parse(body).id || '');
        if (!/^\d+$/.test(id)) return reply(400, { error: 'Invalid tweet ID' });
        if (!removed.has(id)) {
          removed.add(id);
          await atomicJSON(removedFile, [...removed]);
          state.removalPending = true; state.removalRetryAt = null; await save();
        }
        purge();
        return reply(202, { ok: true });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return reply(405, { error: 'Method not allowed' });
      if (!url.pathname.startsWith('/archive/')) return reply(404, { error: 'Not found' });
      // Article pages moved into the app; links saved before then still work.
      const oldArticle = /^\/archive\/articles\/(\d+)\.html$/.exec(url.pathname)?.[1];
      if (oldArticle) { res.writeHead(302, { Location: '/app/article/' + oldArticle }); return res.end(); }
      const relative = decodeURIComponent(url.pathname.slice('/archive/'.length));
      if (relative.split('/').some(part => part.startsWith('.')) || relative.includes('\\')) return reply(404, { error: 'Not found' });
      if (removed.has(/^(?:articles|media)\/(\d+)[._-]/.exec(relative)?.[1])) return reply(404, { error: 'Not found' });
      const archive = await realpath(path.join(root, 'archive'));
      const file = await realpath(path.resolve(archive, relative));
      if (!file.startsWith(archive + path.sep)) return reply(404, { error: 'Not found' });
      const info = await stat(file);
      if (!info.isFile() || !mime[path.extname(file)]) return reply(404, { error: 'Not found' });
      if (relative === 'tweets.json') return sendEntry(req, res, await tweetsEntry(file, info), mime['.json'], 'private, no-cache');
      let start = 0, end = info.size - 1, code = 200;
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!match) return reply(416, { error: 'Invalid range' });
        start = Number(match[1]); end = match[2] ? Number(match[2]) : end;
        if (start > end || end >= info.size) return reply(416, { error: 'Invalid range' });
        code = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      res.writeHead(code, { 'Content-Type': mime[path.extname(file)], 'Content-Length': Math.max(0, end - start + 1), 'Accept-Ranges': 'bytes' });
      if (req.method === 'HEAD' || info.size === 0) return res.end();
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
    } catch (e) { if (!res.headersSent) reply(e.code === 'ENOENT' ? 404 : 400, { error: 'Request could not be completed' }); else res.destroy(); }
  });
  const timer = schedule ? setInterval(() => {
    if (state.removalPending && !worker.busy && Date.now() >= Date.parse(state.removalRetryAt || 0)) return purge();
    if (!state.paused && !state.loginPending && !worker.busy && Date.now() >= Date.parse(state.nextRun)) worker.update().catch(() => {});
  }, 30000) : null;
  server.on('close', () => { clearInterval(timer); clearInterval(knowledgeTimer); });
  return { server, config, state, worker, knowledge };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const root = path.resolve(process.env.ARCHIVE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const { server } = await createApp({ root, stateDir: path.join(root, '.service'), publicOrigin: process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:4318' });
  server.listen(Number(process.env.PORT || 4318), '127.0.0.1', () => console.log('Archive service listening on loopback'));
}
