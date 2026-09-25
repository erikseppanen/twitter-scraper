import { readFile, mkdir, rename, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { francAll } from 'franc-min';
export const MODEL = 'Xenova/nllb-200-distilled-600M';
const languages = { spa:['spa_Latn','Spanish'],jpn:['jpn_Jpan','Japanese'],fra:['fra_Latn','French'],deu:['deu_Latn','German'],por:['por_Latn','Portuguese'],ita:['ita_Latn','Italian'],rus:['rus_Cyrl','Russian'],ukr:['ukr_Cyrl','Ukrainian'],cmn:['zho_Hans','Chinese'],kor:['kor_Hang','Korean'],arb:['arb_Arab','Arabic'],hin:['hin_Deva','Hindi'],nld:['nld_Latn','Dutch'],tur:['tur_Latn','Turkish'],pol:['pol_Latn','Polish'],swe:['swe_Latn','Swedish'],ind:['ind_Latn','Indonesian'],vie:['vie_Latn','Vietnamese'],tha:['tha_Thai','Thai'],heb:['heb_Hebr','Hebrew'],ces:['ces_Latn','Czech'],ron:['ron_Latn','Romanian'],fin:['fin_Latn','Finnish'],dan:['dan_Latn','Danish'],ell:['ell_Grek','Greek'] };
export function detect(text) {
  const clean = text.replace(/https?:\/\/\S+|[@#]\w+/g, '').trim();
  if (/[\u3040-\u30ff]/.test(clean)) return languages.jpn;
  if (/[\uac00-\ud7af]/.test(clean)) return languages.kor;
  // Long posts can flatten whole-document trigram scores. Use agreement
  // between confidently identified sentences before falling back to the whole.
  const votes = new Map();
  let total = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(clean)) {
    if (segment.trim().length < 25) continue;
    const ranks = francAll(segment, { minLength: 25 });
    const [code, value] = ranks[0];
    total++;
    if (code !== 'und' && (!ranks[1] || value - ranks[1][1] >= 0.08)) votes.set(code, (votes.get(code) || 0) + 1);
  }
  const winner = [...votes].sort((a,b) => b[1]-a[1])[0];
  if (winner && winner[1] >= 2 && winner[1] / total >= 0.6) return languages[winner[0]] || null;
  const ranked = francAll(clean, { minLength: 35 });
  const [best, score] = ranked[0];
  if (best === 'eng' || best === 'und') return null;
  // These are relative trigram scores, not probabilities. Prefer leaving the
  // original intact when English is plausible or the leading guesses are close.
  const english = ranked.find(([code]) => code === 'eng')?.[1];
  if (english !== undefined && score - english < 0.1) return null;
  if (ranked[1] && score - ranked[1][1] < 0.08) return null;
  return languages[best] || null;
}
export class Translations {
  constructor(root, stateDir, translate) { Object.assign(this,{root,stateDir,translate}); this.pending=new Map(); this.queue=Promise.resolve(); }
  async tweet(id, quoted=false) {
    const file=path.join(this.root,'archive/tweets.json'); const info=await stat(file);
    if (this.mtime!==info.mtimeMs) { this.tweets=new Map(JSON.parse(await readFile(file,'utf8')).map(t=>[t.tweetId,t])); this.mtime=info.mtimeMs; }
    const parent=this.tweets.get(id); return quoted ? parent?.quote : parent;
  }
  async get(id, quoted=false) {
    const tweet=await this.tweet(id,quoted); if (!tweet) return {status:'missing'};
    const text=tweet.text || '', lang=detect(text); if (!lang) return {status:'original'};
    const key=createHash('sha256').update(MODEL+'v2'+lang[0]+text).digest('hex');
    const dir=path.join(this.stateDir,'translations'),file=path.join(dir,key+'.json');
    try { return JSON.parse(await readFile(file,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; }
    if(this.pending.has(key)) return this.pending.get(key);
    const job=this.queue.catch(()=>{}).then(async()=>{
      if (!this.translate) {
        const {pipeline,env}=await import('@huggingface/transformers'); env.cacheDir=path.join(this.stateDir,'models');
        const model=await pipeline('translation',MODEL,{dtype:'q8'});
        this.translate=async(text,lang)=> (await model(text,{src_lang:lang,tgt_lang:'eng_Latn',max_new_tokens:512}))[0].translation_text;
      }
      // Keep links literal and translate bounded chunks, never silently truncate a long tweet.
      const parts=text.split(/(https?:\/\/\S+|\n+)/); const output=[];
      for (const part of parts) {
        if (!part.trim() || /^https?:\/\//.test(part)) {output.push(part);continue;}
        const chunks=[...new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(part)].flatMap(s=>s.segment.match(/.{1,350}(?:\s|$)|.{1,350}/gs)||[]);
        output.push((await chunks.reduce(async(prev,chunk)=>[...await prev,await this.translate(chunk,lang[0])],Promise.resolve([]))).join(' '));
      }
      const result={status:'translated',language:lang[1],text:output.join('')};
      await mkdir(dir,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(result));await rename(file+'.tmp',file);return result;
    });
    this.queue=job;this.pending.set(key,job);try{return await job;}finally{this.pending.delete(key);}
  }
}
