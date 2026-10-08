import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewLocalMedia, uploadLocalMedia, withoutLocalMedia } from '../dist/media.js';
import { parseSubmission } from '../dist/submissions.js';
const root = mkdtempSync(join(tmpdir(), 'arcapush-media-'));
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(64)]);
writeFileSync(join(root, 'logo.png'), png);
const input = () => parseSubmission({ type: 'product', payload: { media: [{ mediaType: 'LOGO', localPath: 'logo.png', altText: 'Logo' }] } });
test.after(() => rmSync(root, { recursive: true, force: true }));
test('local media requires an explicitly configured root for MCP', () => {
  assert.throws(() => reviewLocalMedia(input()), /disabled/);
  const files = reviewLocalMedia(input(), root); assert.equal(files[0].contentType, 'image/png'); assert.equal(files[0].size, png.length);
  assert.deepEqual(withoutLocalMedia(input()).payload.media, []);
});
test('hidden files, traversal, absolute paths and symlink escapes are rejected', () => {
  for (const localPath of ['.env', '../logo.png', join(root, 'logo.png')]) {
    const value = input(); value.payload.media[0].localPath = localPath;
    assert.throws(() => reviewLocalMedia(value, root));
  }
  const outside = mkdtempSync(join(tmpdir(), 'outside-media-')); writeFileSync(join(outside, 'outside.png'), png);
  try {
    symlinkSync(join(outside, 'outside.png'), join(root, 'linked.png'));
    const value = input(); value.payload.media[0].localPath = 'linked.png'; assert.throws(() => reviewLocalMedia(value, root), /escapes/);
  } finally { rmSync(outside, { recursive: true, force: true }); }
});
test('file contents, media slot and size are checked instead of trusting an extension', () => {
  writeFileSync(join(root, 'fake.png'), 'secret source text'); const value = input(); value.payload.media[0].localPath = 'fake.png'; assert.throws(() => reviewLocalMedia(value, root), /JPEG/);
  const video = input(); video.payload.media[0].mediaType = 'VIDEO'; assert.throws(() => reviewLocalMedia(video, root), /slot/);
  writeFileSync(join(root, 'large.png'), Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)])); const large = input(); large.payload.media[0].localPath = 'large.png'; assert.throws(() => reviewLocalMedia(large, root), /8 MiB/);
});
test('a file changed after review cannot be uploaded', async () => {
  const value = input(); const review = reviewLocalMedia(value, root); writeFileSync(join(root, 'logo.png'), Buffer.concat([png, Buffer.from('changed')]));
  try { await assert.rejects(uploadLocalMedia(value, root, review), /changed/); } finally { writeFileSync(join(root, 'logo.png'), png); }
});
test('signed uploads send bytes without forwarding account credentials and checkpoint receipts', async () => {
  const originalFetch = globalThis.fetch; const previous = process.env.ARCAPUSH_TOKEN; process.env.ARCAPUSH_TOKEN = 'apc_test';
  const requests = []; let checkpoint = false;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/api/v1/cli/media')) return Response.json({ signedUrl: 'https://storage.example.com/storage/v1/object/upload/sign/drafts/logo.png?token=capability', uploadOrigin: 'https://storage.example.com', path: 'users/u/drafts/id/logo.png' });
    return new Response('', { status: 200 });
  };
  try {
    const value = input(); await uploadLocalMedia(value, root, reviewLocalMedia(value, root), () => checkpoint = true);
    assert.equal(requests.length, 2); assert.equal(requests[0].options.headers.authorization, 'Bearer apc_test'); assert.equal(requests[1].options.headers.authorization, undefined);
    assert.equal(requests[1].options.redirect, 'error'); assert.equal(checkpoint, true); assert.equal(value.payload.media[0].sourceType, 'UPLOAD'); assert.equal(value.payload.media[0].localPath, undefined);
  } finally { globalThis.fetch = originalFetch; if (previous === undefined) delete process.env.ARCAPUSH_TOKEN; else process.env.ARCAPUSH_TOKEN = previous; }
});
