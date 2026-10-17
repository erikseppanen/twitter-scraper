import { readFile, mkdir, stat, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
// The words a tweet's meaning is computed from. Links are left out: the model reads
// a t.co address as words, and link-only tweets would match everything.
export function contentOf(tweet) {
  return [tweet.text, tweet.article?.title, tweet.article?.previewText,
    tweet.quote?.text, tweet.quote?.article?.title, tweet.quote?.article?.previewText].filter(Boolean).join('\n')
    .replace(/https?:\/\/\S+/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
export function chunks(text) {
  const words = text.trim().split(/\s+/);
  const result = [];
  for (let i = 0; i < words.length; i += 140) result.push(words.slice(i, i + 180).join(' '));
  return result;
}
export const cosine = (a, b) => a.reduce((sum, value, i) => sum + value * (b[i] || 0), 0);
export const MIN_SCORE = 0.3, SPREAD = 0.15;
const hash = text => createHash('sha256').update(text).digest('hex');
function normalize(v) { const n = Math.hypot(...v) || 1; return v.map(x => x / n); }

export class KnowledgeIndex {
  constructor(root, stateDir, embed) {
    Object.assign(this, { root, stateDir, embed });
    this.rows = []; this.vectors = []; this.signature = null; this.job = null;
    this.status = { state: 'idle', indexed: 0, total: 0, message: 'Preparing semantic search…' };
  }
  async embedding(text) {
    if (this.embed) return this.embed(text);
    if (!this.extractor) {
      this.extractor = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir = path.join(this.stateDir, 'models');
        return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
      })().catch(error => { this.extractor = null; throw error; });
    }
    const extract = await this.extractor;
    const parts = chunks(text);
    const values = [];
    for (const part of parts) values.push((await extract(part, { pooling: 'mean', normalize: true })).tolist()[0]);
    return normalize(values[0].map((_, i) => values.reduce((sum, v) => sum + v[i], 0) / values.length));
  }
  refresh() {
    if (this.job) return this.job;
    this.job = this.build().catch(error => {
      this.status = { ...this.status, state: 'error', message: 'Semantic indexing failed. It will retry automatically.', error: error.message };
    }).finally(() => { this.job = null; });
    return this.job;
  }
  async build() {
    const file = path.join(this.root, 'archive/tweets.json');
    let info;
    try { info = await stat(file); } catch (e) { if (e.code !== 'ENOENT') throw e; this.status.message = 'Import some tweets to begin.'; return; }
    const signature = `${info.mtimeMs}:${info.size}`;
    if (signature === this.signature) return;
    const tweets = JSON.parse(await readFile(file, 'utf8')).filter(t => /^\d+$/.test(String(t.tweetId)) && contentOf(t).trim());
    this.status = { state: 'indexing', indexed: 0, total: tweets.length, message: 'Building the local semantic index…' };
    const cacheFile = path.join(this.stateDir, 'knowledge.json');
    let cache = {};
    try { cache = JSON.parse(await readFile(cacheFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    const old = new Map(cache.model === MODEL && cache.version === 1 ? cache.rows?.map(r => [r.id, r]) : []);
    const rows = [], vectors = [], cachedRows = [];
    for (const tweet of tweets) {
      const text = contentOf(tweet), digest = hash(text), previous = old.get(String(tweet.tweetId));
      const vector = previous?.hash === digest ? previous.vector : await this.embedding(text);
      rows.push({ tweetId: String(tweet.tweetId) }); vectors.push(vector);
      cachedRows.push({ id: String(tweet.tweetId), hash: digest, vector });
      this.status.indexed = rows.length;
    }
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await writeFile(cacheFile + '.tmp', JSON.stringify({ version: 1, model: MODEL, rows: cachedRows }), { mode: 0o600 });
    await rename(cacheFile + '.tmp', cacheFile);
    this.rows = rows; this.vectors = vectors; this.signature = signature;
    this.status = { state: 'ready', indexed: rows.length, total: rows.length, message: 'Semantic index ready.' };
  }
  summary() {
    return { ...this.status, available: this.rows.length };
  }
  rank(vector, { exclude, limit = 30 } = {}) {
    return this.rows.map((row, i) => ({ tweetId: row.tweetId, score: cosine(vector, this.vectors[i]) }))
      .filter(r => r.tweetId !== exclude)
      .sort((a, b) => b.score - a.score).slice(0, limit);
  }
  // Likes about the same thing as the query. How high scores run depends on the query,
  // so keep matches above a floor and close to the best one.
  async search(query) {
    if (!query.trim()) return [];
    const ranked = this.rank(await this.embedding(query), { limit: 50 });
    const cutoff = Math.max(MIN_SCORE, (ranked[0]?.score ?? 0) - SPREAD);
    return ranked.filter(r => r.score >= cutoff);
  }
  // The likes closest in meaning to one tweet.
  related(id) {
    const index = this.rows.findIndex(row => row.tweetId === id);
    if (index < 0) return null;
    return this.rank(this.vectors[index], { exclude: id, limit: 12 }).filter(r => r.score > 0.15);
  }
}
