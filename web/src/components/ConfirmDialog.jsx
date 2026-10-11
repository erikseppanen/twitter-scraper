import { useEffect, useRef } from 'react';

// Native modal dialog: focus is trapped, Escape cancels, and the page behind is inert.
export default function ConfirmDialog({ tweet, busy, onConfirm, onCancel }) {
  const ref = useRef(null);
  const cancel = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    // Start on Cancel so Enter never removes by accident.
    if (tweet && !dialog.open) { dialog.showModal(); cancel.current.focus(); }
    if (!tweet && dialog.open) dialog.close();
  }, [tweet]);
  const handle = tweet?.user?.screenName;
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="remove-title"
      onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}
      onClick={e => { if (e.target === ref.current && !busy) onCancel(); }}>
      <h2 id="remove-title">Remove from archive?</h2>
      <p>This deletes {handle ? `the tweet by @${handle}` : 'this tweet'} and its saved media from your archive. It won't be imported again, and this can't be undone.</p>
      <button type="button" className="button danger" disabled={busy} onClick={onConfirm}>{busy ? 'Removing…' : 'Remove'}</button>
      <button ref={cancel} type="button" className="button outline" disabled={busy} onClick={onCancel}>Cancel</button>
    </dialog>
  );
}
