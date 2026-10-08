# Changelog

## 0.2.0 — 2026-10-08

Arcapush can now be submitted to from a guided terminal flow or a connected AI agent.

### Added

- Violet ARCAPUSH block wordmark, compact terminal fallback and plain ASCII mode.
- Website-aligned submission steps for products, AI agents and hackathon builds, including agent passport fields.
- Local stdio MCP server with schema, prepare, submit, listing-status and submission-recovery tools.
- Public URL and local-file media: PNG, JPEG, WebP, MP4 and WebM.
- Explicit project-directory access for MCP; local files are inspected before review and uploaded only after approval.
- JSON input, read-only dry runs, resumable drafts, stable submission context IDs and retry recovery.
- Example submission files and an agent guide.
- Automated CLI, MCP transport, media-boundary and backend contract checks.

### Changed

- Package version is 0.2.0, separate from the website's 0.4.0 release.
- Apache-2.0 licence and BlindspotLab Limited copyright; original MIT notice preserved for earlier code.
- CLI/MCP follows the shared 18+ account policy, with browser-only declarations and structured eligibility errors. Public schema access and token revocation remain available.
- New API scopes require signing in again. Existing tokens are not silently upgraded.
- Saved credentials and listing links are bound to the API origin.
- JSON mode requires explicit input and permission to submit. The old inferred `submit --json` behavior and duplicate-force option are removed.
- Product updates take an explicit JSON file. Agent and hackathon editing remains in the dashboard.

### Release requirements

Deploy the companion Arcapush API before using the new submission flow. It reuses existing submission drafts, media tables and Supabase buckets, so no new database migration is needed. Existing migrations and media-storage configuration must already be present.

The initial release workflow publishes with the `next` npm tag while live backend checks are pending; it preserves the working stable CLI until the backend is deployed. Install that release explicitly with `npm install -g @blindspotlab/arcapush@0.2.0`. Once the companion API is deployed and tested, promote the npm version to `latest`.

Automated tests do not replace a staging sign-in and real upload/submission check. AI recommendation or ranking gains are not guaranteed by adding MCP support.
