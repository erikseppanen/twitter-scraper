import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = await mkdtemp(path.join(os.tmpdir(), 'quoted-media-'));
const fixture = `{:tweet-id "20" :text "Parent post" :quote {:tweet-id "10" :text "Quoted mountain" :user {:name "Quoted author" :screen-name "quoted"} :media [{:type :photo :url "https://example.invalid/a.png" :local-path "10_0.png"} {:type :photo :url "https://example.invalid/b.png" :local-path "10_1.png"}]}}`;
execFileSync('clojure', ['-M', '-e', `(require '[twitter-scraper.html :as h]) (h/copy-css ${JSON.stringify(root)}) (h/generate-all-pages [${fixture}] ${JSON.stringify(root)} {})`], {cwd: new URL('..', import.meta.url), stdio:'pipe'});
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const server = createServer(async(req,res)=>{
 try {
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/media/')) { res.setHeader('Content-Type','image/png');res.end(pixel);return; }
  res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(path.join(root, pathname==='/'?'index.html':pathname)));
 } catch {res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 for(const route of ['/', '/tweets/20.html']) {
  await page.goto(origin+route);
  await page.waitForFunction(()=>document.querySelectorAll('.quote-card img').length===2 && [...document.querySelectorAll('.quote-card img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('.quote-card a a').count(),0);
  assert.equal(await page.locator('.quote-card img').count(),2);
  assert.match(await page.locator('.quote-card').innerText(),/Quoted mountain/);
 }
 console.log('PASS: quoted photos load inside the quote on both archive and individual pages; links remain valid.');
} finally {
 await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true});
}
