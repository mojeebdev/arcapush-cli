# Changelog

## 0.2.4 — 2026-10-08

### Fixed

- Remove the redundant stage-2 placeholder printed before the build-type selector on startup.
- Keep the live selector in the alternate terminal buffer so resizing and arrow-key navigation replace the current screen without adding interface copies to shell scrollback. Restore the original buffer and cursor on selection, cancellation and termination signals.
- Home the cursor before erasing the current screen, avoid full-screen ED 2 scrollback behavior, and skip resize events that do not change the frame.

### Verification

- Add a regression that fails on 0.2.3's duplicate startup output. Replay real pseudo-terminal bytes through xterm in normal and ConPTY modes to check one visible interface after startup, four width changes and navigation, plus preserved shell history on exit.
- Run terminal regressions in the Node 22/24 CI matrix and the publication workflow. The terminal emulator is a development-only dependency.

## 0.2.3 — 2026-10-08

### Fixed

- Bare `arcapush` now opens the approved four-stage onboarding: connect an account, choose a build type, add details and media, then review and submit.
- Replace the five-action opening menu with a Product / AI agent / Hackathon build selector supporting arrow keys, Tab, number shortcuts and Enter. Existing commands remain available through `arcapush --help`.
- Match the violet block-letter header, active-stage marker, radio choices, MCP hint and review reminder. Narrow terminals use smaller block letters and stacked choices; resize redraws the selector.
- Preserve readable ASCII/no-colour output and a numbered-input fallback for dumb terminals. Restore terminal input and cursor state on selection or cancellation.
- Keep server-driven fields, saved drafts, explicit submission approval, local-media upload safeguards and clean JSON/MCP output.

### Verification

- Add width and plain-output checks plus `python3 scripts/test-terminal.py`, a real-terminal smoke test using a local mock API. No production submission is needed for this test.

## 0.2.2 — 2026-10-08

Stable public release of the CLI and local MCP server.

### Changed

- Public README leads with installation, upgrading, the interactive menu, submissions and MCP setup. Contributor and release instructions live in docs/maintaining.md.
- Explain why a local npm install does not update the global `arcapush` command, with Windows/Git Bash troubleshooting and an explicit latest-version launch.
- Stable releases publish directly to npm `latest` and create or update a stable GitHub release marked Latest. Approved package-version changes on main trigger publication; version tags and manual runs remain supported.
- Check the npm latest tag before publishing GitHub release metadata so the two release channels cannot silently diverge.

### Interface and compatibility

Running `arcapush` opens the existing violet wordmark and menu for submitting a build, checking status, connecting an account, setting up an AI agent and opening the dashboard. This interface was already included in 0.2.0 and 0.2.1; an older global executable shows the legacy menu until upgraded. Commands, API contracts and MCP tools remain compatible with 0.2.1.


## 0.2.1 — 2026-10-08

Patch release. Published npm 0.2.0 cannot be changed, so the corrections ship here.

### Fixed

- LICENSE now opens with the project notice "Copyright 2026 BlindspotLab Limited", followed by the unchanged Apache License 2.0 text. NOTICE, LICENSE-MIT-LEGACY and third-party notices are unchanged.
- API errors keep the server's message. Every 404 on the submissions path was reported as "This server does not support CLI 0.2 submissions yet", including a missing draft returned by `arcapush_submission_status` ("Submission draft not found."). Only a response without a JSON error now falls back to a generic message.
- A revoked or expired token (`token_invalid`) now says the CLI session ended and to run `arcapush login`, instead of a bare "Unauthorized". The code stays in JSON/MCP error details.
- `declaration_required` adds the configured origin's dashboard URL to the server's instruction.

### Changed

- Release process is version-generic: releases come from a `vX.Y.Z` tag or a manual run on `main` (the `release/0.2.0` branch trigger is removed). The preflight checks the tag, the shown CLI version, the lockfile and the CHANGELOG section, keeps the existing-version checksum check, and GitHub release notes contain only this version's section.
- Every CI publish stays on the npm `next` tag. Promotion to `latest` is a separate maintainer step after the production companion API is deployed and live checks pass.

### Compatibility

No breaking changes. Commands, flags, JSON output shapes, MCP tool names and schemas are unchanged from 0.2.0. Checked against the production API at https://arcapush.com (submission contract v1).

### Release requirements

The production companion API is live. Publish to `next`, complete a real `arcapush login` and one authorized submission against production, then promote 0.2.1 to `latest`.

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
