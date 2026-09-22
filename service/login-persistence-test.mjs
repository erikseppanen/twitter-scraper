import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Worker, run } from './worker.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'archive-login-test-'));
let visited; let phase='normal'; let receivedCookie='';
const ready=new Promise(resolve=>{visited=resolve;});
const server=http.createServer((req,res)=>{
 if(phase==='verify' && req.url==='/')receivedCookie=req.headers.cookie||'';
 if(phase==='normal') res.setHeader('Set-Cookie','archive_test_marker=roundtrip; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax');
 res.setHeader('Content-Type','text/html');
 res.end('<title>Archive session test</title>Checking browser session persistence. This window will close automatically.<script>fetch("/confirm")</script>');
 if(req.url==='/confirm'){ console.log('Normal browser holds test cookie:',(req.headers.cookie||'').includes('archive_test_marker=roundtrip'));visited(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
let child, context, timer;
try {
 const worker=new Worker(root,root,async()=>{},{});
 child=await worker.launchLogin(url);
 await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Chrome did not load the local test page')),20000);})]);
 clearTimeout(timer);
 await new Promise(resolve=>setTimeout(resolve,2000));
 await worker.closeLogin(child);child=null;
 console.log('Cookie rows before scraper:', await run('/opt/homebrew/bin/python3',['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(c.execute("select name,length(encrypted_value),length(value) from cookies").fetchall())',path.join(root,'browser/Default/Cookies')]));
 phase='verify';
 context=await worker.browser(true);
 const page=context.pages()[0]||await context.newPage();
 await page.goto(url);
 console.log('Saved test cookie sent on first request:',receivedCookie.includes('archive_test_marker=roundtrip'));
 const cookies=await context.cookies(url);
 assert.equal(cookies.find(c=>c.name==='archive_test_marker')?.value,'roundtrip');
 console.log('PASS: normal Chrome session cookie survives closing and reopening through the scraper with the real macOS keychain.');
} finally {
 clearTimeout(timer);
 if(context)await context.close();
 if(child){const closed=once(child,'exit');child.kill('SIGTERM');await closed;}
 await new Promise(resolve=>server.close(resolve));
 await rm(root,{recursive:true,force:true});
}
