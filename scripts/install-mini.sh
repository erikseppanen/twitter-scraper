#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
APP_ROOT="$PWD"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
: "${PUBLIC_ORIGIN:?Set PUBLIC_ORIGIN to the HTTPS Tailscale Serve address}"
if [[ "$PUBLIC_ORIGIN" != https://* ]]; then
  echo 'An HTTPS origin is required for installation.' >&2; exit 1
fi
clojure -P
clojure -M:test
npm ci --prefix service --ignore-scripts
npm test --prefix service
mkdir -p .service "$HOME/Library/LaunchAgents"
chmod 700 .service
export APP_ROOT PUBLIC_ORIGIN
/opt/homebrew/bin/python3 <<'PY'
import os, plistlib
root = os.environ['APP_ROOT']
plist = {
 'Label': 'local.twitter-archive',
 'ProgramArguments': ['/opt/homebrew/bin/node', root + '/service/server.mjs'],
 'WorkingDirectory': root,
 'EnvironmentVariables': {'PATH': os.environ['PATH'], 'JAVA_HOME': os.environ['JAVA_HOME'], 'PUBLIC_ORIGIN': os.environ['PUBLIC_ORIGIN']},
 'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30,
 'StandardOutPath': root + '/.service/service.log',
 'StandardErrorPath': root + '/.service/error.log',
}
p = os.path.expanduser('~/Library/LaunchAgents/local.twitter-archive.plist')
with open(p, 'wb') as f: plistlib.dump(plist, f)
os.chmod(p, 0o600)
PY
PLIST="$HOME/Library/LaunchAgents/local.twitter-archive.plist"
launchctl bootout "gui/$(id -u)/local.twitter-archive" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:4318/ >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:4318/ >/dev/null
/opt/homebrew/bin/python3 <<'PY'
import os, json, plistlib
root = os.environ['APP_ROOT']
with open(root + '/.service/access.json') as f: token = json.load(f)['token']
url = os.environ['PUBLIC_ORIGIN'].rstrip('/') + '/#' + token
with open(root + '/.service/private-link.txt', 'w') as f: f.write(url + '\n')
os.chmod(root + '/.service/private-link.txt', 0o600)
with open(os.path.expanduser('~/Desktop/Twitter Archive.webloc'), 'wb') as f: plistlib.dump({'URL': url}, f)
os.chmod(os.path.expanduser('~/Desktop/Twitter Archive.webloc'), 0o600)
print('Installed. Open Twitter Archive on the Mini desktop. Private link is in .service/private-link.txt.')
PY
