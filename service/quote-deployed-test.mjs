import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const link=(await readFile(new URL('../.service/private-link.txt',import.meta.url),'utf8')).trim();
const origin=new URL(link).origin;
const args=process.env.ARCHIVE_PUBLIC_IP ? [`--host-resolver-rules=MAP ${new URL(link).hostname} ${process.env.ARCHIVE_PUBLIC_IP}`] : [];
const browser=await chromium.launch({channel:'chrome',headless:true,args});
try {
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(origin);
 // Signed out, archive data redirects to the unlock page instead of loading.
 const unauth=await page.evaluate(async()=>{const r=await fetch('/archive/tweets.json',{redirect:'manual'});return r.type==='opaqueredirect'?'redirect':r.status;});
 assert.equal(unauth,'redirect');
 await page.goto(link);
 await page.waitForURL(/\/app\/$/,{timeout:20000});
 assert.equal(new URL(page.url()).hash,'');
 const data=await page.evaluate(async()=>{
  const r=await fetch('/archive/tweets.json');
  const tweets=await r.json();
  const media=tweets.flatMap(t=>t.media||[]).find(m=>m.localPath);
  const m=await fetch('/archive/media/'+media.localPath,{headers:{Range:'bytes=0-31'}});
  const hidden=await fetch('/archive/.tweet-cache.edn');
  return {status:r.status,count:tweets.length,mediaStatus:m.status,bytes:(await m.arrayBuffer()).byteLength,hiddenStatus:hidden.status};
 });
 assert.equal(data.status,200);assert.ok(data.count>0);assert.equal(data.mediaStatus,206);assert.equal(data.bytes,32);assert.equal(data.hiddenStatus,404);
 const sample=await page.evaluate(async()=>(await (await fetch('/archive/tweets.json')).json()).find(t=>t.quote?.media?.some(m=>m.type==='photo' && m.localPath)));
 assert.ok(sample, 'A quoted photo is needed for this deployment check');
 // Test an existing archived quote without recording private IDs or content in source/logs.
 const expected=sample.quote.media.filter(m=>m.type==='photo').length;
 await page.goto(origin+'/app/tweet/'+encodeURIComponent(sample.tweetId));
 await page.locator('.quote-card').scrollIntoViewIfNeeded();
 await page.waitForFunction(count=>{
  const images=[...document.querySelectorAll('.quote-card .media-grid img')];
  return images.length===count && images.every(i=>i.complete&&i.naturalWidth>0);
 },expected);
 console.log('PASS: protected live archive and quoted photos on a tweet's page.');
}finally{await browser.close();}
