import http from 'node:http';
import { readFile, mkdir, stat, realpath, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, atomicJSON } from './worker.mjs';
import { KnowledgeIndex } from './knowledge.mjs';

export function equal(a, b) {
  return typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
export async function createApp({ root, stateDir, publicOrigin, workerFactory, schedule = true, knowledgeIndex, indexKnowledge = schedule }) {
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
  const secure = publicOrigin.startsWith('https:');
  const cookieName = secure ? '__Host-archive' : 'archive';
  const dashboard = await readFile(new URL('./dashboard.html', import.meta.url));
  const knowledge = knowledgeIndex || new KnowledgeIndex(root, stateDir);
  const assets = new Map(await Promise.all(['knowledge.html', 'knowledge.css', 'knowledge-ui.js', 'knowledge-links.js'].map(async name => [name, await readFile(new URL('./' + name, import.meta.url))])));
  if (indexKnowledge) void knowledge.refresh();
  const knowledgeTimer = indexKnowledge ? setInterval(() => { void knowledge.refresh(); }, 60000) : null;
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
      const knowledgePage = url.pathname === '/knowledge' || /^\/knowledge\/tweet\/\d+$/.test(url.pathname);
      if (!authorized && req.method === 'GET' && knowledgePage) {
        res.writeHead(302, { Location: '/?next=' + encodeURIComponent(url.pathname + url.search) }); return res.end();
      }
      if (!authorized) return reply(401, { error: 'Open your private bookmark to access the archive.' });
      if (req.method === 'GET' && knowledgePage) return reply(200, assets.get('knowledge.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && ['/knowledge.css', '/knowledge-ui.js', '/knowledge-links.js'].includes(url.pathname)) return reply(200, assets.get(url.pathname.slice(1)), mime[path.extname(url.pathname)]);
      if (req.method === 'GET' && url.pathname === '/api/knowledge/status') return reply(200, knowledge.summary());
      if (req.method === 'GET' && ['/api/knowledge/search', '/api/knowledge/graph'].includes(url.pathname)) {
        if (!knowledge.rows.length) return reply(503, { error: knowledge.status.message });
        if (url.pathname.endsWith('/search')) {
          const query = url.searchParams.get('q') || '';
          if (query.length > 2000) return reply(400, { error: 'Search is limited to 2,000 characters.' });
          return reply(200, { results: await knowledge.search(query, url.searchParams.get('topic')) });
        }
        const graph = knowledge.graph(url.searchParams.get('id'));
        return graph ? reply(200, graph) : reply(404, { error: 'Tweet not found in the semantic index.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return reply(200, { ...state, busy: worker.busy });
      if (req.method === 'POST' && ['/api/update', '/api/connect', '/api/finish'].includes(url.pathname)) {
        if ((worker.busy || (state.loginPending && url.pathname === '/api/update')) && url.pathname !== '/api/finish') return reply(409, { error: 'An update or sign-in is already running.' });
        if (url.pathname === '/api/finish' && !worker.login && !state.loginPending) return reply(409, { error: 'No sign-in is in progress.' });
        const action = url.pathname.split('/').at(-1);
        worker[action]().catch(async e => { state.error = e.message; state.message = e.message; await save(); });
        return reply(202, { ok: true });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return reply(405, { error: 'Method not allowed' });
      if (!url.pathname.startsWith('/archive/')) return reply(404, { error: 'Not found' });
      const relative = decodeURIComponent(url.pathname.slice('/archive/'.length)) || 'index.html';
      if (relative.split('/').some(part => part.startsWith('.')) || relative.includes('\\')) return reply(404, { error: 'Not found' });
      const archive = await realpath(path.join(root, 'archive'));
      const file = await realpath(path.resolve(archive, relative));
      if (!file.startsWith(archive + path.sep)) return reply(404, { error: 'Not found' });
      const info = await stat(file);
      if (!info.isFile() || !mime[path.extname(file)]) return reply(404, { error: 'Not found' });
      // Add knowledge actions to previously generated archives without rebuilding stored files.
      if (path.extname(file) === '.html' && req.method === 'GET') {
        const html = (await readFile(file, 'utf8')).replace('</body>', '<script src="/knowledge-links.js"></script></body>');
        return reply(200, html, mime['.html']);
      }
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
