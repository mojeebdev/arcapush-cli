import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.version !== '0.2.0') throw new Error('The release/0.2.0 trigger is only for package 0.2.0.');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${pkg.version}`) throw new Error('Tag and package version differ.');
if (process.env.GITHUB_REF_TYPE !== 'tag' && !['main', 'release/0.2.0'].includes(process.env.GITHUB_REF_NAME)) throw new Error('Release must use main, release/0.2.0, or a matching version tag.');
// The first 0.2.0 release stays on next until an operator completes live staging checks.
const channel = 'next';
let apiReady = false;
try {
  const response = await fetch('https://arcapush.com/api/v1/cli/submissions', { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (response.ok) {
    const schema = await response.json();
    if (schema.contractVersion === 1 && schema.media?.sourceTypes?.includes('UPLOAD')) apiReady = true;
  }
} catch { /* Keep the working stable package while the API is unavailable. */ }
const metadata = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`, { signal: AbortSignal.timeout(10000) });
let exists = false;
if (metadata.status === 200) {
  const published = await metadata.json();
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }));
  if (published.dist?.shasum !== packed.shasum) throw new Error('This version already exists with different package contents. Bump the version instead of overwriting it.');
  exists = true;
} else if (metadata.status !== 404) throw new Error(`Cannot verify npm version availability: HTTP ${metadata.status}`);
appendFileSync(process.env.GITHUB_OUTPUT, `channel=${channel}\nexists=${exists}\nversion=${pkg.version}\n`);
console.log(`Release ${pkg.version}; npm channel ${channel}; production contract ready: ${apiReady}; already published: ${exists}`);
