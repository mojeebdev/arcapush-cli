# Remote MCP setup and migration

Target endpoint: `https://mcp.arcapush.com/mcp`. Transport: Streamable HTTP. Authentication: OAuth 2.1 with S256 PKCE. This is a deployment-gated implementation, not a claim of production availability.

The companion server lives in `mojeebdev/arcapush/workers/mcp`. Deploy and test it before releasing the CLI changes. Publish this CLI only after unauthenticated access returns 401 with discovery, browser consent works, and an authenticated SDK client can initialize, list tools, prepare and recover submissions. Test account revocation, refresh rotation, wrong-account access, scope restrictions and a consented staging submission. Never use a fabricated production listing to test writes.

## CLI behavior changes

- `arcapush mcp-config` returns `{ "mcpServers": { "arcapush": { "url": "https://mcp.arcapush.com/mcp" } } }`.
- `arcapush mcp-login` opens browser OAuth. The temporary callback listens only on `127.0.0.1:45731`, verifies state and uses PKCE. Close another login process if the port is occupied.
- `arcapush mcp` connects stdio to the remote URL. It does not use or transmit `ARCAPUSH_TOKEN`.
- `arcapush mcp-logout` revokes the remote grant and removes its credential file. If revocation fails, use Dashboard → CLI sessions; the command reports failure rather than claiming revocation succeeded.
- `arcapush mcp --local` preserves the original local server, using `arcapush login` credentials. Add `--project-dir DIR` only to this local mode.
- `arcapush mcp-config --local` prints a local configuration.

`ARCAPUSH_MCP_URL` must be an HTTPS URL ending exactly in `/mcp`, without a query, fragment or embedded credentials. Its OAuth tokens and client registration are stored separately for each exact endpoint. `ARCAPUSH_API_URL` continues to control ordinary terminal API commands. It does not redirect the remote MCP bridge.

The bridge forwards tool definitions and calls, including safety annotations. It does not mirror local files or upload source. Require host approval for `arcapush_submit`. Preparation returns the exact review and an opaque signed confirmation ID. Pass it unchanged. It expires after 30 minutes and is bound to that connection. Retry using the original contextId; the backend enforces idempotent outcomes.

## Official client references

- ChatGPT: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- Claude: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Cursor: https://cursor.com/docs/context/mcp
- Gemini CLI: https://geminicli.com/docs/tools/mcp-server/
- Gemini Enterprise: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server

Plan, workspace and administrator restrictions vary. Availability of MCP in Gemini CLI or Enterprise does not establish support in consumer Gemini web.
