import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export const DEFAULT_API = "https://arcapush.com";
export const CLI_VERSION = "0.1.0";

export type JsonMode = boolean;

export function apiBase(): string {
  return (process.env.ARCAPUSH_API_URL || DEFAULT_API).replace(/\/$/, "");
}

export function configDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "arcapush");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "arcapush");
}

function tokenPath(): string {
  return join(configDir(), "token");
}

export function readStoredToken(): string | null {
  const env = process.env.ARCAPUSH_TOKEN?.trim();
  if (env) return env;
  try {
    const raw = readFileSync(tokenPath(), "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function writeStoredToken(token: string): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const file = tokenPath();
  writeFileSync(file, `${token}\n`, { encoding: "utf8" });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows cannot always set POSIX modes.
  }
}

export function clearStoredToken(): void {
  try {
    rmSync(tokenPath());
  } catch {
    // already gone
  }
}

export function fail(message: string, json: JsonMode, extra: Record<string, unknown> = {}): never {
  if (json) {
    process.stdout.write(`${JSON.stringify({ success: false, error: message, ...extra })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(1);
}

export function ok(payload: Record<string, unknown>, json: JsonMode, lines: string[]): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ success: true, ...payload })}\n`);
    return;
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

export async function api(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": `arcapush-cli/${CLI_VERSION}`,
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const response = await fetch(`${apiBase()}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, data };
}

export async function requireToken(json: JsonMode): Promise<string> {
  const token = readStoredToken();
  if (!token) fail("Not logged in. Run `arcapush login`.", json);
  return token;
}

export function openUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Refused to open an invalid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Refused to open a non-http URL.");
  }
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", parsed.toString()] : [parsed.toString()];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

export async function ask(question: string, fallback = ""): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(fallback ? `${question} (${fallback}): ` : `${question}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await ask(`${question} [${hint}]`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

export function cwd(): string {
  return process.cwd();
}

function readText(path: string, limit = 8_000): string | null {
  try {
    return readFileSync(path, "utf8").slice(0, limit);
  } catch {
    return null;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function firstParagraph(markdown: string): string {
  const withoutHeading = markdown.replace(/^#+\s+.+$/m, "").trim();
  const block = withoutHeading.split(/\n\s*\n/)[0] ?? "";
  return block.replace(/\s+/g, " ").replace(/[#*_`]/g, "").trim().slice(0, 180);
}

function heading(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || null;
}

function gitRemote(dir: string): string | null {
  const gitConfig = readText(join(dir, ".git", "config"), 4_000);
  if (!gitConfig) return null;
  const match = gitConfig.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  if (raw.startsWith("git@github.com:")) {
    return `https://github.com/${raw.replace("git@github.com:", "").replace(/\.git$/, "")}`;
  }
  return raw.replace(/\.git$/, "");
}

const LOGO_CANDIDATES = [
  "public/logo.svg",
  "public/logo.png",
  "public/icon.svg",
  "public/favicon.ico",
  "logo.svg",
  "logo.png",
];

export interface DetectedProject {
  name: string;
  tagline: string;
  website: string;
  repositoryUrl: string;
  logoPath: string;
  category: string;
  found: string[];
}

export function detectProject(dir = cwd()): DetectedProject {
  const found: string[] = [];
  const pkg = readJson(join(dir, "package.json"));
  if (pkg) found.push("package.json");
  const readmePath = ["README.md", "readme.md", "README"].map((name) => join(dir, name)).find(existsSync);
  const readme = readmePath ? readText(readmePath) : null;
  if (readme) found.push("README");
  const remote = gitRemote(dir);
  if (remote) found.push("git remote");

  const homepage = typeof pkg?.homepage === "string" ? pkg.homepage : "";
  const repoField = pkg?.repository;
  const repoFromPkg =
    typeof repoField === "string"
      ? repoField
      : repoField && typeof repoField === "object" && typeof (repoField as { url?: string }).url === "string"
        ? (repoField as { url: string }).url.replace(/^git\+/, "").replace(/\.git$/, "")
        : "";

  const logoPath = LOGO_CANDIDATES.find((candidate) => existsSync(join(dir, candidate))) ?? "";
  if (logoPath) found.push(logoPath);

  return {
    name: String(pkg?.name ?? heading(readme ?? "") ?? "").replace(/^@[^/]+\//, ""),
    tagline: String(pkg?.description ?? firstParagraph(readme ?? "") ?? ""),
    website: homepage,
    repositoryUrl: remote || repoFromPkg,
    logoPath,
    category: "Developer Tools",
    found,
  };
}

export interface LinkedProduct {
  productId: string;
  slug: string;
  type: string;
}

export function arcapushJsonPath(dir = cwd()): string {
  return join(dir, "arcapush.json");
}

export function readLinkedProduct(dir = cwd()): LinkedProduct | null {
  const data = readJson(arcapushJsonPath(dir));
  if (!data || typeof data.productId !== "string") return null;
  return {
    productId: data.productId,
    slug: typeof data.slug === "string" ? data.slug : "",
    type: typeof data.type === "string" ? data.type : "product",
  };
}

export function writeLinkedProduct(product: LinkedProduct, dir = cwd()): void {
  writeFileSync(
    arcapushJsonPath(dir),
    `${JSON.stringify({
      $schema: "https://arcapush.com/schema.json",
      productId: product.productId,
      slug: product.slug,
      type: product.type,
    }, null, 2)}\n`,
  );
}

export function parseArgs(argv: string[]): { command: string; flags: Record<string, string | boolean> } {
  const [, , ...rest] = argv;
  let command = "";
  const flags: Record<string, string | boolean> = {};
  for (const part of rest) {
    if (part === "--help" || part === "-h") flags.help = true;
    else if (part === "--version" || part === "-v") flags.version = true;
    else if (part === "--json") flags.json = true;
    else if (part === "--force") flags.force = true;
    else if (part.startsWith("--") && part.includes("=")) {
      const [key, value] = part.slice(2).split("=");
      flags[key] = value;
    } else if (!part.startsWith("-") && !command) command = part;
    else if (part.startsWith("--")) flags[part.slice(2)] = true;
  }
  return { command, flags };
}


