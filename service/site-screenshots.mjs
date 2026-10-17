import { chromium } from 'playwright';
import { mkdir, writeFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { KnowledgeIndex } from './knowledge.mjs';
import { Translations } from './translation.mjs';
import { createApp } from './server.mjs';

// Screenshots for the GitHub Pages site (docs/screenshots), taken from the real app
// running against a made-up archive. No real likes, authors or X content appear.
// Run with `npm --prefix service run screenshots` after `npm run build --prefix web`.
const repo = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(repo, 'docs/screenshots');
const root = await mkdtemp(path.join(os.tmpdir(), 'site-screenshots-'));
const stateDir = path.join(root, '.service');
await mkdir(path.join(root, 'archive/media'), { recursive: true });
await mkdir(path.join(root, 'archive/articles'), { recursive: true });
await mkdir(stateDir, { recursive: true });
// Reuse the model weights the knowledge test already downloaded.
await symlink(path.join(repo, '.service/knowledge-test/models'), path.join(stateDir, 'models')).catch(() => {});

const avatar = (initials, color) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${color}"/><text x="40" y="52" font-family="Helvetica,Arial,sans-serif" font-size="32" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`);
const people = {
  maya: { name: 'Maya Lindqvist', screenName: 'mayalooksup', profileImage: avatar('ML', '#5b4bdb') },
  theo: { name: 'Theo Okafor', screenName: 'theobakes', profileImage: avatar('TO', '#d9822b') },
  priya: { name: 'Priya Raman', screenName: 'priyacodes', profileImage: avatar('PR', '#0f9d77') },
  sam: { name: 'Sam Whitfield', screenName: 'satoshi_curious', profileImage: avatar('SW', '#e2a400') },
  lena: { name: 'Lena Brandt', screenName: 'lenarides', profileImage: avatar('LB', '#d6455d') },
  ines: { name: 'Inés Navarro', screenName: 'inesobserva', profileImage: avatar('IN', '#2a7fd4') },
  hugo: { name: 'Hugo Marsh', screenName: 'oldmapsdaily', profileImage: avatar('HM', '#6b7a3a') },
  june: { name: 'June Park', screenName: 'junewrites', profileImage: avatar('JP', '#8a4fbf') },
};

// Generated pictures, rendered by Chrome from SVG.
const pictures = {
  'sky.jpg': `<defs><radialGradient id="g" cx="70%" cy="30%" r="80%"><stop offset="0" stop-color="#4a3a8c"/><stop offset=".5" stop-color="#1a1f4d"/><stop offset="1" stop-color="#05060f"/></radialGradient></defs>
    <rect width="1200" height="675" fill="url(#g)"/>${Array.from({ length: 160 }, (_, i) => `<circle cx="${(i * 397) % 1200}" cy="${(i * 233) % 520}" r="${(i % 5) / 3 + 0.4}" fill="#fff" opacity="${0.4 + (i % 6) / 10}"/>`).join('')}
    <circle cx="880" cy="170" r="70" fill="#f4f1de"/><circle cx="905" cy="155" r="70" fill="#2a2766" opacity=".55"/>
    <path d="M0 560 L180 470 L320 540 L520 430 L700 530 L900 450 L1200 560 V675 H0 Z" fill="#0b0d1c"/>`,
  'loaf.jpg': `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e7cf"/><stop offset="1" stop-color="#e6cfa9"/></linearGradient><radialGradient id="c" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="#d79a52"/><stop offset=".7" stop-color="#a8622b"/><stop offset="1" stop-color="#6e3a17"/></radialGradient></defs>
    <rect width="1200" height="675" fill="url(#b)"/><ellipse cx="600" cy="560" rx="380" ry="40" fill="#c9ad85" opacity=".6"/>
    <ellipse cx="600" cy="420" rx="340" ry="170" fill="url(#c)"/>
    <path d="M420 360 Q600 300 780 360" stroke="#f3dfbf" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M450 420 Q600 370 750 420" stroke="#f3dfbf" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>`,
  'chart.jpg': `<rect width="1200" height="675" fill="#101418"/>
    ${[150, 270, 390, 510].map(y => `<line x1="80" x2="1140" y1="${y}" y2="${y}" stroke="#263038"/>`).join('')}
    <path d="M80 520 L180 500 L260 512 L340 460 L420 470 L500 410 L560 430 L640 340 L720 360 L800 280 L860 300 L940 210 L1020 240 L1140 150 V600 H80 Z" fill="#f7931a" opacity=".15"/>
    <path d="M80 520 L180 500 L260 512 L340 460 L420 470 L500 410 L560 430 L640 340 L720 360 L800 280 L860 300 L940 210 L1020 240 L1140 150" stroke="#f7931a" stroke-width="6" fill="none" stroke-linejoin="round"/>
    <text x="80" y="90" font-family="Helvetica,Arial" font-size="40" font-weight="700" fill="#e7e9ea">Hash rate, last 12 months</text>`,
  'code.jpg': `<rect width="1200" height="675" fill="#1e1e2e"/><rect width="1200" height="48" fill="#181825"/>
    ${['#f38ba8', '#f9e2af', '#a6e3a1'].map((c, i) => `<circle cx="${30 + i * 26}" cy="24" r="8" fill="${c}"/>`).join('')}
    ${[['def ', '#cba6f7', 'tokenize', '#89b4fa', '(text):', '#cdd6f4'], ['    words ', '#cdd6f4', '= ', '#89dceb', 'text.split()', '#a6e3a1'], ['    return ', '#cba6f7', '[w.lower() ', '#cdd6f4', 'for w in words]', '#fab387'], ['', '#cdd6f4', '', '#cdd6f4', '', '#cdd6f4'], ['# tests pass on the first try. suspicious.', '#6c7086', '', '#000', '', '#000']]
      .map((l, i) => `<text x="60" y="${120 + i * 56}" font-family="Menlo,monospace" font-size="34"><tspan fill="${l[1]}">${l[0]}</tspan><tspan fill="${l[3]}">${l[2]}</tspan><tspan fill="${l[5]}">${l[4]}</tspan></text>`).join('')}`,
  'cover.jpg': `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f9d77"/><stop offset="1" stop-color="#1d4e89"/></linearGradient></defs>
    <rect width="1200" height="675" fill="url(#a)"/>${Array.from({ length: 14 }, (_, i) => `<circle cx="${200 + (i % 7) * 130}" cy="${250 + Math.floor(i / 7) * 170}" r="18" fill="#fff" opacity=".85"/>`).join('')}
    ${Array.from({ length: 13 }, (_, i) => `<line x1="${200 + (i % 7) * 130}" y1="${250 + Math.floor(i / 7) * 170}" x2="${200 + ((i + 1) % 7) * 130}" y2="${420 - Math.floor(i / 7) * 170}" stroke="#fff" stroke-width="3" opacity=".35"/>`).join('')}`,
  'street.jpg': `<rect width="1200" height="675" fill="#bfe3f5"/><rect y="380" width="1200" height="295" fill="#5c6670"/>
    <polygon points="430,675 560,380 640,380 770,675" fill="#2fa36b"/><polygon points="590,675 596,380 604,380 610,675" fill="#fff" opacity=".9"/>
    ${[60, 220, 900, 1060].map((x, i) => `<rect x="${x}" y="${120 + (i % 2) * 60}" width="140" height="${260 - (i % 2) * 60}" fill="${['#e8b07a', '#d98b6a', '#c9a27e', '#e0c39a'][i]}"/>`).join('')}
    <circle cx="560" cy="560" r="34" fill="none" stroke="#111" stroke-width="7"/><circle cx="660" cy="560" r="34" fill="none" stroke="#111" stroke-width="7"/><path d="M560 560 L600 500 L660 560 M600 500 L630 500" stroke="#111" stroke-width="7" fill="none"/>`,
};

const t = (id, who, date, text, extra = {}) => ({ tweetId: id, text, createdAt: date, user: people[who], media: null, article: null, quote: null, ...extra });
const photo = name => [{ type: 'photo', url: 'https://example.invalid/' + name, localPath: name }];
const tweets = [
  t('1000000000000000021', 'maya', '2026-10-14T21:12:00Z', 'Clear skies tonight and the Moon is hanging right next to Jupiter. Go outside for five minutes, it\'s worth it.', { media: photo('sky.jpg') }),
  t('1000000000000000020', 'sam', '2026-10-13T15:40:00Z', 'Bitcoin\'s hash rate just set another record. Miners keep adding machines even after the halving cut their rewards in half.', { media: photo('chart.jpg') }),
  t('1000000000000000019', 'priya', '2026-10-12T18:05:00Z', 'Asked an AI model to refactor a 600-line function. It split it into six small ones, kept the tests green, and left better comments than I would have.', { media: photo('code.jpg') }),
  t('1000000000000000018', 'theo', '2026-10-11T08:30:00Z', 'Day 4 of the new sourdough starter: bubbly, smells like green apples, doubles in six hours. Bake day is Saturday.', { media: photo('loaf.jpg') }),
  t('1000000000000000017', 'lena', '2026-10-10T07:15:00Z', 'Our town finally finished the protected bike lane on Main Street. Ridership on that stretch tripled in the first month.', { media: photo('street.jpg') }),
  t('1000000000000000016', 'june', '2026-10-09T12:00:00Z', 'Long read on how small language models can run entirely on a laptop, and why that matters for privacy.', {
    article: { title: 'Small models, big privacy', previewText: 'You don\'t need a data center to search your own notes by meaning. A 20 MB embedding model and a few lines of code will do.', coverImage: 'https://example.invalid/cover.jpg' } }),
  t('1000000000000000015', 'ines', '2026-10-08T22:45:00Z', 'Esta noche se ve la Vía Láctea desde el desierto de Atacama. Nunca había visto tantas estrellas.'),
  t('1000000000000000014', 'hugo', '2026-10-07T10:20:00Z', 'A 1680 map of London drawn before the city had house numbers. Shops were found by their painted signs: the Golden Key, the Three Crowns.'),
  t('1000000000000000013', 'sam', '2026-10-06T16:10:00Z', 'Self-custody tip: write your Bitcoin seed phrase on steel, not paper, and keep two copies in different places.'),
  t('1000000000000000012', 'priya', '2026-10-05T09:00:00Z', 'Hot take: the best use of AI coding assistants isn\'t writing new code. It\'s reading old code you\'ve inherited and explaining what it does.', {
    quote: t('1000000000000000003', 'june', '2026-09-28T14:00:00Z', 'What\'s one thing AI tools changed about how you work?') }),
  t('1000000000000000011', 'theo', '2026-10-04T13:25:00Z', 'Pizza dough rule of thumb: 65% water, 2% salt, a pinch of yeast, and 48 hours in the fridge. Patience is the secret ingredient.'),
  t('1000000000000000010', 'maya', '2026-10-03T20:30:00Z', 'The space telescope found water vapor in the atmosphere of a planet 120 light years away. We live in the future.'),
  t('1000000000000000009', 'lena', '2026-10-02T17:50:00Z', 'Commuted 4,000 km by bike this year. Saved roughly a tank of gas a month and my knees feel 25 again.'),
  t('1000000000000000008', 'june', '2026-10-01T11:11:00Z', 'My cat has learned that the sound of the coffee grinder means I\'m awake and therefore available for breakfast duty.'),
  t('1000000000000000007', 'sam', '2026-09-30T19:00:00Z', 'Lightning payments for coffee now settle in under a second at our local café. Bitcoin as actual money, finally.'),
  t('1000000000000000006', 'hugo', '2026-09-29T08:45:00Z', 'Roman roads were built in layers: sand, crushed stone, gravel and paving. Some are still used by traffic 2,000 years later.'),
  t('1000000000000000005', 'priya', '2026-09-27T15:30:00Z', 'Machine learning tip: before tuning the model, look at 50 random examples of your training data. Half the bugs are in the labels.'),
  t('1000000000000000004', 'theo', '2026-09-26T10:00:00Z', 'Proof that bread is mostly time: same flour, same water, 12 hours vs 36 hours of cold fermentation. The long one wins every time.'),
  t('1000000000000000002', 'maya', '2026-09-25T21:00:00Z', 'Rocket launch from the coast tonight. The second stage glowed like a jellyfish across the whole sky.'),
  t('1000000000000000040', 'ines', '2026-09-23T23:30:00Z', 'Saturno con sus anillos a través de un telescopio pequeño. La primera vez siempre emociona.'),
  t('1000000000000000039', 'sam', '2026-09-22T12:00:00Z', 'Bitcoin mining difficulty adjusts every 2,016 blocks so a new block arrives about every ten minutes, no matter how many miners join.'),
  t('1000000000000000038', 'sam', '2026-09-21T09:30:00Z', 'Reminder: a Bitcoin hardware wallet keeps your private keys offline. Exchanges are for buying, not for storing your coins.'),
  t('1000000000000000037', 'maya', '2026-09-20T22:10:00Z', 'Saturn is at opposition this week, the best time all year to see its rings through a backyard telescope.'),
  t('1000000000000000036', 'maya', '2026-09-19T05:40:00Z', 'Woke up at 4am for the meteor shower and counted 38 shooting stars in an hour. The Perseids never disappoint.'),
  t('1000000000000000035', 'priya', '2026-09-18T14:20:00Z', 'Our team now has an AI model review every pull request before a human does. It catches the boring bugs so code review can focus on design.'),
  t('1000000000000000034', 'june', '2026-09-17T16:45:00Z', 'Large language models are surprisingly good at writing unit tests for legacy code, as long as you tell them what the code is supposed to do.'),
  t('1000000000000000033', 'theo', '2026-09-16T07:50:00Z', 'Sourdough tip: if your loaf comes out dense, your starter probably wasn\'t at its peak. Feed it, wait until it doubles, then mix the dough.'),
  t('1000000000000000032', 'theo', '2026-09-15T18:15:00Z', 'Homemade focaccia: a wet dough, lots of olive oil, dimple it with your fingers, flaky salt on top. The easiest bread you can bake.'),
  t('1000000000000000031', 'lena', '2026-09-14T08:05:00Z', 'Paris added hundreds of kilometers of bike lanes in five years, and now more trips in the city center are made by bike than by car.'),
  t('1000000000000000030', 'hugo', '2026-09-13T11:30:00Z', 'Medieval mapmakers put Jerusalem at the center of the world and drew sea monsters wherever they ran out of information.'),
  t('1000000000000000001', 'lena', '2026-09-24T07:00:00Z', 'Cities that build safe bike lanes see more cyclists, fewer crashes, and busier shops along the route. The data is remarkably consistent.'),
];
await writeFile(path.join(root, 'archive/tweets.json'), JSON.stringify(tweets));

let browser, server;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const painter = await browser.newPage({ viewport: { width: 1200, height: 675 } });
  for (const [name, svg] of Object.entries(pictures)) {
    await painter.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">${svg}</svg></body>`);
    await painter.screenshot({ path: path.join(root, name === 'cover.jpg' ? 'archive/articles/1000000000000000016-cover.jpg' : 'archive/media/' + name), type: 'jpeg', quality: 85 });
  }
  await painter.close();
  await writeFile(path.join(stateDir, 'status.json'), JSON.stringify({
    message: 'Up to date. 3 new likes saved.', lastSuccess: '2026-10-16T14:02:00Z', lastAttempt: '2026-10-16T14:02:00Z', nextRun: '2026-10-16T18:02:00Z', running: false }));

  const knowledge = new KnowledgeIndex(root, stateDir);
  await knowledge.refresh();
  if (knowledge.status.state !== 'ready') throw Error(knowledge.status.error || knowledge.status.message);
  const english = {
    'Esta noche se ve la Vía Láctea desde el desierto de Atacama.': 'Tonight you can see the Milky Way from the Atacama Desert.',
    'Nunca había visto tantas estrellas.': 'I had never seen so many stars.',
    'Saturno con sus anillos a través de un telescopio pequeño.': 'Saturn and its rings through a small telescope.',
    'La primera vez siempre emociona.': 'The first time is always thrilling.',
  };
  // The real translation model is large; these fixtures only need their own sentences.
  const translations = new Translations(root, stateDir, async text => english[text.trim()] || text);
  const port = 14331, origin = 'http://127.0.0.1:' + port;
  let config;
  ({ server, config } = await createApp({ root, stateDir, publicOrigin: origin, schedule: false, knowledgeIndex: knowledge, translations,
    workerFactory: () => ({ busy: false, update: async () => {}, connect: async () => {}, finish: async () => {} }) }));
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  await mkdir(out, { recursive: true });

  async function shoot(name, { width, height, scheme = 'light', url, ready, action }) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: scheme, timezoneId: 'America/New_York' });
    const page = await context.newPage();
    await page.goto(origin + '/#' + config.token);
    await page.waitForURL(u => new URL(u).pathname.startsWith('/app/'));
    await page.goto(origin + url);
    await page.locator(ready).first().waitFor({ timeout: 20000 });
    if (action) await action(page);
    await page.waitForLoadState('networkidle');
    // Lazy images below the fold never load, so only wait for the visible ones.
    await page.evaluate(() => Promise.all([...document.images].filter(img => img.getBoundingClientRect().top < innerHeight)
      .map(img => img.complete || new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 5000); }))));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log('Saved docs/screenshots/' + name + '.png');
    await context.close();
  }

  await shoot('likes-related', { width: 1440, height: 900, url: '/app/?related=1000000000000000021', ready: '.related .tweet' });
  await shoot('explore', { width: 1440, height: 900, url: '/app/explore/tweet/1000000000000000019', ready: '.timeline .tweet:not(.full)' });
  await shoot('updates', { width: 1280, height: 480, url: '/app/updates', ready: '.status-card .secondary' });
  await shoot('phone-likes-dark', { width: 390, height: 844, scheme: 'dark', url: '/app/', ready: '.timeline .tweet' });
  await shoot('phone-translated', { width: 390, height: 844, url: '/app/?author=inesobserva', ready: '.tweet',
    action: page => page.getByText('Milky Way').first().waitFor() });
  await shoot('phone-related', { width: 390, height: 844, url: '/app/?related=1000000000000000018', ready: '.related .tweet' });
  await shoot('phone-random', { width: 390, height: 844, scheme: 'dark', url: '/app/random', ready: '.tweet' });
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
