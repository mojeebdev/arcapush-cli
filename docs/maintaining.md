# Maintaining Arcapush CLI

This guide is for repository contributors and release maintainers. For installation and everyday use, start with the [README](../README.md).

## Local development

```sh
npm ci
npm run typecheck
npm test
npm pack --dry-run
```

For onboarding changes, also run `python3 scripts/test-terminal.py` after building on Linux or macOS. This drives the executable through a real pseudo-terminal against a local mock API, checking type selection, saved drafts, review cancellation, narrow layouts and terminal cleanup. It also replays startup and resize output through xterm with ConPTY settings to catch duplicate screens and scrollback pollution. These checks run in CI and before publication. It does not publish a production listing.

Run `node dist/cli.js` to try the compiled interface, or `npm link` to make your local checkout available as `arcapush`. A linked checkout overrides the registry install until you replace it.

## Production API

The CLI talks only to the configured origin (default `https://arcapush.com`). It uses these endpoints:

| Endpoint | Used by | Auth |
| --- | --- | --- |
| `POST /api/v1/cli/auth/start` | `login` — creates a device code | none |
| `/cli/authorize` (browser) | You approve the device after web sign-in | web session |
| `POST /api/v1/cli/auth/token` | `login` — polls for approval | device code |
| `POST /api/v1/cli/auth/revoke` | `logout` | token |
| `GET /api/v1/cli/submissions` | `schema`, wizard, MCP schema tool | none |
| `POST /api/v1/cli/submissions` (`action: validate` / `submit`) | `submit`, MCP prepare/submit | token |
| `GET /api/v1/cli/submissions?contextId=` | MCP submission recovery | token |
| `POST /api/v1/cli/media` | local media uploads | token |
| `GET /api/v1/cli/listings/{type}/{id}` | `status`, `open`, MCP listing status | token |
| `PATCH /api/v1/cli/products/{id}` | `update` (products only) | token |

Error responses are JSON `{ error, code? }`. The CLI shows the server's message; only a response without one falls back to a generic message. Codes you may see: `token_invalid`, `scope_missing`, `declaration_required`, `account_paused`, `not_eligible`.

### Environment variables

| Name | Purpose |
| --- | --- |
| `ARCAPUSH_API_URL` | API origin (HTTPS; HTTP only for loopback). Default `https://arcapush.com`. |
| `ARCAPUSH_TOKEN` | Use this token instead of the saved one (for CI). Never commit it. |
| `ARCAPUSH_PROJECT_DIR` | Directory the MCP server may read local media from (same as `--project-dir`). |
| `NO_COLOR` | Disable colour output. |

## Staging and credentials

macOS/Linux:

```sh
export ARCAPUSH_API_URL=https://arcapush-staging.mojeebdev.workers.dev
arcapush login
```

PowerShell:

```powershell
$env:ARCAPUSH_API_URL = 'https://arcapush-staging.mojeebdev.workers.dev'
node .\dist\cli.js login
```

Ensure the staging server's site URL and authentication callback configuration point to staging. Set the same `ARCAPUSH_API_URL` in the MCP host's environment when testing staging.

Saved tokens are isolated by API origin. Legacy production tokens migrate on the next login. Explicit `ARCAPUSH_TOKEN` overrides local credentials for the configured origin; use a token minted for that origin. Tokens are stored under the OS config directory, with owner-only POSIX file permissions where supported. They are not encrypted in an OS keychain. HTTP is permitted only for loopback development origins. Requests have a timeout and refuse redirects.

## Stable release process

The owner has authorized stable publication. Plain `X.Y.Z` releases publish directly to npm `latest`, with provenance, and create a stable GitHub release marked Latest. `next` is not used by this workflow.

1. Complete relevant tests and review the change. Real browser login, upload and submission checks are separate from automated mock tests; record what was actually checked.
2. Choose an unused patch/minor/major version. Published npm contents, including the README, cannot be replaced at the same version.
3. Run `npm version X.Y.Z --no-git-tag-version`, set the same `CLI_VERSION` in `src/lib.ts`, update the agent guide and pinned examples, and add this version to `CHANGELOG.md`.
4. Run `npm run typecheck`, `npm test`, and `npm pack --dry-run`. Install the resulting tarball into an isolated prefix and check its executable before release.
5. Push the approved version change to `main`. Changes to `package.json` on `main` trigger the Publish workflow. Matching `vX.Y.Z` tags and manual runs on `main` remain supported.
6. The preflight checks version alignment, the release source, changelog and npm package immutability. API reachability is informational, not a claim that authenticated flows were tested.
7. CI publishes once through npm Trusted Publishing. An identical existing package is skipped; different bytes at the same version fail. It verifies the exact version is available under `latest` before creating or updating the GitHub release.
8. Confirm `npm view @blindspotlab/arcapush dist-tags --json`, the GitHub Latest release, and a clean `npm install -g @blindspotlab/arcapush@latest` match. Then update the website's `CLI_PACKAGE_VERSION` and release documentation.

Do not publish the same version locally and through CI. Do not reuse an old tag for changed package contents.

For an identical already-published version whose npm tag needs repair, an authorized npm maintainer can run `npm dist-tag add @blindspotlab/arcapush@X.Y.Z latest`, then rerun CI. CI fails rather than silently presenting the wrong npm version as a stable GitHub release.

The website uses independent versioning. Keep production credentials and authentication in their existing secure stores. Never commit token values.
