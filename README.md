# Arcapush CLI + MCP

Good products deserve to be discovered.

Submit products, AI agents and hackathon builds from a guided terminal flow or an MCP-compatible AI agent. Package: `@blindspotlab/arcapush`, executable: `arcapush`, Node.js **22+**.

## Release status

The production Arcapush API that CLI **0.2.x** needs is live at **https://arcapush.com** (Cloudflare Workers, deployed 2026-10-08). CLI **0.2.1** is checked against it.

| npm tag | Version | Notes |
| --- | --- | --- |
| `latest` | 0.1.2 | Product-only legacy CLI. |
| `next` | 0.2.0 | Superseded by 0.2.1. |
| — | **0.2.1** | Prepared, not yet published. Publishes to `next`, then is promoted to `latest` after a live sign-in and submission check. |

Until 0.2.1 is promoted, install it with an explicit version. The CLI version is independent of the web application's 0.4.0 version.

## Install and connect

Install this release:

```sh
npm install -g @blindspotlab/arcapush@0.2.1
arcapush --version
arcapush login
arcapush
```

Or run it without installing:

```sh
npx @blindspotlab/arcapush@0.2.1 login
npx @blindspotlab/arcapush@0.2.1 submit
```

Before publishing, from this repository:

```sh
npm ci
npm test
npm link
arcapush login
arcapush
```

`arcapush` shows the violet ARCAPUSH block wordmark and a numbered onboarding menu. Use `--ascii` for plain ASCII characters. Small terminals use a compact wordmark. `NO_COLOR=1`, redirected output and JSON mode do not emit color escapes. MCP never emits the banner.

Login opens your browser and displays a verification URL and code. Complete normal web sign-in, eligibility/onboarding, and device approval. `arcapush login --no-browser` displays the URL without opening a browser. A browser is required for authentication; agents do not log in on your behalf.

Existing CLI users must log in again to approve the new `submission:create` and `submission:read:own` scopes. Old tokens are not silently upgraded. Accounts restricted by the website remain restricted in the API. Arcapush accounts are 18+. Complete the declaration yourself in the browser; OAuth login does not establish adulthood.

A token that was revoked (from `/dashboard/cli` or `arcapush logout`) or has expired returns `token_invalid`; the CLI says so and asks you to run `arcapush login` again.

Eligibility errors keep their machine-readable code in JSON/MCP error details: `declaration_required` means open your configured Arcapush origin’s `/dashboard` in a browser; `account_paused` or `not_eligible` means use the support/review options there. Do not retry by changing credentials or asking an agent to declare your age. `scope_missing` requires signing in again to grant the new permissions. Public browsing and the public submission schema remain open. Token revocation remains available while paused.

## Guided submission

Run inside your project directory:

```sh
arcapush submit
arcapush submit --type agent
arcapush submit --type hackathon
```

The CLI gets fields, categories, media limits and step order from the server:

1. Basics: name, tagline, category.
2. Description: the problem solved or idea behind the build.
3. Links / Access: homepage, repository and optional supporting links.
4. Brand & media: logo, cover, screenshots and videos, by URL or local file.
5. Passport, for agents only: optional ERC-8004 identity and protocol endpoints.
6. Builder: the public attribution fields required by that listing type.
7. Review: validate and confirm the exact submission.

Products omit Passport, so they have six steps. Public contact/ownership identity comes from the signed-in account, not a submitted email or user ID.

Metadata suggestions come only from `package.json`, README, git origin and known logo paths. Source code and environment files are not uploaded. Review suggestions and remove confidential information before submitting. Detected media URLs are suggestions, not proof that the assets exist.

The wizard saves `.arcapush-submission.json` locally between steps. Resume it on your next run. Add that file to your project's `.gitignore` if the draft is private. The completed listing link is saved in `arcapush.json`, bound to the API origin.

Current website policy queues products for review and publishes agents and hackathon builds immediately. The server remains authoritative; the CLI displays its returned status.

### Media and URLs

Use a public HTTPS domain or subdomain homepage as the primary destination. Repository and other secondary URLs may contain paths. Agents need a live URL or repository. All URL checks run on the server too.

This release supports **public media links and local files**, including YouTube video links. Up to eight media items, one logo, one cover, six screenshots and two videos, subject to the combined eight-item limit. Local media files are supported alongside URLs. The server verifies that uploaded paths belong to the signed-in account and submission context.

## JSON and automation

Use `arcapush schema --json` for the current exact fields. Copy a file from `examples/`, replace the example values, then validate:

```sh
arcapush submit --input submission.json --dry-run --json
arcapush submit --input submission.json --yes --json
arcapush status --json
```

`--dry-run` validates ordinary fields on the server and inspects local file types, sizes and hashes without uploading, creating a listing or creating a server draft. Uploaded-object validation happens after transfer. It is not a reservation or a guarantee that duplicate checks will pass at submission time.

`--yes` is explicit permission to send the reviewed file. JSON mode does not infer a problem statement or silently submit detected metadata. Noninteractive commands never wait for prompts.

Before submission, the input file is updated with an API-bound `contextId`. Keep the same file and context ID when retrying after a timeout. The server returns the original result for a completed context. Changing the payload of that context is rejected. For a genuinely new submission, remove `contextId` from the new file. Do not retry a timed-out submission with a new context ID until its outcome is known.

## MCP: submit through an AI agent

This is a **local stdio MCP server** packaged with the CLI. It is not a public remote MCP URL. Install the CLI, run `arcapush login`, then add this entry to your MCP host's configuration:

```json
{
  "mcpServers": {
    "arcapush": {
      "command": "arcapush",
      "args": ["mcp"]
    }
  }
}
```

Without a global install, let the host run the pinned package through npx:

```json
{
  "mcpServers": {
    "arcapush": {
      "command": "npx",
      "args": ["-y", "@blindspotlab/arcapush@0.2.1", "mcp"]
    }
  }
}
```

`arcapush mcp-config` prints the global-install configuration. Host-specific settings filenames vary. Restart the host after configuration changes.

On Windows, if the host cannot resolve the npm command shim, use the installed script directly. Run `npm.cmd root -g`, append `@blindspotlab/arcapush/dist/cli.js`, then configure:

```json
{
  "mcpServers": {
    "arcapush": {
      "command": "node",
      "args": ["C:/YOUR/NPM/ROOT/@blindspotlab/arcapush/dist/cli.js", "mcp"]
    }
  }
}
```

Replace the example path with your actual global npm root. For local development, use an absolute path to this repository's `dist/cli.js` instead.

Tools:

| Tool | Purpose |
| --- | --- |
| `arcapush_submission_schema` | Read current requirements and categories. |
| `arcapush_prepare_submission` | Validate exact fields and return a review, context ID and confirmation ID. No server draft/listing is created. |
| `arcapush_submit` | Submit that prepared review after user approval. |
| `arcapush_submission_status` | Recover the saved draft or receipt after interruption. |
| `arcapush_listing_status` | Read an owned listing's status and permitted metrics. |

Example request to your agent:

> Prepare my product for Arcapush using the public information I provide. Ask me for missing facts. Show me the full submission and wait for my approval before submitting it.

Configure your host to **require approval for `arcapush_submit`**. The `confirmed: true` argument expresses approval but does not independently prove that a human approved; the host must enforce its approval policy. Preparation is limited to 20 pending reviews per process, and a review expires after 30 minutes. Changing credentials invalidates a prepared review. After a server restart, prepare the original payload again with its original `contextId` to recover safely.

The MCP server does not scan your working directory. Local media access requires an operator-configured project directory; the agent supplies explicit relative media paths for review. Never paste an Arcapush token into a chat or commit one in MCP configuration.

## Status, updates and logout

```sh
arcapush status
arcapush open
arcapush update --input update.json --yes --json
arcapush logout
```

Status works for all three listing types. Updates retain the existing **product-only** capability; edit agents and hackathon builds in the dashboard. A product update file contains only intended fields, for example:

```json
{ "tagline": "A clearer description of what this product does" }
```

Logout revokes the token and removes local credentials. If the network fails, revoke it at `/dashboard/cli`. If using an environment token, also unset `ARCAPUSH_TOKEN`.

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

## Maintainer: test, pack and release

Before promoting a release, complete a real `arcapush login` against production and one authorized submission (a product enters review, so it is the safest live check). Automated tests use a mock HTTP API and a real local MCP transport; they do not prove live database or OAuth configuration.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd pack --dry-run
```

The package's `prepack` hook builds `dist`. Published npm versions are immutable. For a new release, run `npm version X.Y.Z --no-git-tag-version` (updates `package.json` and the lockfile), set the same `CLI_VERSION` in `src/lib.ts`, and add a `## X.Y.Z` section to CHANGELOG.md.

The Publish workflow runs on a tag that names the exact version (`vX.Y.Z`) or a manual run on `main`. `scripts/release-preflight.mjs` checks the tag, the shown CLI version, the lockfile and the CHANGELOG section, and refuses to overwrite a published version (an identical re-run is skipped). It publishes with npm Trusted Publishing and provenance under the `next` tag, and creates a GitHub prerelease whose notes are that version's CHANGELOG section. Promote to `latest` separately, with a maintainer account, only after the production companion API is deployed and live sign-in, upload and submission checks pass:

```sh
npm dist-tag add @blindspotlab/arcapush@X.Y.Z latest
```

Do not publish the same version locally and through CI.

For PowerShell execution-policy errors, use `npm.cmd`/`npx.cmd` or `node dist/cli.js`; do not weaken your system execution policy.


## Local media

```json
{
  "media": [
    { "mediaType": "LOGO", "localPath": "public/logo.png", "altText": "Product logo" },
    { "mediaType": "SCREENSHOT", "sourceType": "EXTERNAL_URL", "url": "https://example.com/screen.png", "altText": "Main screen" }
  ]
}
```

Put this media array inside your submission `payload`. CLI paths are relative to the current working directory, or `--project-dir DIR`. MCP file access is off by default. Opt in explicitly:

```json
{
  "mcpServers": {
    "arcapush": {
      "command": "arcapush",
      "args": ["mcp", "--project-dir", "/absolute/path/to/project"]
    }
  }
}
```

Windows paths can use forward slashes, such as `C:/Users/you/project`. The agent cannot change the permitted root through a tool call. Files outside it, escaping symlinks, parent traversal, hidden files, SVG and non-media files are rejected. JPEG/PNG/WebP images have an 8 MiB limit; MP4/WebM videos have a 50 MiB limit. Content signatures are checked instead of trusting extensions.

Review includes file names, sizes and SHA-256 hashes. Files changed after approval must be reviewed again. Uploads start only after submission approval, go directly to signed private storage URLs without forwarding the account bearer token, and become public during finalization. The CLI saves upload receipts into the submission file for retries.

After a disrupted MCP session, call `arcapush_submission_status` with the original context ID to recover the saved payload or receipt before retrying. Do not create another context to recover a submission with an unknown outcome.

## Licence

Copyright 2026 **BlindspotLab Limited**. Apache License 2.0; see LICENSE and NOTICE. Earlier MIT permissions remain in LICENSE-MIT-LEGACY. Dependencies retain their own licences.

For AI tools and integrators, read [the agent guide](docs/agent-guide.md). For changes, read [the changelog](CHANGELOG.md).
