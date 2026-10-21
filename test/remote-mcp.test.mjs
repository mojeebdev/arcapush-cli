import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mcpUrl } from '../dist/remote-mcp.js';

test('remote URL validation rejects unsafe targets', () => {
  const original = process.env.ARCAPUSH_MCP_URL;
  try {
    for (const url of ['http://example.com/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?token=secret', 'https://example.com/not-mcp']) {
      process.env.ARCAPUSH_MCP_URL = url;
      assert.throws(() => mcpUrl());
    }
  } finally { if (original === undefined) delete process.env.ARCAPUSH_MCP_URL; else process.env.ARCAPUSH_MCP_URL = original; }
});

test('stdio bridge forwards hosted tools, safety annotations and calls without using CLI tokens', async () => {
  const root = mkdtempSync(join(tmpdir(), 'arcapush-remote-'));
  const endpoint = 'https://mcp.example.com/mcp';
  const dir = join(root, 'arcapush'); mkdirSync(dir);
  const suffix = createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
  writeFileSync(join(dir, `mcp-${suffix}.json`), JSON.stringify({ tokens: { access_token: 'oauth-test-token', token_type: 'Bearer' } }), { mode: 0o600 });
  const fixture = join(root, 'mock-fetch.mjs');
  writeFileSync(fixture, `
    globalThis.fetch = async (url, init = {}) => {
      if (String(url) !== '${endpoint}') throw new Error('Unexpected target');
      const headers = new Headers(init.headers);
      if (headers.get('authorization') !== 'Bearer oauth-test-token') throw new Error('Wrong credential type');
      if (init.method === 'GET') return new Response(null, { status: 405 });
      const message = JSON.parse(init.body);
      if (message.id === undefined) return new Response(null, { status: 202 });
      const result = message.method === 'initialize'
        ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'hosted-arcapush', version: '1' } }
        : message.method === 'tools/list'
        ? { tools: [{ name: 'arcapush_submit', description: 'Submit after human approval', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false, idempotentHint: true } }] }
        : { content: [{ type: 'text', text: JSON.stringify(message.params) }] };
      return Response.json({ jsonrpc: '2.0', id: message.id, result });
    };
  `);
  const client = new Client({ name: 'test-host', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', pathToFileURL(fixture).href, resolve('dist/cli.js'), 'mcp'], env: { ...process.env, ARCAPUSH_MCP_URL: endpoint, ARCAPUSH_TOKEN: 'apc_must-not-be-forwarded', XDG_CONFIG_HOME: root, APPDATA: root }, stderr: 'pipe' }));
    const tools = await client.listTools();
    assert.equal(tools.tools[0].annotations.readOnlyHint, false);
    const result = await client.callTool({ name: 'arcapush_submit', arguments: { confirmationId: 'unchanged', confirmed: true } });
    assert.equal(JSON.parse(result.content[0].text).arguments.confirmationId, 'unchanged');
  } finally { await client.close(); rmSync(root, { recursive: true, force: true }); }
});
