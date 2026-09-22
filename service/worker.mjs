import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

export async function atomicJSON(file, value) {
  await writeFile(file + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(file + '.tmp', file);
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const capture = data => { tail = (tail + data).slice(-8000); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const timer = setTimeout(() => child.kill('SIGTERM'), 45 * 60 * 1000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(tail) : reject(new Error(tail || `Process exited ${code}`)); });
  });
}
export function selectNew(ids, known) {
  return [...new Set(ids)].filter(id => /^\d+$/.test(id) && !known.has(id));
}
export class Worker {
  constructor(root, stateDir, save, state) {
    Object.assign(this, { root, stateDir, save, state });
    this.busy = false; this.login = null;
  }
  async browser(headless) {
    const profile = path.join(this.stateDir, 'browser');
    await mkdir(profile, { recursive: true, mode: 0o700 });
    const portFile = path.join(profile, 'DevToolsActivePort');
    await rm(portFile, { force: true });
    const child = await this.launchChrome([
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
      ...(headless ? ['--headless=new'] : []), 'about:blank',
    ]);
    let connection;
    try {
      for (let attempt = 0; attempt < 80; attempt++) {
        const port = (await readFile(portFile, 'utf8').catch(() => '')).split('\n')[0];
        if (/^\d+$/.test(port)) {
          connection = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
          const context = connection.contexts()[0];
          context.close = async () => {
            if (child.exitCode !== null) { await connection.close().catch(() => {}); return; }
            let timer;
            const exited = new Promise((resolve, reject) => {
              timer = setTimeout(() => reject(new Error('The scraper browser did not close.')), 20000);
              child.once('exit', () => { clearTimeout(timer); resolve(); });
            });
            // CDP Browser.close performs a normal shutdown even for headless Chrome.
            try {
              const session = await connection.newBrowserCDPSession();
              await session.send('Browser.close').catch(() => {});
              await exited;
            } finally { clearTimeout(timer); await connection.close().catch(() => {}); }
          };
          return context;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error('The scraper browser did not become ready.');
    } catch (error) {
      if (connection) await connection.close().catch(() => {});
      await this.closeLogin(child).catch(() => {});
      throw error;
    }
  }
  async launchLogin(url = 'https://x.com/login') {
    return this.launchChrome([url]);
  }
  async launchChrome(extraArgs) {
    // LaunchServices provides the same macOS keychain access as opening Chrome normally.
    const child = spawn('/usr/bin/open', ['-W', '-n', '-a', 'Google Chrome', '--args',
      `--user-data-dir=${path.join(this.stateDir, 'browser')}`,
      '--no-first-run', '--no-default-browser-check', ...extraArgs,
    ], { stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve); child.once('error', reject);
    });
    const profileArg = `--user-data-dir=${path.join(this.stateDir, 'browser')}`;
    for (let attempt = 0; attempt < 40; attempt++) {
      const processes = await run('/usr/bin/pgrep', ['-lf', '^/Applications/Google Chrome[.]app/Contents/MacOS/Google Chrome --user-data-dir=']).catch(() => '');
      const line = processes.split('\n').find(line => line.includes(profileArg + ' '));
      if (line) { child.chromePid = Number(line.trim().split(/\s+/)[0]); return child; }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('The dedicated Chrome window did not start.');
  }
  async connect() {
    if (this.busy) throw new Error('An update or sign-in is already running.');
    this.busy = true;
    this.state.paused = true;
    this.state.loginPending = true;
    this.state.error = null;
    this.state.message = 'Sign into X in the dedicated Chrome window on the Mini, then choose Finish sign-in. Automatic checks are paused.';
    try {
      await this.save();
      // Normal Chrome launch: no Playwright connection or remote debugging during login.
      const child = await this.launchLogin();
      this.login = child;
      child.once('exit', () => {
        if (this.login === child) { this.login = null; this.busy = false; }
      });
    } catch (error) {
      this.login = null; this.busy = false; throw error;
    }
  }
  async closeLogin(child) {
    if (child.exitCode !== null) return;
    // Ask this exact Chrome application process to quit normally, so it flushes cookies.
    // SIGTERM can exit Chrome before its pending cookie writes reach disk.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Quit the dedicated Chrome instance, then choose Finish sign-in again.')), 20000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      run('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
        `ObjC.import("AppKit"); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.chromePid || child.pid}).terminate;`,
      ]).catch(error => { clearTimeout(timer); reject(error); });
    });
  }
  async finish() {
    if (this.login) await this.closeLogin(this.login);
    this.login = null; this.busy = false;
    // A successful check resumes scheduling. Failures leave the login pause in place.
    return this.update();
  }
  async update() {
    if (this.busy) throw new Error('An update or sign-in is already running.');
    this.busy = true;
    this.state.running = true; this.state.lastAttempt = new Date().toISOString();
    this.state.message = 'Checking your Likes page…'; await this.save();
    let context;
    try {
      context = await this.browser(true);
      const page = context.pages()[0] || await context.newPage();
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
      const profile = page.locator('a[data-testid="AppTabBar_Profile_Link"]');
      try { await profile.waitFor({ timeout: 30000 }); }
      catch { throw new Error('Reconnect X: sign-in is required, or X is not loading.'); }
      const href = await profile.getAttribute('href');
      if (!/^\/[A-Za-z0-9_]+$/.test(href || '')) throw new Error('Could not identify your X profile.');
      await page.goto(`https://x.com${href}/likes`, { waitUntil: 'domcontentloaded' });
      await page.locator('article[data-testid="tweet"]').first().waitFor({ timeout: 30000 });
      let archived = [];
      try { archived = JSON.parse(await readFile(path.join(this.root, 'archive/tweets.json'), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const known = new Set(archived.map(t => String(t.tweetId)));
      const collected = new Set(); let idle = 0; let reachedBaseline = false; let knownStreak = 0;
      // Require a previously recorded like-order baseline; tweet IDs are not like timestamps.
      for (let round = 0; round < 200; round++) {
        const ids = await page.locator('article[data-testid="tweet"]').evaluateAll(articles => articles.map(a => {
          const timestamp = a.querySelector('time');
          return timestamp?.closest('a')?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
        }).filter(Boolean));
        const before = collected.size;
        for (const id of ids) {
          if (id === this.state.baseline) { reachedBaseline = true; break; }
          if (!collected.has(id)) {
            knownStreak = known.has(id) ? knownStreak + 1 : 0;
            collected.add(id);
          }
          // On the first run, establish overlap with the imported archive.
          if (!this.state.baseline && knownStreak >= 20) { reachedBaseline = true; break; }
        }
        if (reachedBaseline) break;
        idle = collected.size === before ? idle + 1 : 0;
        if (idle >= 5) break;
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await page.waitForTimeout(1600);
      }
      await context.close(); context = null;
      const ids = selectNew([...collected], known);
      const complete = reachedBaseline || (!this.state.baseline && idle >= 5);
      if (ids.length) {
        this.state.message = `Importing ${ids.length} new likes…`; await this.save();
        const input = path.join(this.stateDir, 'pending.txt');
        await writeFile(input, ids.join('\n'), { mode: 0o600 });
        // APFS copy-on-write clone isolates updates without duplicating old media blocks.
        const archive = path.join(this.root, 'archive');
        const staging = path.join(this.root, 'archive-staging');
        await rm(staging, { recursive: true, force: true });
        await run('/bin/cp', ['-cR', archive, staging]);
        await run(process.env.CLOJURE || '/opt/homebrew/bin/clojure', ['-M', '-m', 'twitter-scraper.core', '--import', input, '--output', staging], { cwd: this.root });
        const output = JSON.parse(await readFile(path.join(staging, 'tweets.json'), 'utf8'));
        const valid = new Set(output.filter(t => t.text || t.user?.screenName).map(t => String(t.tweetId)));
        if (ids.some(id => !valid.has(id))) throw new Error('Some tweets could not be fetched. Archive preserved; retry will try them again.');
        await rm(archive + '-previous', { recursive: true, force: true });
        await rename(archive, archive + '-previous');
        try { await rename(staging, archive); } catch (e) { await rename(archive + '-previous', archive); throw e; }
      }
      if (!complete) throw new Error('Could not reach the previous cutoff or verify the end of Likes. Imported this batch but preserved the cutoff; retry is needed.');
      if (collected.size) this.state.baseline = [...collected][0];
      this.state.paused = false; this.state.loginPending = false;
      this.state.lastSuccess = new Date().toISOString();
      this.state.message = `Up to date. Imported ${ids.length} new likes.`;
      this.state.error = null;
    } catch (error) {
      this.state.error = error.message; this.state.message = error.message;
    } finally {
      if (context) await context.close().catch(() => {});
      this.busy = false; this.state.running = false;
      this.state.nextRun = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      await this.save();
    }
  }
}
