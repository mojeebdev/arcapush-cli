#!/usr/bin/env node
import {
  api,
  apiBase,
  ask,
  clearStoredToken,
  CLI_VERSION,
  confirm,
  detectProject,
  fail,
  ok,
  openUrl,
  parseArgs,
  readLinkedProduct,
  readStoredToken,
  requireToken,
  writeLinkedProduct,
  writeStoredToken,
} from "./lib.js";

const HELP = `Arcapush CLI ${CLI_VERSION}

Ship alone. Get discovered.

Usage:
  arcapush                 Interactive menu
  arcapush login
  arcapush logout
  arcapush submit
  arcapush update
  arcapush status
  arcapush open
  arcapush --help
  arcapush --version

JSON:
  arcapush submit --json
  arcapush status --json

The CLI reads package.json, README, git remote, and public logo paths.
It never uploads source code, .env files, or secrets.
`;

async function login(json: boolean): Promise<void> {
  const started = await api("/api/v1/cli/auth/start", { method: "POST" });
  if (started.status !== 200) {
    fail(String(started.data.error || "Could not start login."), json);
  }
  const deviceCode = String(started.data.deviceCode ?? "");
  const userCode = String(started.data.userCode ?? "");
  const verificationUrl = String(started.data.verificationUrl ?? `${apiBase()}/cli/authorize`);
  const interval = Number(started.data.interval ?? 3) * 1000;

  if (!json) {
    process.stdout.write(`\nOpening Arcapush...\n\nVerification code:\n${userCode}\n\nConfirm this device in your browser.\n`);
  }
  try {
    openUrl(verificationUrl);
  } catch {
    if (!json) process.stdout.write(`Open this URL:\n${verificationUrl}\n`);
  }

  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const exchanged = await api("/api/v1/cli/auth/token", {
      method: "POST",
      body: JSON.stringify({ deviceCode }),
    });
    if (exchanged.data.status === "pending") continue;
    if (exchanged.status !== 200 || exchanged.data.status !== "approved") {
      fail(String(exchanged.data.error || "Login failed."), json);
    }
    const token = String(exchanged.data.token ?? "");
    writeStoredToken(token);
    const user = (exchanged.data.user ?? {}) as { name?: string; email?: string };
    ok(
      { user },
      json,
      [`\nLogged in as ${user.name || user.email || "founder"}.`],
    );
    return;
  }
  fail("Login timed out.", json);
}

async function logout(json: boolean): Promise<void> {
  const token = readStoredToken();
  if (token) {
    await api("/api/v1/cli/auth/revoke", { method: "POST", token }).catch(() => {});
  }
  clearStoredToken();
  ok({}, json, ["Logged out. Local token removed."]);
}

async function submit(json: boolean, force = false): Promise<void> {
  const token = await requireToken(json);
  const detected = detectProject();
  if (!json) {
    process.stdout.write("\nArcapush reads project metadata only. Source code is never uploaded.\n\n");
    for (const item of detected.found) process.stdout.write(`  found ${item}\n`);
    process.stdout.write("\n");
  }

  let type = "product";
  if (!json) {
    process.stdout.write("What are you shipping?\n  1) Product\n  2) AI Agent\n  3) Hackathon Project\n");
    const choice = await ask("Choose", "1");
    type = choice === "2" ? "agent" : choice === "3" ? "hackathon" : "product";
  }

  const name = json ? detected.name : await ask("Product", detected.name);
  const tagline = json ? detected.tagline : await ask("Tagline", detected.tagline);
  const website = json ? detected.website : await ask("Website", detected.website);
  const repositoryUrl = json ? detected.repositoryUrl : await ask("GitHub", detected.repositoryUrl);
  const category = json ? detected.category : await ask("Category", detected.category);
  const problemStatement = json
    ? (detected.tagline || `${name} is a ${category} product.`)
    : await ask("What problem does it solve?", detected.tagline);
  const logoUrl = json ? detected.logoUrl : await ask("Logo / product image URL", detected.logoUrl);

  if (!json) {
    process.stdout.write(`\nProduct: ${name}\nTagline: ${tagline}\nWebsite: ${website}\nGitHub: ${repositoryUrl}\nLogo: ${logoUrl || detected.logoPath || "none"}\nCategory: ${category}\n\n`);
    if (!(await confirm("Continue?"))) fail("Cancelled.", false);
  }

  if (!name || !tagline || !website) {
    fail("name, tagline, and website are required.", json);
  }

  const payload = {
    type,
    name,
    tagline,
    problemStatement: problemStatement || tagline,
    category,
    website,
    repositoryUrl: repositoryUrl || undefined,
    logoUrl: logoUrl || undefined,
    force,
  };

  const result = await api("/api/v1/cli/products", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });

  if (result.status === 409 && result.data.error === "possible_duplicate") {
    const matches = Array.isArray(result.data.matches) ? result.data.matches : [];
    if (json) fail("possible_duplicate", true, { matches });
    process.stdout.write("\nThis product may already exist on Arcapush.\n");
    for (const match of matches) {
      const item = match as { name?: string; url?: string; claimed?: boolean };
      process.stdout.write(`  ${item.name} ${item.claimed ? "(claimed)" : ""} ${item.url ?? ""}\n`);
    }
    process.stdout.write("\n  1) View listing\n  2) Submit anyway for admin review\n  3) Cancel\n");
    const choice = await ask("Choose", "3");
    if (choice === "1") {
      const first = matches[0] as { url?: string } | undefined;
      if (first?.url) openUrl(String(first.url));
      return;
    }
    if (choice === "2") return submit(false, true);
    fail("Cancelled.", false);
  }

  if (result.status >= 400) {
    fail(String(result.data.error || "Submission failed."), json);
  }

  writeLinkedProduct({
    productId: String(result.data.id ?? ""),
    slug: String(result.data.slug ?? ""),
    type,
  });

  ok(
    {
      id: result.data.id,
      status: result.data.status,
      url: result.data.url,
      slug: result.data.slug,
    },
    json,
    [
      `\nSubmitted ${name}.`,
      `Status: ${String(result.data.status ?? "pending_review")}`,
      String(result.data.url ?? ""),
      "Wrote arcapush.json",
    ],
  );
}

async function status(json: boolean): Promise<void> {
  const token = await requireToken(json);
  const linked = readLinkedProduct();
  if (!linked) fail("No arcapush.json in this directory. Submit first.", json);

  const result = await api(`/api/v1/cli/products/${linked.productId}`, { token });
  if (result.status >= 400) fail(String(result.data.error || "Could not load status."), json);

  const metrics = (result.data.metrics ?? {}) as Record<string, number>;
  const editorial = (result.data.editorial ?? {}) as Record<string, boolean>;
  const flags = [
    editorial.featured ? "Featured" : "",
    editorial.editorsPick ? "Editors pick" : "",
    editorial.rising ? "Rising" : "",
  ].filter(Boolean);

  ok(
    {
      id: result.data.id,
      status: result.data.status,
      url: result.data.url,
      metrics,
      editorial,
    },
    json,
    [
      `Arcapush — ${String(result.data.name ?? linked.slug)}`,
      "",
      "Status",
      `${result.data.status === "published" ? "Published" : String(result.data.status)}`,
      "",
      `Views                ${metrics.views ?? 0}`,
      `Outbound visits      ${metrics.visits ?? 0}`,
      `Shares               ${metrics.shares ?? 0}`,
      "",
      "Editorial",
      flags.join(", ") || "None",
      "",
      String(result.data.url ?? ""),
    ],
  );
}

async function update(json: boolean): Promise<void> {
  const token = await requireToken(json);
  const linked = readLinkedProduct();
  if (!linked) fail("No arcapush.json in this directory. Submit first.", json);
  const detected = detectProject();

  const current = await api(`/api/v1/cli/products/${linked.productId}`, { token });
  if (current.status >= 400) fail(String(current.data.error || "Could not load product."), json);

  const next = {
    tagline: detected.tagline,
    website: detected.website,
    repositoryUrl: detected.repositoryUrl,
    category: detected.category,
  };

  if (!json) {
    process.stdout.write("\nDetected updates from local metadata:\n");
    process.stdout.write(`  tagline: ${next.tagline || "(unchanged unless you edit)"}\n`);
    process.stdout.write(`  website: ${next.website}\n`);
    process.stdout.write(`  repository: ${next.repositoryUrl}\n`);
    process.stdout.write(`  category: ${next.category}\n\n`);
    if (!(await confirm("Apply these updates?"))) fail("Cancelled.", false);
    next.tagline = await ask("Tagline", next.tagline);
    next.website = await ask("Website", next.website);
    next.repositoryUrl = await ask("Repository", next.repositoryUrl);
    next.category = await ask("Category", next.category);
  }

  const body: Record<string, string> = {};
  if (next.tagline) body.tagline = next.tagline;
  if (next.website) body.website = next.website;
  if (next.repositoryUrl) body.repositoryUrl = next.repositoryUrl;
  if (next.category) body.category = next.category;

  const result = await api(`/api/v1/cli/products/${linked.productId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
  if (result.status >= 400) fail(String(result.data.error || "Update failed."), json);
  ok({ id: result.data.id, slug: result.data.slug }, json, ["Product updated."]);
}

async function openListing(json: boolean): Promise<void> {
  const linked = readLinkedProduct();
  let url = `${apiBase()}/discovery`;
  if (linked) {
    const token = readStoredToken();
    if (token) {
      const result = await api(`/api/v1/cli/products/${linked.productId}`, { token });
      if (typeof result.data.url === "string") url = result.data.url;
    }
  }
  if (!json) process.stdout.write(`Opening ${url}\n`);
  openUrl(url);
  ok({ url }, json, []);
}

async function menu(): Promise<void> {
  process.stdout.write("\nArcapush\n\nShip alone. Get discovered.\n\nWhat do you want to do?\n\n");
  process.stdout.write("  1) Submit this product\n  2) Update an existing product\n  3) Check status\n  4) Open Arcapush\n  5) Login / Logout\n");
  const choice = await ask("Choose", "1");
  if (choice === "2") return update(false);
  if (choice === "3") return status(false);
  if (choice === "4") return openListing(false);
  if (choice === "5") {
    if (readStoredToken()) return logout(false);
    await login(false);
    return menu();
  }
  return submit(false);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);
  const json = Boolean(flags.json);
  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }
  if (flags.version) {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }

  try {
    if (!command) return menu();
    if (command === "login") {
      await login(json);
      if (!json) return menu();
      return;
    }
    if (command === "logout") return logout(json);
    if (command === "submit") return submit(json, Boolean(flags.force));
    if (command === "update") return update(json);
    if (command === "status") return status(json);
    if (command === "open") return openListing(json);
    fail(`Unknown command: ${command}`, json);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Something went wrong.", json);
  }
}

void main();
