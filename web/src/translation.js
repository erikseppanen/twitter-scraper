// One request per text, shared by every place the tweet appears. The server translates
// ahead of time, so most answers are immediate; transient failures retry with backoff.
const cache = new Map();
const DELAYS = [2000, 5000, 15000];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(id, quoted) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch('/api/translation?' + new URLSearchParams({ id, quote: quoted ? '1' : '0' }));
      if (response.ok) return await response.json();
      if (response.status < 500) throw Object.assign(Error('Translation unavailable.'), { final: true });
      if (attempt >= DELAYS.length) throw Error('Translation unavailable.');
    } catch (error) {
      if (error.final || attempt >= DELAYS.length) throw error;
    }
    await wait(DELAYS[attempt]);
  }
}

export function translation(id, quoted = false) {
  const key = id + (quoted ? ':quote' : '');
  if (!cache.has(key)) {
    const job = request(id, quoted);
    // Forget failures so Retry asks again.
    job.catch(() => cache.delete(key));
    cache.set(key, job);
  }
  return cache.get(key);
}
