// Copyright 2026 BlindspotLab Limited
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { api, apiBase, readStoredToken } from "./lib.js";

export type ListingType = "product" | "agent" | "hackathon";
export type Payload = Record<string, unknown>;
export interface SubmissionInput { type: ListingType; payload: Payload; contextId: string; apiUrl: string }
export interface Field { key: string; label: string; step: string; required?: boolean; minLength?: number; maxLength?: number; hint?: string }
export interface SubmissionSchema {
  contractVersion: number;
  types: Record<ListingType, { steps: Array<{ id: string; label: string; hint: string }>; categories: string[]; fields: Field[] }>;
  media: { maxItems: number; maxScreenshots: number; maxVideos: number };
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: Payload = {}) { super(message); }
}

/**
 * The message shown for a failed API call. The server's own JSON error wins —
 * it is specific ("Submission draft not found.", an eligibility instruction).
 * Only a response without one falls back to a generic explanation, so a
 * missing draft is never misreported as an outdated server.
 */
export function apiErrorMessage(status: number, data: Payload, authenticated: boolean): string {
  const raw = typeof data.error === "string" ? data.error.trim() : "";
  const server = raw && !raw.startsWith("API returned HTTP") ? raw : "";
  if (status === 401 && authenticated && (data.code === "token_invalid" || !server || server === "Unauthorized")) {
    return "Your Arcapush CLI session has expired or was revoked. Run arcapush login.";
  }
  if (data.code === "declaration_required") {
    return `${server || "Confirm you're 18 or older in your browser first."} ${apiBase()}/dashboard`;
  }
  if (server) return server;
  if (status === 404) return "This Arcapush server does not offer that CLI endpoint. Check ARCAPUSH_API_URL or update the CLI.";
  return `API request failed (${status}).`;
}

export async function request(path: string, method = "GET", body?: unknown, authenticated = true): Promise<Payload> {
  const token = authenticated ? readStoredToken() : null;
  if (authenticated && !token) throw new ApiError("Not logged in. Run arcapush login in your terminal first.", 401);
  const result = await api(path, { method, token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (result.status >= 400) throw new ApiError(apiErrorMessage(result.status, result.data, authenticated), result.status, result.data);
  if (typeof result.data !== "object" || !result.data || Array.isArray(result.data)) throw new Error("Invalid API response.");
  return result.data;
}

export async function getSchema(): Promise<SubmissionSchema> {
  const data = await request("/api/v1/cli/submissions", "GET", undefined, false);
  if (data.contractVersion !== 1 || !data.types) throw new Error("Unsupported submission contract. Update the CLI.");
  return data as unknown as SubmissionSchema;
}

export function parseSubmission(value: unknown): SubmissionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Submission must be a JSON object.");
  const input = value as Payload;
  if (!["product", "agent", "hackathon"].includes(String(input.type))) throw new Error("type must be product, agent, or hackathon.");
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new Error("payload must be an object.");
  if (Buffer.byteLength(JSON.stringify(input.payload)) > 64 * 1024) throw new Error("Submission payload exceeds 64 KiB.");
  if (input.apiUrl && input.apiUrl !== apiBase()) throw new Error("Submission belongs to a different API origin.");
  const contextId = input.contextId ?? randomUUID();
  if (typeof contextId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contextId)) throw new Error("contextId must be a UUID.");
  return { type: input.type as ListingType, payload: input.payload as Payload, contextId, apiUrl: apiBase() };
}

export function readSubmission(path: string): SubmissionInput {
  const text = readFileSync(path, "utf8");
  if (Buffer.byteLength(text) > 70 * 1024) throw new Error("Submission file exceeds 70 KiB.");
  return parseSubmission(JSON.parse(text));
}

export function saveSubmission(path: string, input: SubmissionInput): void {
  writeFileSync(path, `${JSON.stringify(input, null, 2)}\n`, { mode: 0o600 });
}

export function validateSubmission(input: SubmissionInput): Promise<Payload> {
  return request("/api/v1/cli/submissions", "POST", { ...input, action: "validate" });
}

export function sendSubmission(input: SubmissionInput): Promise<Payload> {
  return request("/api/v1/cli/submissions", "POST", { ...input, action: "submit" });
}

export function getListing(type: string, id: string): Promise<Payload> {
  return request(`/api/v1/cli/listings/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
}
