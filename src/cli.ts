#!/usr/bin/env node
// Copyright 2026 BlindspotLab Limited
// SPDX-License-Identifier: Apache-2.0
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { api, apiBase, ask, clearStoredToken, CLI_VERSION, confirm, detectProject, openUrl, readLinkedProduct, readStoredToken, writeLinkedProduct, writeStoredToken } from './lib.js';
import { ApiError, getListing, getSchema, parseSubmission, readSubmission, request, saveSubmission, sendSubmission, validateSubmission, type ListingType, type Payload, type SubmissionInput } from './submissions.js';
import { reviewLocalMedia, withoutLocalMedia, uploadLocalMedia } from './media.js';
import { banner, chooseListingType, OnboardingCancelled, showOnboarding, terminalText } from './ui.js';

const HELP = `Arcapush CLI ${CLI_VERSION}
Good products deserve to be discovered.

Usage:
  arcapush                       Open guided submission onboarding
  arcapush login [--no-browser]   Authorize this device in your browser
  arcapush logout                Revoke this device's token
  arcapush submit [--type product|agent|hackathon]
  arcapush submit --input submission.json --dry-run --json
  arcapush submit --input submission.json --yes --json
  arcapush schema [--json]        Current server fields and submission steps
  arcapush status [--json]        Status of the linked listing
  arcapush update --input update.json --yes [--json]
  arcapush open                   Open the linked listing
  arcapush mcp [--project-dir DIR] Start MCP; opt into local media within DIR
  arcapush mcp-config             Print MCP host configuration

Options: --json --input FILE --type TYPE --project-dir DIR --dry-run --yes --ascii --no-browser
Node.js 22+. Sign in once before using an AI agent.
Metadata detection reads package.json, README, git remote and logo paths locally.
Review fields before submission. Source files are not uploaded.
`;

type Flags = Record<string, string | boolean>;
export function args(argv: string[]): { command: string; flags: Flags } {
  let command = ''; const flags: Flags = {};
  const values = new Set(['input', 'type', 'project-dir']);
  const booleans = new Set(['json', 'yes', 'dry-run', 'ascii', 'no-browser', 'help', 'version']);
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (part === '-h') { flags.help = true; continue; }
    if (part === '-v') { flags.version = true; continue; }
    if (!part.startsWith('-')) { if (command) throw new Error(`Unexpected argument: ${part}`); command = part; continue; }
    const equal = part.indexOf('=');
    const key = part.slice(2, equal < 0 ? undefined : equal);
    if (values.has(key)) {
      const value = equal < 0 ? argv[++i] : part.slice(equal + 1);
      if (!value || value.startsWith('--')) throw new Error(`--${key} requires a value.`);
      flags[key] = value;
    } else if (booleans.has(key) && equal < 0) flags[key] = true;
    else throw new Error(`Unknown option: ${part}`);
  }
  return { command, flags };
}

function print(data: unknown, json: boolean, lines: string[] = []): void {
  process.stdout.write(json ? `${JSON.stringify(data)}\n` : `${lines.map(terminalText).join('\n')}\n`);
}
function interactive(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive input needs a terminal. Use --input FILE --yes --json, or arcapush mcp.');
}
async function login(flags: Flags): Promise<void> {
  if (flags.json) throw new Error('Login is interactive. Run arcapush login --no-browser and authorize this device.');
  interactive();
  const started = await request('/api/v1/cli/auth/start', 'POST', {}, false);
  const deviceCode = String(started.deviceCode || '');
  if (!deviceCode) throw new Error('Server did not return a device code.');
  const url = String(started.verificationUrl || '');
  if (new URL(url).origin !== apiBase()) throw new Error('Authorization URL does not match the configured API origin. Check SITE_URL on the server.');
  print(null, false, ['Authorize this device in your browser:', url, `Verification code: ${started.userCode}`, 'Waiting for your approval...']);
  if (!flags['no-browser']) { try { openUrl(url); } catch { /* URL already printed. */ } }
  const interval = Math.max(1, Math.min(Number(started.interval) || 3, 30)) * 1000;
  const expires = Math.max(1, Math.min(Number(started.expiresIn) || 900, 900)) * 1000;
  const deadline = Date.now() + expires;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const result = await api('/api/v1/cli/auth/token', { method: 'POST', body: JSON.stringify({ deviceCode }) });
    if (result.status === 200 && result.data.status === 'pending') continue;
    if (result.status !== 200 || result.data.status !== 'approved' || typeof result.data.token !== 'string' || !result.data.token.startsWith('apc_')) throw new Error(String(result.data.error || 'Authorization expired or was rejected.'));
    writeStoredToken(result.data.token);
    print(null, false, ['Connected. Run arcapush submit, or connect your agent with arcapush mcp-config.']);
    return;
  }
  throw new Error('Authorization timed out. Run arcapush login again.');
}

async function wizard(typeFlag?: string, ascii = false): Promise<SubmissionInput> {
  interactive();
  showOnboarding(2, undefined, ascii);
  const draftFile = '.arcapush-submission.json';
  const resumed = !typeFlag && existsSync(draftFile) && await confirm('Resume the saved submission?', true) ? readSubmission(draftFile) : null;
  const previousPayload = resumed ? JSON.stringify(resumed.payload) : null;
  const previousContext = resumed?.contextId;
  let type = (resumed?.type || typeFlag) as ListingType | undefined;
  if (!type) type = await chooseListingType(ascii);
  const schema = await getSchema();
  if (!type || !schema.types[type]) throw new Error('Choose product, agent, or hackathon.');
  const detected = detectProject();
  const input = resumed || parseSubmission({ type, payload: {} });
  const spec = schema.types[type];
  const defaults: Payload = { name: detected.name, tagline: detected.tagline, website: detected.website, agentUrl: detected.website, productUrl: detected.website, repositoryUrl: detected.repositoryUrl, githubUrl: detected.repositoryUrl, ...input.payload };
  showOnboarding(3, type, ascii);
  print(null, false, ['Local metadata detected. Check all suggestions before submitting.', ...detected.found.map(x => `  ${x}`), 'Optional fields: Enter to skip. Type - to clear a suggested value.']);
  for (const [index, step] of spec.steps.entries()) {
    if (step.id === 'review') break;
    print(null, false, [`\n${index + 1}/${spec.steps.length}  ${step.label}`, step.hint]);
    if (step.id === 'basics') print(null, false, [`Categories: ${spec.categories.join(', ')}`]);
    if (step.id === 'passport' && !await confirm('Add optional agent passport details?', false)) continue;
    for (const field of spec.fields.filter(x => x.step === step.id)) {
      let value: string;
      do {
        if (field.hint) print(null, false, [field.hint]);
        value = await ask(terminalText(`${field.label}${field.required ? ' *' : ''}`), terminalText(defaults[field.key] || ''));
        if (value === '-') value = '';
        if (field.required && !value) print(null, false, ['This field is required.']);
        else if (value && ((field.minLength && value.length < field.minLength) || (field.maxLength && value.length > field.maxLength))) print(null, false, [`Use ${field.minLength || 1}-${field.maxLength || 'unlimited'} characters.`]);
        else if (field.key === 'category' && !spec.categories.includes(value)) print(null, false, ['Choose a category exactly as listed.']);
        else break;
      } while (true);
      if (value) input.payload[field.key] = value;
      else delete input.payload[field.key];
    }
    if (step.id === 'media' && !(Array.isArray(input.payload.media) && input.payload.media.length && await confirm('Keep the saved media links?', true))) {
      const media: Payload[] = [];
      print(null, false, ['Use a public HTTPS URL or a relative local file path, e.g. public/logo.png.']);
      for (const [kind, limit] of [['LOGO', 1], ['COVER', 1], ['SCREENSHOT', schema.media.maxScreenshots], ['VIDEO', schema.media.maxVideos]] as const) {
        for (let n = 0; n < limit && media.length < schema.media.maxItems; n++) {
          const url = await ask(`${kind.toLowerCase()} URL or file${n ? ` ${n + 1}` : ''} (optional)`, kind === 'LOGO' ? detected.logoUrl : '');
          if (!url || url === '-') break;
          const altText = await ask('Alt text / short description (optional)');
          media.push(/^https:\/\//i.test(url) ? { mediaType: kind, sourceType: kind === 'VIDEO' && /(?:youtube\.com|youtu\.be)/.test(url) ? 'YOUTUBE' : 'EXTERNAL_URL', url, altText: altText || null, position: media.length } : { mediaType: kind, localPath: url, altText: altText || null, position: media.length });
        }
      }
      input.payload.media = media;
    }
    if (previousPayload !== null && JSON.stringify(input.payload) !== previousPayload && input.contextId === previousContext) input.contextId = randomUUID();
    saveSubmission(draftFile, input);
  }
  saveSubmission(draftFile, input);
  return input;
}

async function submit(flags: Flags): Promise<void> {
  const json = Boolean(flags.json);
  const guided = !json && !flags.input && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!readStoredToken()) {
    if (json || flags.input || !process.stdin.isTTY) throw new Error('Run arcapush login first.');
    if (guided) showOnboarding(1, undefined, Boolean(flags.ascii));
    if (!await confirm('Connect your Arcapush account?', true)) return;
    await login(flags);
  }
  if (json && !flags.input) throw new Error('--json submit requires --input FILE. It never invents submission fields.');
  const input = flags.input ? readSubmission(String(flags.input)) : await wizard(flags.type as string | undefined, Boolean(flags.ascii));
  // Persist the UUID before any network write, making retries of this file stable.
  if (flags.input && !flags['dry-run']) saveSubmission(String(flags.input), input);
  const root = String(flags['project-dir'] || process.cwd());
  const localFiles = reviewLocalMedia(input, root);
  const validation = await validateSubmission(localFiles.length ? withoutLocalMedia(input) : input);
  if (guided) showOnboarding(4, input.type, Boolean(flags.ascii));
  if (flags['dry-run']) { print({ success: true, ...validation, submission: input, localFiles, uploadsPending: localFiles.length > 0 }, json, ['Fields validated; local files inspected without uploading. No listing or server draft was created.', JSON.stringify(input, null, 2)]); return; }
  if (!json) print(null, false, ['\nReview your submission', JSON.stringify(input, null, 2), ...(localFiles.length ? ['Local files will be uploaded after confirmation:', JSON.stringify(localFiles, null, 2)] : []), input.type === 'product' ? 'This product will be queued for review.' : 'The current website policy publishes agents and hackathon builds immediately.']);
  if (!flags.yes) { interactive(); if (!await confirm('Submit this listing to Arcapush?', false)) { print(null, json, ['Cancelled. Your local draft is saved.']); return; } }
  await uploadLocalMedia(input, root, localFiles, () => saveSubmission(String(flags.input || '.arcapush-submission.json'), input));
  if (localFiles.length) await validateSubmission(input);
  const result = await sendSubmission(input);
  if (typeof result.id !== 'string' || typeof result.slug !== 'string') throw new Error('Submission response is incomplete. Keep the same contextId and check before retrying.');
  writeLinkedProduct({ productId: result.id, slug: result.slug, type: input.type });
  print({ success: true, ...result }, json, [String(result.message || 'Submitted.'), `Status: ${result.status}`, `${apiBase()}${result.href}`, `Dashboard: ${apiBase()}/dashboard`, 'Saved arcapush.json. Keep your submission contextId for safe retries.']);
}

async function status(json: boolean): Promise<void> {
  const linked = readLinkedProduct();
  if (!linked) throw new Error('No arcapush.json in this directory. Submit first.');
  const result = await getListing(linked.type, linked.productId);
  print(result, json, [String(result.name || linked.slug), `Status: ${result.status}`, String(result.url || ''), JSON.stringify(result.metrics || {}, null, 2)]);
}

async function update(flags: Flags): Promise<void> {
  const linked = readLinkedProduct();
  if (!linked) throw new Error('No linked listing. Submit first.');
  if (linked.type !== 'product') throw new Error(`Edit agents and hackathon builds at ${apiBase()}/dashboard. This release keeps CLI update limited to products.`);
  if (!flags.input) throw new Error('Use --input update.json with only the product fields you intend to change.');
  const { readFileSync } = await import('node:fs');
  const body = JSON.parse(readFileSync(String(flags.input), 'utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) throw new Error('Update must be a nonempty JSON object.');
  if (!flags.json) print(null, false, ['Review product changes:', JSON.stringify(body, null, 2)]);
  if (!flags.yes) { interactive(); if (!await confirm('Apply these changes?', false)) return; }
  const result = await request(`/api/v1/cli/products/${encodeURIComponent(linked.productId)}`, 'PATCH', body);
  print(result, Boolean(flags.json), ['Product updated.']);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { command, flags } = args(argv);
  const json = Boolean(flags.json);
  if (flags.help) { process.stdout.write(HELP); return; }
  if (flags.version) { process.stdout.write(`${CLI_VERSION}\n`); return; }
  if (command === 'mcp') { const { startMcp } = await import('./mcp.js'); await startMcp(typeof flags['project-dir'] === 'string' ? flags['project-dir'] : process.env.ARCAPUSH_PROJECT_DIR); return; }
  if (command === 'mcp-config') { print({ mcpServers: { arcapush: { command: 'arcapush', args: ['mcp'] } } }, true); return; }
  if (command === 'schema') { const schema = await getSchema(); print(schema, json, [JSON.stringify(schema, null, 2)]); return; }
  if (!json && process.stdout.isTTY && command === 'login') banner(Boolean(flags.ascii));
  if (command === 'login') return login(flags);
  if (command === 'logout') {
    const token = readStoredToken();
    let revoked = !token;
    if (token) { const result = await api('/api/v1/cli/auth/revoke', { method: 'POST', token }).catch(() => null); revoked = Boolean(result && result.status < 400); }
    clearStoredToken();
    print({ success: true, revoked, environmentToken: Boolean(process.env.ARCAPUSH_TOKEN) }, json, ['Local credentials removed.', revoked ? 'Server token revoked.' : `Server revocation failed. Revoke the session at ${apiBase()}/dashboard/cli.`, ...(process.env.ARCAPUSH_TOKEN ? ['Unset ARCAPUSH_TOKEN in your environment.'] : [])]); return;
  }
  if (command === 'submit') return submit(flags);
  if (command === 'status') return status(json);
  if (command === 'update') return update(flags);
  if (command === 'open') {
    const linked = readLinkedProduct();
    const result = linked ? await getListing(linked.type, linked.productId) : {};
    const url = String(result.url || `${apiBase()}/dashboard`);
    print({ url }, json, [url]); if (!json) { try { openUrl(url); } catch { /* URL already printed. */ } } return;
  }
  if (command) throw new Error(`Unknown command: ${command}`);
  if (json) throw new Error('Choose a command with --json.');
  interactive();
  return submit(flags);
}

void main().catch(error => {
  if (error instanceof OnboardingCancelled) { process.stderr.write(`${error.message}\n`); process.exitCode = 130; return; }
  const details = error instanceof ApiError ? { status: error.status, details: error.details } : {};
  if (process.argv.includes('--json')) print({ success: false, error: error instanceof Error ? error.message : 'Command failed.', ...details }, true);
  else process.stderr.write(`${terminalText(error instanceof Error ? error.message : 'Command failed.')}\n`);
  process.exitCode = 1;
});
