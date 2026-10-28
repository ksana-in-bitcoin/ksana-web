// Exercise core/signet/Dockerfile's js-build inputs without Docker, Rust, a node or a wallet: a temporary copy of this
// page with, of the core submodule, only core/sdk/ts (as core/signet/sources.sh gives the image) is installed and built.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(path.join(root, 'core/sdk/ts/package.json'))) {
  throw new Error('core/sdk/ts is missing: run git submodule update --init');
}
const context = mkdtempSync(path.join(tmpdir(), 'ksana-js-build-'));
const npm = process.env.npm_execpath;
const run = (directory, args) => execFileSync(npm ? process.execPath : 'npm', npm ? [npm, ...args] : args, {
  cwd: path.join(context, directory), stdio: 'inherit',
});
const skipped = ['node_modules', 'dist', 'dist-artifact', 'artifact', 'test-results', '.git'];
const copy = (source, target) => cpSync(source, target, {
  recursive: true,
  filter: (entry) => !path.relative(source, entry).split(path.sep).some((part) => skipped.includes(part)),
});
try {
  for (const entry of readdirSync(root)) {
    if (entry !== 'core' && !skipped.includes(entry)) copy(path.join(root, entry), path.join(context, entry));
  }
  copy(path.join(root, 'core/sdk/ts'), path.join(context, 'core/sdk/ts'));
  run('core/sdk/ts', ['ci', '--no-audit', '--no-fund']);
  run('core/sdk/ts', ['run', 'build']);
  run('.', ['ci', '--no-audit', '--no-fund']);
  run('.', ['run', 'build']);
  console.log('The page built with core/sdk/ts alone. No other part of the core submodule was available.');
} finally {
  rmSync(context, { recursive: true, force: true });
}
