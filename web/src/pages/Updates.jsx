import { useEffect, useState } from 'react';
import { getJSON } from '../api.js';

const when = value => value ? new Date(value).toLocaleString() : 'Not yet';

async function post(action) {
  const response = await fetch('/api/' + action, { method: 'POST' });
  if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || 'The Mini could not start that.');
}

// The service dashboard: status of automatic updates and the X sign-in controls.
export default function Updates({ wide }) {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const poll = () => getJSON('/api/status').then(
      s => { if (!cancelled) { setStatus(s); setMessage(''); } },
      () => { if (!cancelled) setMessage('Could not reach the Mini.'); },
    );
    poll();
    const timer = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  async function run(action) {
    setMessage('Working…');
    try { await post(action); setTimeout(() => getJSON('/api/status').then(setStatus, () => {}), 500); }
    catch (e) { setMessage(e.message); }
  }

  const busy = !status || status.busy;
  return (
    <>
    <main className="timeline">
      <header className="page-header"><h1>Updates</h1></header>
      <section className="updates">
        <div className="status-card" role="status">
          <strong>{message || status?.message || 'Checking the Mini…'}</strong>
          {status && (
            <p className="secondary">
              Last success: {when(status.lastSuccess)} · Next check: {status.paused ? 'Paused for sign-in' : when(status.nextRun)}
              {status.removalPending && ' · Finishing removals'}
            </p>
          )}
        </div>
        <p>Your likes are checked automatically about every four hours.</p>
        <div className="update-actions">
          <button type="button" className="pill accent" disabled={busy || status?.loginPending} onClick={() => run('update')}>Update now</button>
          <button type="button" className="pill" disabled={busy} onClick={() => run('connect')}>Reconnect X</button>
          <button type="button" className="pill" onClick={() => run('finish')}>Finish sign-in</button>
        </div>
        <p className="secondary small">
          If X needs you to sign in again, choose Reconnect X. A dedicated Chrome window opens on the Mac Mini;
          sign in there, then choose Finish sign-in here. Automatic checks pause until sign-in succeeds.
        </p>
      </section>
    </main>
    {/* Keep the column positions the same as pages that have a sidebar. */}
    {wide && <div className="sidebar-spacer" aria-hidden="true" />}
    </>
  );
}
