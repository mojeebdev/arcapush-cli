import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { wordmark, terminalText } from '../dist/ui.js';
import { apiBase, readStoredToken, writeStoredToken, clearStoredToken, detectProject } from '../dist/lib.js';

const cli = resolve('dist/cli.js');
const temp = mkdtempSync(join(tmpdir(), 'arcapush-test-'));
const calls = [];
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : null;
  calls.push({ path: req.url, method: req.method, body, auth: req.headers.authorization });
  res.setHeader('content-type', 'application/json');
  if (req.url === '/api/v1/cli/submissions' && req.method === 'GET') return res.end(JSON.stringify({ contractVersion: 1, types: {}, media: {} }));
  if (req.headers.authorization !== 'Bearer apc_test') { res.statusCode = 401; return res.end('{"error":"Unauthorized"}'); }
  if (body?.payload?.name === 'Paused account') { res.statusCode = 403; return res.end(JSON.stringify({ error: 'Your account is paused. Open your dashboard for support.', code: 'account_paused' })); }
  if (body?.payload?.name === 'Reject me') { res.statusCode = 422; return res.end('{"error":"Invalid listing"}'); }
  if (body?.action === 'validate') return res.end(JSON.stringify({ valid: true, contextId: body.contextId }));
  if (body?.action === 'submit') return res.end(JSON.stringify({ success: true, id: 'test-id', slug: 'test-build', type: body.type, status: body.type === 'product' ? 'pending_review' : 'published', href: '/test-build', message: 'Received.' }));
  return res.end(JSON.stringify({ success: true, name: 'Test build', status: 'published', url: 'https://arcapush.com/test-build' }));
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, ARCAPUSH_API_URL: base, ARCAPUSH_TOKEN: 'apc_test', XDG_CONFIG_HOME: temp, APPDATA: temp, NO_COLOR: '1' };
function run(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: temp, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
const input = type => ({ type, payload: { name: 'Test build', tagline: 'A useful builder tool', category: 'Developer Tools', problemStatement: 'A useful tool that saves builders time every day.', website: 'https://example.com', founderName: 'Test Builder' } });

test.after(async () => { server.close(); await once(server, 'close'); rmSync(temp, { recursive: true, force: true }); });
test('wordmark fits narrow and wide terminals; terminal control sequences are stripped', () => {
  assert.equal(wordmark(40), 'ARCAPUSH');
  assert.equal(wordmark(80, true).split('\n').length, 6);
  assert.ok(wordmark(80, true).split('\n').every(x => x.length === 47));
  assert.ok(!terminalText('\x1b[2Junsafe').includes('\x1b'));
});
test('metadata suggestions strip repository credentials and query secrets', () => {
  const dir = mkdtempSync(join(temp, 'metadata-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo', homepage: 'https://user:password@example.com/?secret=value', repository: 'https://user:token@github.com/example/demo.git?token=value' }));
  const detected = detectProject(dir);
  assert.equal(detected.website, 'https://example.com/');
  assert.equal(detected.repositoryUrl, 'https://github.com/example/demo');
  assert.ok(!JSON.stringify(detected).includes('password'));
});
test('noninteractive invocation exits instead of hanging or silently submitting', async () => {
  const result = await run([]); assert.equal(result.code, 1); assert.match(result.stderr, /terminal/);
  const json = await run(['submit', '--json']); assert.equal(json.code, 1); assert.match(JSON.parse(json.stdout).error, /requires --input/);
});
test('schema and help do not require credentials', async () => {
  assert.equal((await run(['--help'], { ARCAPUSH_TOKEN: '' })).code, 0);
  const result = await run(['schema', '--json'], { ARCAPUSH_TOKEN: '' }); assert.equal(JSON.parse(result.stdout).contractVersion, 1);
});
test('dry-run validates without a submission or linking file', async () => {
  const file = join(temp, 'dry.json'); writeFileSync(file, JSON.stringify(input('product')));
  const before = calls.length;
  const result = await run(['submit', '--input', file, '--dry-run', '--json']);
  assert.equal(result.code, 0, result.stderr + result.stdout); assert.equal(JSON.parse(result.stdout).valid, true);
  assert.deepEqual(calls.slice(before).map(c => c.body.action), ['validate']);
});
test('all three listing types submit with stable retry IDs and machine-readable output', async () => {
  for (const type of ['product', 'agent', 'hackathon']) {
    const file = join(temp, `${type}.json`); writeFileSync(file, JSON.stringify(input(type)));
    const first = await run(['submit', '--input', file, '--yes', '--json']);
    assert.equal(first.code, 0, first.stdout + first.stderr); assert.equal(JSON.parse(first.stdout).type, type);
    const contextId = JSON.parse(readFileSync(file)).contextId; assert.ok(contextId);
    await run(['submit', `--input=${file}`, '--yes', '--json']);
    assert.equal(calls.at(-1).body.contextId, contextId);
    const linked = JSON.parse(readFileSync(join(temp, 'arcapush.json'))); assert.equal(linked.type, type); assert.equal(linked.apiUrl, base);
  }
});
test('missing explicit approval fails without sending submit', async () => {
  const file = join(temp, 'approve.json'); writeFileSync(file, JSON.stringify(input('product')));
  const before = calls.length; const result = await run(['submit', '--input', file, '--json']);
  assert.equal(result.code, 1); assert.ok(!calls.slice(before).some(c => c.body?.action === 'submit'));
});
test('validation errors remain errors and do not submit', async () => {
  const data = input('product'); data.payload.name = 'Reject me';
  const file = join(temp, 'invalid.json'); writeFileSync(file, JSON.stringify(data));
  const before = calls.length; const result = await run(['submit', '--input', file, '--yes', '--json']);
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.stdout).status, 422); assert.equal(calls.length, before + 1);
});
test('saved credentials are isolated by origin', () => {
  const original = { ...process.env };
  try {
    process.env.XDG_CONFIG_HOME = temp; process.env.APPDATA = temp; delete process.env.ARCAPUSH_TOKEN;
    process.env.ARCAPUSH_API_URL = 'https://arcapush.com'; writeStoredToken('apc_production'); assert.equal(readStoredToken(), 'apc_production');
    process.env.ARCAPUSH_API_URL = 'https://staging.example.com'; assert.equal(readStoredToken(), null);
    process.env.ARCAPUSH_API_URL = 'http://remote.example.com'; assert.throws(apiBase, /HTTPS/);
    process.env.ARCAPUSH_API_URL = 'https://arcapush.com'; clearStoredToken(); assert.equal(readStoredToken(), null);
  } finally { process.env = original; }
});
test('MCP performs a real stdio handshake and prepare/approve/submit flow', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], env, stderr: 'pipe' });
  const client = new Client({ name: 'arcapush-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const list = await client.listTools(); assert.equal(list.tools.length, 5);
    assert.equal(list.tools.find(x => x.name === 'arcapush_submit').annotations.readOnlyHint, false);
    const reviewResult = await client.callTool({ name: 'arcapush_prepare_submission', arguments: input('agent') });
    assert.ok(!reviewResult.isError, JSON.stringify(reviewResult));
    const review = JSON.parse(reviewResult.content[0].text); assert.equal(review.review.type, 'agent');
    const invalid = await client.callTool({ name: 'arcapush_submit', arguments: { confirmationId: review.confirmationId, confirmed: false } }); assert.equal(invalid.isError, true);
    const before = calls.length;
    const receipt = await client.callTool({ name: 'arcapush_submit', arguments: { confirmationId: review.confirmationId, confirmed: true } });
    assert.ok(!receipt.isError); assert.equal(JSON.parse(receipt.content[0].text).status, 'published');
    await client.callTool({ name: 'arcapush_submit', arguments: { confirmationId: review.confirmationId, confirmed: true } });
    assert.equal(calls.length, before + 1);
  } finally { await client.close(); }
});

test('CLI and MCP preserve policy errors without attempting submission', async () => {
  const data = input('product'); data.payload.name = 'Paused account';
  const file = join(temp, 'paused.json'); writeFileSync(file, JSON.stringify(data));
  const before = calls.length;
  const result = await run(['submit', '--input', file, '--yes', '--json']);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).details.code, 'account_paused');
  const client = new Client({ name: 'policy-test', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], env, stderr: 'pipe' }));
    const reply = await client.callTool({ name: 'arcapush_prepare_submission', arguments: data });
    assert.equal(reply.isError, true);
    assert.equal(JSON.parse(reply.content[0].text).details.code, 'account_paused');
  } finally { await client.close(); }
  assert.ok(!calls.slice(before).some(call => call.body?.action === 'submit'));
});
