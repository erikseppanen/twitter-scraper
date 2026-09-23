import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from './server.mjs';

// Preview a feature branch against an existing archive without running collection/imports.
const root = path.resolve(process.env.ARCHIVE_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 14330);
const origin = `http://127.0.0.1:${port}`;
const stateDir = path.join(root, '.service/knowledge-preview');
const readOnly = async () => { throw Error('This preview does not run scraping. Use the deployed dashboard.'); };
const { server, config } = await createApp({ root, stateDir, publicOrigin: origin, schedule: false, indexKnowledge: true,
  workerFactory: () => ({ busy: false, update: readOnly, connect: readOnly, finish: readOnly }) });
await writeFile(path.join(stateDir, 'private-link.txt'), `${origin}/?next=%2Fknowledge#${config.token}\n`, { mode: 0o600 });
server.listen(port, '127.0.0.1', () => console.log(`Knowledge preview listening on ${origin}. Private bookmark: .service/knowledge-preview/private-link.txt`));
