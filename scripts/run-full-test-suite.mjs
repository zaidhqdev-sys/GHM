import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { files } = JSON.parse(readFileSync(path.join(root, 'config/full-test-suite.json'), 'utf8'));
const batchSize = 32;
for (let offset = 0; offset < files.length; offset += batchSize) {
  const batch = files.slice(offset, offset + batchSize);
  process.stdout.write('\\nRunning compiled test batch ' + (Math.floor(offset / batchSize) + 1) + '/' + Math.ceil(files.length / batchSize) + ' (' + batch.length + ' files)\\n');
  const result = spawnSync(process.execPath, ['--require', './scripts/test-env.cjs', '--test', ...batch], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
