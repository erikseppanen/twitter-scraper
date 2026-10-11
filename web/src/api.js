// A signed-out session sends the viewer to unlock with the private link, then back here.
export function signIn() {
  location.replace('/?next=' + encodeURIComponent(location.pathname + location.search));
}

export async function getJSON(url) {
  const response = await fetch(url);
  if (response.status === 401) { signIn(); throw Error('Sign-in required.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(body.error || 'Request failed.'), { status: response.status });
  return body;
}

export async function removeTweet(id) {
  const response = await fetch('/api/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  if (response.status === 401) { signIn(); throw Error('Sign-in required.'); }
  if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || 'Could not remove this tweet.');
}
