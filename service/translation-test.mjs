import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {Translations,detect} from './translation.mjs';
test('detect Spanish and Japanese, retain English, cache and invalidate translations',async()=>{
 assert.equal(detect('Este es un ejemplo de una publicación en español sobre la tecnología.')[1],'Spanish');
 assert.equal(detect('これは日本語の文章です。')[1],'Japanese');
 assert.equal(detect('This is an English tweet about learning and technology.'),null);
 assert.equal(detect('The world is simpler when you see it as a timeline.'),null);
 assert.equal(detect('A useful example.'),null);
 assert.equal(detect('Bonjour tout le monde, voici une nouvelle découverte.')[1],'French');
 assert.equal(detect('Je voudrais présenter mes nouvelles idées pour améliorer notre bibliothèque. Nous avons beaucoup de livres intéressants à partager avec tout le monde. Cette semaine, nous allons organiser une rencontre pour les lecteurs.')[1],'French');
 const root=await mkdtemp(path.join(os.tmpdir(),'translate-test-'));await mkdir(path.join(root,'archive'));
 const file=path.join(root,'archive/tweets.json');const rows=[{tweetId:'1',text:'Este es un ejemplo de una publicación en español sobre la tecnología.',quote:{text:'これは日本語の文章です。'}}];await writeFile(file,JSON.stringify(rows));
 let calls=0;const translate=async()=>{calls++;return 'English translation';};
 try {const service=new Translations(root,path.join(root,'state'),translate);const [a,b]=await Promise.all([service.get('1'),service.get('1')]);assert.equal(a.text,b.text);assert.equal(calls,1);await service.get('1');assert.equal(calls,1);assert.equal((await service.get('1',true)).language,'Japanese');assert.equal((await service.get('404')).status,'missing');const fresh=new Translations(root,path.join(root,'state'),translate);await fresh.get('1');assert.equal(calls,2);rows[0].text+=' Y también sobre la educación.';await writeFile(file,JSON.stringify(rows));await fresh.get('1');assert.ok(calls>2);}finally{await rm(root,{recursive:true,force:true});}
});
