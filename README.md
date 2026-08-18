# Arcapush CLI

Submit and manage your products on [Arcapush](https://arcapush.com) from the terminal. The CLI reads only the metadata needed to prepare a listing. It never uploads source code, `.env` files, or git credentials.

## Install

```bash
npm install -g @blindspotlab/arcapush
arcapush
```

Or without a global install:

```bash
npx @blindspotlab/arcapush
npx @blindspotlab/arcapush submit
```

## Commands

```bash
arcapush              # interactive menu
arcapush login
arcapush logout
arcapush submit
arcapush update
arcapush status
arcapush open
arcapush --help
arcapush --version
```

```bash
cd my-project
arcapush login
arcapush submit
arcapush status
arcapush update
arcapush logout
```

JSON mode for coding agents:

```bash
arcapush submit --json
arcapush status --json
```

## Login

`arcapush login` opens Arcapush in the browser. Confirm the device code. A scoped token is stored locally and can be revoked with `arcapush logout` or from the founder dashboard.

Override for automation:

```bash
export ARCAPUSH_TOKEN=apc_...
```

## What is read

- `package.json`
- `README.md` (title and first paragraph)
- `git remote` origin URL
- known public deploy config
- public logo candidates
- existing `arcapush.json`

## What is never uploaded

- source files
- `.env` / secrets
- `node_modules`
- git credentials
- home-directory files

After a successful submit, the CLI writes `arcapush.json` with the listing id and slug only. No tokens. Schema: https://arcapush.com/schema.json

## Requirements

Node.js 22 or later.

## Docs and support

- Website: https://arcapush.com
- Docs: https://arcapush.com/docs
- Support: hello@blindspotlab.xyz
- Issues: https://github.com/mojeebdev/arcapush-cli/issues

## API host

Defaults to `https://arcapush.com`. Override with `ARCAPUSH_API_URL` if you are pointing at another environment.
