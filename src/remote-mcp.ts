// Copyright 2026 BlindspotLab Limited
// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CLI_VERSION, configDir, openUrl } from './lib.js';

export const DEFAULT_MCP_URL = 'https://mcp.arcapush.com/mcp';
export function mcpUrl(): URL {
  const url = new URL(process.env.ARCAPUSH_MCP_URL || DEFAULT_MCP_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/mcp') throw new Error('ARCAPUSH_MCP_URL must be an HTTPS /mcp endpoint without credentials, query or fragment.');
  return url;
}
function credentialPath() { return join(configDir(), `mcp-${createHash('sha256').update(mcpUrl().href).digest('hex').slice(0, 16)}.json`); }
type Stored = { client?: OAuthClientInformationMixed; tokens?: OAuthTokens };
function read(): Stored { try { return JSON.parse(readFileSync(credentialPath(), 'utf8')); } catch { return {}; } }
function save(value: Stored) {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(credentialPath(), `${JSON.stringify(value)}\n`, { mode: 0o600 });
  try { chmodSync(credentialPath(), 0o600); } catch { /* Windows uses account ACLs. */ }
}
export async function remoteLogout(): Promise<void> {
  const stored = read();
  if (stored.tokens) {
    const metadata = await fetch(new URL('/.well-known/oauth-authorization-server', mcpUrl()), { redirect: 'error', signal: AbortSignal.timeout(15000) }).then(r => r.json()) as { revocation_endpoint?: string };
    if (!metadata.revocation_endpoint) throw new Error('Could not discover remote revocation. Revoke access in the Arcapush dashboard.');
    const revoke = new URL(metadata.revocation_endpoint);
    if (revoke.origin !== mcpUrl().origin) throw new Error('Unexpected revocation origin.');
    const body = new URLSearchParams({ token: stored.tokens.refresh_token ?? stored.tokens.access_token, ...(stored.client ? { client_id: stored.client.client_id } : {}) });
    const result = await fetch(revoke, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new Error('Remote revocation failed. Revoke access in the Arcapush dashboard, then retry.');
  }
  rmSync(credentialPath(), { force: true });
}
export async function connectRemote(interactive = false): Promise<Client> {
  const state = randomBytes(32).toString('hex');
  let verifier = '';
  let callback: ReturnType<typeof createServer> | undefined;
  let resolveCode: (code: string) => void = () => {};
  let rejectCode: (reason: Error) => void = () => {};
  const code = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // A rejection may precede the transport's UnauthorizedError handling.
  void code.catch(() => {});
  const redirectUrl = 'http://127.0.0.1:45731/callback';
  const provider: OAuthClientProvider = {
    redirectUrl,
    clientMetadata: { client_name: 'Arcapush CLI', redirect_uris: [redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'arcapush:read arcapush:submit' },
    state: () => state,
    clientInformation: () => read().client,
    saveClientInformation: client => save({ ...read(), client }),
    tokens: () => read().tokens,
    saveTokens: tokens => save({ ...read(), tokens }),
    saveCodeVerifier: value => { verifier = value; },
    codeVerifier: () => verifier,
    invalidateCredentials: scope => { const stored = read(); if (scope === 'all' || scope === 'client') delete stored.client; if (scope === 'all' || scope === 'tokens') delete stored.tokens; if (scope === 'all' || scope === 'verifier') verifier = ''; save(stored); },
    async redirectToAuthorization(url) {
      if (!interactive) throw new Error('Connect remote MCP first with arcapush mcp-login in a terminal.');
      // Discovery must never redirect our human sign-in to an unrelated origin.
      if (url.origin !== mcpUrl().origin) throw new Error('Unexpected authorization origin.');
      callback = createServer((request, response) => {
        const target = new URL(request.url || '/', redirectUrl);
        if (request.headers.host !== '127.0.0.1:45731' || target.pathname !== '/callback' || target.searchParams.get('state') !== state || (target.searchParams.has('iss') && target.searchParams.get('iss') !== mcpUrl().origin)) { response.writeHead(400).end('Invalid callback'); return; }
        if (target.searchParams.has('error')) { response.writeHead(400).end('Connection declined.'); rejectCode(new Error('Connection declined.')); return; }
        const value = target.searchParams.get('code');
        if (!value) { response.writeHead(400).end('Missing code'); return; }
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end('Authorization received. Return to your terminal.');
        resolveCode(value);
      });
      await new Promise<void>((resolve, reject) => { callback!.once('error', reject); callback!.listen(45731, '127.0.0.1', resolve); });
      process.stderr.write(`Complete Arcapush authorization in your browser:\n${url.href}\n`);
      openUrl(url.href);
    },
  };
  const client = new Client({ name: 'arcapush-cli', version: CLI_VERSION });
  let transport = new StreamableHTTPClientTransport(mcpUrl(), { authProvider: provider });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    try { await client.connect(transport); }
    catch (error) {
      if (!(error instanceof UnauthorizedError) || !interactive) throw error;
      timer = setTimeout(() => rejectCode(new Error('MCP login timed out. Run arcapush mcp-login again.')), 10 * 60 * 1000);
      await transport.finishAuth(await code);
      transport = new StreamableHTTPClientTransport(mcpUrl(), { authProvider: provider });
      await client.connect(transport);
    }
    return client;
  } catch (error) { await client.close().catch(() => {}); throw error; }
  finally { if (timer) clearTimeout(timer); callback?.close(); }
}
export async function startRemoteMcp(): Promise<void> {
  const remote = await connectRemote();
  const local = new Server({ name: 'arcapush', version: CLI_VERSION }, { capabilities: { tools: {} }, instructions: 'Remote Arcapush connection. Require user review and explicit host approval for arcapush_submit. Never request account tokens in chat.' });
  local.setRequestHandler(ListToolsRequestSchema, request => remote.listTools(request.params));
  local.setRequestHandler(CallToolRequestSchema, (request, extra) => remote.callTool(request.params, undefined, { signal: extra.signal }));
  const close = () => { void Promise.allSettled([local.close(), remote.close()]); };
  process.once('SIGINT', close); process.once('SIGTERM', close); process.stdin.once('end', close);
  await local.connect(new StdioServerTransport());
}
