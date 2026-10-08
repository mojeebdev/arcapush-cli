// Release preflight for the Publish workflow. Version-generic: nothing here is
// tied to one release. It refuses anything that could publish the wrong bytes.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`package.json version "${version}" is not a plain x.y.z release.`);

// Where a release may come from: a tag that names exactly this version, or a
// manual run on main.
const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;
if (refType === 'tag') {
  if (refName !== `v${version}`) throw new Error(`Tag ${refName} does not match package version v${version}.`);
} else if (refName !== 'main') {
  throw new Error('Release from a matching version tag, or run the workflow manually on main.');
}

// The version users see must be the version being published.
const lib = readFileSync('src/lib.ts', 'utf8');
const shown = lib.match(/export const CLI_VERSION = "([^"]+)";/)?.[1];
if (shown !== version) throw new Error(`src/lib.ts CLI_VERSION (${shown}) differs from package.json (${version}).`);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
if (lock.version !== version || lock.packages?.['']?.version !== version) throw new Error('package-lock.json version differs; run npm install.');

// Release notes are this version's CHANGELOG section, not the whole file.
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')}(?![\\d.])`, 'm');
const start = changelog.search(heading);
if (start < 0) throw new Error(`CHANGELOG.md has no "## ${version}" section.`);
const section = changelog.slice(start);
const nextHeading = section.slice(1).search(/^## /m);
writeFileSync('release-notes.md', (nextHeading < 0 ? section : section.slice(0, nextHeading + 1)).trim() + '\n');

// Stable releases are explicitly authorized by the owner. Plain x.y.z versions
// publish to latest; a public schema check does not prove authenticated readiness.
const channel = 'latest';
let apiAdvertisesUploads = false;
try {
  const response = await fetch('https://arcapush.com/api/v1/cli/submissions', { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (response.ok) {
    const schema = await response.json();
    apiAdvertisesUploads = schema.contractVersion === 1 && Boolean(schema.media?.sourceTypes?.includes('UPLOAD'));
  }
} catch { /* Informational only. */ }

// A published version is immutable: re-running is a no-op when the bytes are
// identical, and an error when they are not.
const metadata = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${version}`, { signal: AbortSignal.timeout(10000) });
let exists = false;
if (metadata.status === 200) {
  const published = await metadata.json();
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }));
  if (published.dist?.shasum !== packed.shasum) throw new Error('This version already exists with different package contents. Bump the version instead of overwriting it.');
  exists = true;
} else if (metadata.status !== 404) throw new Error(`Cannot verify npm version availability: HTTP ${metadata.status}`);

appendFileSync(process.env.GITHUB_OUTPUT, `channel=${channel}\nexists=${exists}\nversion=${version}\n`);
console.log(`Release ${version}; npm channel ${channel}; production API advertises uploads: ${apiAdvertisesUploads}; already published: ${exists}`);
