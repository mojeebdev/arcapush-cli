// Copyright 2026 BlindspotLab Limited
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { request, type Payload, type SubmissionInput } from './submissions.js';

export interface LocalMediaReview { position: number; localPath: string; mediaType: string; contentType: string; size: number; sha256: string }
function mime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (bytes.subarray(0, 4).equals(Buffer.from([26,69,223,163]))) return 'video/webm';
  throw new Error('Local media must be JPEG, PNG, WebP, MP4 or WebM. SVG and arbitrary documents are not uploaded.');
}
function localFile(root: string, localPath: string): Buffer {
  if (!localPath || isAbsolute(localPath) || localPath.split(/[\\/]/).some(part => part.startsWith('.'))) throw new Error('Use a relative media path without hidden files or parent traversal.');
  const allowedRoot = realpathSync(root);
  const path = realpathSync(resolve(allowedRoot, localPath));
  const rel = relative(allowedRoot, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Local media path escapes the configured project directory.');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 50 * 1024 * 1024) throw new Error('Media must be a regular file of at most 50 MiB.');
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
export function reviewLocalMedia(input: SubmissionInput, root?: string): LocalMediaReview[] {
  const media = Array.isArray(input.payload.media) ? input.payload.media as Payload[] : [];
  const local = media.filter(item => typeof item?.localPath === 'string');
  if (!local.length) return [];
  if (!root) throw new Error('Local media access is disabled. Configure arcapush mcp --project-dir /absolute/project/path first.');
  if (media.length > 8) throw new Error('At most eight media items are allowed.');
  for (const [kind, limit] of Object.entries({ LOGO: 1, COVER: 1, SCREENSHOT: 6, VIDEO: 2 })) {
    if (media.filter(item => item.mediaType === kind).length > limit) throw new Error(`Too many ${kind} media items (maximum ${limit}).`);
  }
  return media.flatMap((item, position) => {
    if (typeof item?.localPath !== 'string') return [];
    if (item.url || item.storagePath) throw new Error('Choose localPath or a public URL for a media item, not both.');
    if (!['LOGO', 'COVER', 'SCREENSHOT', 'VIDEO'].includes(String(item.mediaType))) throw new Error('Invalid mediaType.');
    const bytes = localFile(root, item.localPath);
    const contentType = mime(bytes);
    if ((item.mediaType === 'VIDEO') !== contentType.startsWith('video/')) throw new Error('The file contents do not match the selected media slot.');
    if (contentType.startsWith('image/') && bytes.length > 8 * 1024 * 1024) throw new Error('Images must be at most 8 MiB.');
    return [{ position, localPath: item.localPath, mediaType: String(item.mediaType), contentType, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
  });
}
/** Validate non-file fields without claiming the not-yet-uploaded objects exist remotely. */
export function withoutLocalMedia(input: SubmissionInput): SubmissionInput {
  return { ...input, payload: { ...input.payload, media: Array.isArray(input.payload.media) ? (input.payload.media as Payload[]).filter(item => !item.localPath) : [] } };
}
export async function uploadLocalMedia(input: SubmissionInput, root: string | undefined, expected: LocalMediaReview[], checkpoint?: () => void): Promise<void> {
  const actual = reviewLocalMedia(input, root);
  for (const file of actual) {
    const reviewed = expected.find(x => x.position === file.position);
    if (!reviewed || reviewed.sha256 !== file.sha256 || reviewed.localPath !== file.localPath) throw new Error('Local media changed after review. Prepare and approve again.');
    const bytes = localFile(root!, file.localPath);
    if (createHash('sha256').update(bytes).digest('hex') !== reviewed.sha256) throw new Error('Local file changed before upload. Review it again.');
    const upload = await request('/api/v1/cli/media', 'POST', { contextId: input.contextId, type: input.type, mediaType: file.mediaType, fileName: basename(file.localPath), contentType: file.contentType, size: bytes.length });
    const url = new URL(String(upload.signedUrl));
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== upload.uploadOrigin || !url.pathname.includes('/storage/v1/object/upload/sign/')) throw new Error('The server returned an invalid signed upload destination.');
    // The storage URL is an API-issued upload capability. Never forward the Arcapush bearer token.
    const result = await fetch(url, { method: 'PUT', body: new Uint8Array(bytes), headers: { 'content-type': file.contentType }, redirect: 'error', signal: AbortSignal.timeout(120_000) });
    if (!result.ok) throw new Error(`Media upload failed (HTTP ${result.status}). Your listing has not been submitted.`);
    if (typeof upload.path !== 'string') throw new Error('Upload response did not contain a storage path.');
    const item = (input.payload.media as Payload[])[file.position];
    (input.payload.media as Payload[])[file.position] = { mediaType: file.mediaType, sourceType: 'UPLOAD', storagePath: upload.path, url: null, altText: item.altText || null, position: file.position };
    checkpoint?.();
  }
}
