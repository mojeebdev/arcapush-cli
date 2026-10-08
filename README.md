# Arcapush CLI + MCP

**Good products deserve to be discovered.**

Get your product, AI agent or hackathon build onto [Arcapush](https://arcapush.com) from your terminal. Use the guided menu, submit a reviewed JSON file, or connect an MCP-compatible AI assistant.

[Website](https://arcapush.com) · [Documentation](https://arcapush.com/docs) · [Latest release](https://github.com/mojeebdev/arcapush-cli/releases/latest) · [npm](https://www.npmjs.com/package/@blindspotlab/arcapush)

## Install and open

Requires **Node.js 22 or newer**. Install or upgrade the global command:

```sh
npm install -g @blindspotlab/arcapush@latest
arcapush --version
arcapush
```

**Yes: typing `arcapush` opens the interactive CLI.** It shows the violet ARCAPUSH wordmark, your installed version, and this menu:

1. Submit a build
2. Check listing status
3. Connect your account
4. Set up your AI agent
5. Open dashboard

Use `arcapush --ascii` for an ASCII wordmark. Narrow terminals show a compact logo; `NO_COLOR=1` disables colour. The interactive menu needs a terminal; automation uses explicit commands or MCP.

To run the current stable version without a global install:

```sh
npx --yes @blindspotlab/arcapush@latest
```

This package release is **0.2.2**. The CLI and website have separate version numbers.

### Still seeing the old menu?

`npm install @blindspotlab/arcapush` installs into the current project's `node_modules`. It does **not** upgrade the global `arcapush` executable. Run the global install above, or use the explicit `npx` command.

In Windows PowerShell, use `npm.cmd` and `npx.cmd` if execution policy blocks the `.ps1` wrappers:

```powershell
npm.cmd install -g @blindspotlab/arcapush@latest
arcapush.cmd --version
arcapush.cmd
```

If the version is still old, locate competing installations with `where.exe arcapush` on Windows or `type -a arcapush` in Git Bash/macOS/Linux. In Git Bash, run `hash -r` after upgrading. A previous `npm link`, another Node installation or an older npm directory on PATH can select a different executable. `npx --yes @blindspotlab/arcapush@latest` explicitly selects the stable package.

## Connect your account

```sh
arcapush login
```

Your browser opens so you can sign in and approve this device. If it does not open, follow the URL and code printed in the terminal. Use `arcapush login --no-browser` to show the link without launching a browser.

Arcapush accounts are for people aged 18 or older. Complete any age declaration yourself in the browser. When upgrading from the legacy CLI, sign in again to approve the submission permissions. Manage or revoke connected devices in [Dashboard → CLI sessions](https://arcapush.com/dashboard/cli).

## Submit a build

Run inside your project directory:

```sh
arcapush submit
arcapush submit --type agent
arcapush submit --type hackathon
```

The wizard guides you through the name, description, category, links, media and builder details. AI agents can also include optional passport information. It suggests metadata from your local package, README and git remote; review and edit those suggestions before confirming.

- Submit products, AI agents and hackathon builds.
- Add media through public links or local files.
- Save and resume a local draft in `.arcapush-submission.json`.
- Review the full submission before sending it.
- Check the returned status and open your dashboard afterwards.

Source code and environment files are not uploaded. Submitted listing details and media are intended for public display. Product submissions enter review; agents and hackathon builds follow the website's current publishing policy. The server's returned status is authoritative.

### Media

Supported local files: PNG, JPEG and WebP images up to **8 MiB**, plus MP4 and WebM videos up to **50 MiB**. Public media URLs and YouTube links are also supported. The combined limit is eight media items, with at most one logo, one cover, six screenshots and two videos.

Use relative paths inside your project, such as `public/logo.png`. Local uploads begin only after approval. Use a public HTTPS domain or subdomain as a product's main website; supporting repository links may contain paths. Agents need a live URL or repository.

## Useful commands

| Command | What it does |
| --- | --- |
| `arcapush` | Open the guided menu |
| `arcapush login` | Connect your account |
| `arcapush submit` | Submit a product, agent or hackathon build |
| `arcapush status` | Check the listing linked to this directory |
| `arcapush open` | Open the linked listing, or your dashboard if none is linked |
| `arcapush update --input update.json --yes` | Apply reviewed changes to a linked product |
| `arcapush schema --json` | Read current submission fields and categories |
| `arcapush mcp-config` | Print an MCP configuration |
| `arcapush logout` | Revoke the session and remove local credentials |
| `arcapush --help` | Show commands and options |
| `arcapush --version` | Show the installed version |

The CLI saves a listing link in `arcapush.json`. Run status/update commands from that directory. CLI updates currently support products; edit agents and hackathon builds in the dashboard.

## Use with an AI assistant

Arcapush includes a **local stdio MCP server**. It lets a compatible assistant read submission requirements, prepare a listing for review, submit it after approval, and check its status.

Install the CLI and run `arcapush login` first. Add this to your MCP host's configuration:

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

Alternatively, use the pinned package without a global install:

```json
{
  "mcpServers": {
    "arcapush": {
      "command": "npx",
      "args": ["-y", "@blindspotlab/arcapush@0.2.2", "mcp"]
    }
  }
}
```

Host configuration locations vary. Restart your host after updating its configuration. On Windows, if the host cannot resolve npm command shims, run `npm.cmd root -g` and use `node` with the absolute path to `@blindspotlab/arcapush/dist/cli.js`, followed by `mcp`.

Ask your assistant:

> Prepare my product for Arcapush. Ask me for missing information, show me the complete listing and wait for my approval before submitting.

Configure the host to require approval for `arcapush_submit`. Local media access is off by default; opt in with `"args": ["mcp", "--project-dir", "/absolute/path/to/project"]`. The assistant cannot expand this allowed directory through a tool call. Never paste account tokens into chat.

See the [agent guide](docs/agent-guide.md) for tool names, approval rules, file limits and recovery after an interrupted submission.

## JSON submissions and automation

Start from a [product](examples/product.json), [agent](examples/agent.json) or [hackathon](examples/hackathon.json) example. Replace its sample fields and check the current schema:

```sh
arcapush schema --json
arcapush submit --input submission.json --dry-run --json
arcapush submit --input submission.json --yes --json
arcapush status --json
```

`--dry-run` validates fields and inspects local files without uploading or creating a listing. `--yes` authorizes sending the reviewed file. JSON mode never invents missing fields or waits for prompts.

Keep the same submission file and `contextId` when retrying a timeout so the server can recover the original result instead of creating a duplicate. Do not create a new context until the previous attempt's outcome is known.

## Troubleshooting

- **Expired/revoked session or missing permissions:** run `arcapush login` again.
- **Age declaration required:** open your [dashboard](https://arcapush.com/dashboard) and complete it yourself.
- **Account paused or ineligible:** use the dashboard's support/review options; changing credentials will not resolve eligibility.
- **Wrong environment:** `ARCAPUSH_API_URL` defaults to `https://arcapush.com`. Remove an old staging override in both the terminal and MCP host. Tokens are isolated by origin.
- **Logout could not reach the server:** revoke the session from the dashboard. Also unset `ARCAPUSH_TOKEN` if you supplied one through your environment.

Report reproducible problems in [GitHub Issues](https://github.com/mojeebdev/arcapush-cli/issues). Include the CLI version and error message, without tokens or personal data.

## Contributing and licence

For repository setup, API contracts, staging and publishing, read the [maintainer guide](docs/maintaining.md). See [CHANGELOG.md](CHANGELOG.md) for release history.

Copyright 2026 **BlindspotLab Limited**. Licensed under [Apache License 2.0](LICENSE); see [NOTICE](NOTICE). Earlier MIT permissions remain in [LICENSE-MIT-LEGACY](LICENSE-MIT-LEGACY). Dependencies retain their own licences.
