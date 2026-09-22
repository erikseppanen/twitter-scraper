import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.PUBLIC_ORIGIN;
assert.ok(origin?.startsWith('https://'));
const {token} = JSON.parse(await readFile(new URL('../.service/access.json',import.meta.url)));
const base = 'http://127.0.0.1:4318';
assert.equal((await fetch(base+'/archive/tweets.json')).status,401);
const login = await fetch(base+'/session',{method:'POST',headers:{Origin:origin},body:JSON.stringify({token})});
assert.equal(login.status,200);
const headers = {Cookie:login.headers.get('set-cookie').split(';')[0]};
const response = await fetch(base+'/archive/tweets.json',{headers});
assert.equal(response.status,200);
const tweets = await response.json();
assert.ok(tweets.length>0);
assert.equal((await fetch(base+'/archive/.tweet-cache.edn',{headers})).status,404);
const media = tweets.flatMap(t=>t.media || []).find(m=>m.localPath);
assert.ok(media);
const result = await fetch(base+'/archive/media/'+media.localPath,{headers:{...headers,Range:'bytes=0-31'}});
assert.equal(result.status,206); assert.equal((await result.arrayBuffer()).byteLength,32);
console.log(`PASS: ${tweets.length} archived tweets accessible with authentication; media ranges work; data blocked without token; cache hidden.`);
if(process.argv.includes('--connect')) {
  const r = await fetch(base+'/api/connect',{method:'POST',headers:{...headers,Origin:origin}});
  console.log('Connect X response:',r.status);
}
console.log('Status:',await (await fetch(base+'/api/status',{headers})).json());
