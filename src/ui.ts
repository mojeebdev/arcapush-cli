// Copyright 2026 BlindspotLab Limited
// SPDX-License-Identifier: Apache-2.0
import { emitKeypressEvents, type Key } from "node:readline";
import { CLI_VERSION } from "./lib.js";
import type { ListingType } from "./submissions.js";

const glyphs: Record<string, string[]> = {
  A: ["01110", "10001", "11111", "10001", "10001"],
  R: ["11110", "10001", "11110", "10010", "10001"],
  C: ["01111", "10000", "10000", "10000", "01111"],
  P: ["11110", "10001", "11110", "10000", "10000"],
  U: ["10001", "10001", "10001", "10001", "01110"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  H: ["10001", "10001", "11111", "10001", "10001"],
};
const compactGlyphs: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  R: ["110", "101", "110", "101", "101"],
  C: ["011", "100", "100", "100", "011"],
  P: ["110", "101", "110", "100", "100"],
  U: ["101", "101", "101", "101", "111"],
  S: ["011", "100", "010", "001", "110"],
  H: ["101", "101", "111", "101", "101"],
};

export function wordmark(width = 80, ascii = false): string {
  const font = width >= 47 ? glyphs : compactGlyphs;
  if (width < 15) return "ARCAPUSH".slice(0, Math.max(1, width));
  const words = width >= 31 ? ["ARCAPUSH"] : ["ARCA", "PUSH"];
  return words.map(word => Array.from({ length: 5 }, (_, row) =>
    [...word].map(letter => font[letter][row].replace(/1/g, ascii ? "#" : "█").replace(/0/g, " ")).join(" ")
  ).join("\n")).join("\n\n");
}

export interface ScreenOptions { width?: number; height?: number; color?: boolean; ascii?: boolean }
function options(input: ScreenOptions = {}) {
  return {
    width: Math.max(1, input.width ?? process.stdout.columns ?? 80),
    color: input.color ?? Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb"),
    ascii: input.ascii ?? process.env.TERM === "dumb",
  };
}
function paint(text: string, color: boolean, code = "95"): string {
  return color ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export function terminalText(value: unknown): string {
  // Prevent metadata, filenames, or API responses from injecting terminal escapes.
  return String(value ?? "").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
export function wrapText(value: string, width: number): string {
  const size = Math.max(1, width);
  return terminalText(value).split("\n").flatMap(line => {
    const lines: string[] = [];
    while (line.length > size) {
      const space = line.lastIndexOf(" ", size);
      const cut = space > 0 ? space : size;
      lines.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    return [...lines, line];
  }).join("\n");
}

function header(input: ScreenOptions = {}): string {
  const { width, color, ascii } = options(input);
  return [
    paint(wordmark(width, ascii), color),
    "",
    paint(wrapText("Good products deserve to be discovered.", width), color),
    paint(wrapText("CLI + MCP  ·  Products / AI agents / Hackathon builds".replace("·", ascii ? "|" : "·"), width), color, "90"),
  ].join("\n");
}

export function banner(ascii = false): void {
  process.stdout.write(`\n${header({ ascii: ascii || process.env.TERM === "dumb" })}\n\n`);
}

const stages = ["Connect your Arcapush account", "Choose what you are shipping", "Add details and media", "Review and submit"];
const listingTypes = ["product", "agent", "hackathon"] as const;
const listingLabels = ["Product", "AI agent", "Hackathon build"];

export function onboardingScreen(stage: 1 | 2 | 3 | 4, selected?: ListingType, input: ScreenOptions = {}): string {
  const { width, color, ascii } = options(input);
  const rows = stages.map((label, index) => {
    const active = index + 1 === stage;
    const prefix = `${active ? (ascii ? ">" : "›") : " "}  0${index + 1}  `;
    const wrapped = wrapText(label, Math.max(1, width - prefix.length)).split("\n");
    return wrapped.map((part, i) =>
      paint(i ? " ".repeat(prefix.length) : prefix, color, active ? "95" : "90") + paint(part, color, active ? "97" : "90")
    ).join("\n");
  });
  const body = [header({ width, color, ascii }), "", ...rows, ""];
  if (selected) {
    const choices = listingLabels.map((label, i) => `${ascii ? (listingTypes[i] === selected ? "(*)" : "( )") : (listingTypes[i] === selected ? "◉" : "○")} ${label}`);
    const horizontal = choices.join("    ").length <= width;
    body.push(choices.map((label, i) => paint(label, color, listingTypes[i] === selected ? "95" : "90")).join(horizontal ? "    " : "\n"), "");
  }
  body.push(paint((ascii ? "-" : "─").repeat(Math.min(width, 88)), color, "90"));
  body.push(wrapText("Using an AI agent? Run arcapush mcp", width));
  body.push(paint(wrapText("Review your submission before anything is sent.", width), color, "90"));
  body.push(paint(wrapText(`v${CLI_VERSION}  |  arcapush --help for all commands`, width), color, "90"));
  const lines = body.join("\n").split("\n");
  const height = input.height ?? process.stdout.rows ?? 40;
  // Keep the logo visible when a short terminal would otherwise scroll it away.
  if (lines.length + 2 > height) return lines.filter(line => line.trim()).join("\n") + "\n";
  return lines.join("\n") + "\n\n";
}

export function showOnboarding(stage: 1 | 2 | 3 | 4, selected?: ListingType, ascii = false, reservedRows = 0): void {
  if (process.stdout.isTTY && process.env.TERM !== "dumb") process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write(onboardingScreen(stage, selected, { ascii: ascii || process.env.TERM === "dumb", height: (process.stdout.rows ?? 40) - reservedRows }));
}

export class OnboardingCancelled extends Error {
  constructor() { super("Cancelled. Nothing was submitted."); }
}

export async function chooseListingType(ascii = false): Promise<ListingType> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Choosing a listing type needs a terminal.");
  // A dumb terminal has no cursor movement; retain an accessible line-input path.
  if (process.env.TERM === "dumb") {
    const { ask } = await import("./lib.js");
    showOnboarding(2, "product", true);
    while (true) {
      const answer = await ask("Product (1), AI agent (2), Hackathon build (3)", "1");
      if (["1", "2", "3"].includes(answer)) return listingTypes[Number(answer) - 1];
      process.stdout.write("Choose 1, 2 or 3.\n");
    }
  }
  return new Promise((resolve, reject) => {
    let selected = 0;
    const wasRaw = Boolean(stdin.isRaw);
    const draw = () => {
      const hint = wrapText("Arrow keys to choose · Enter to continue · Esc to cancel".replaceAll("·", ascii ? "|" : "·"), stdout.columns ?? 80);
      showOnboarding(2, listingTypes[selected], ascii, hint.split("\n").length + 1);
      stdout.write(hint + "\n");
    };
    const cleanup = () => {
      stdin.off("keypress", onKey);
      stdin.off("end", onEnd);
      stdout.off("resize", draw);
      process.off("SIGTERM", onEnd);
      process.off("SIGINT", onEnd);
      process.off("SIGHUP", onEnd);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\x1b[?25h");
    };
    const onEnd = () => { cleanup(); reject(new OnboardingCancelled()); };
    const onKey = (_text: string, key: Key) => {
      if (!key) return;
      if (key.name === "escape" || (key.ctrl && ["c", "d"].includes(key.name || ""))) return onEnd();
      if (key.name === "return") { cleanup(); resolve(listingTypes[selected]); return; }
      if (["right", "down", "tab"].includes(key.name || "")) selected = (selected + (key.shift ? 2 : 1)) % 3;
      else if (["left", "up"].includes(key.name || "")) selected = (selected + 2) % 3;
      else if (["1", "2", "3"].includes(key.name || "")) selected = Number(key.name) - 1;
      else return;
      draw();
    };
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("keypress", onKey);
    stdin.once("end", onEnd);
    stdout.on("resize", draw);
    process.once("SIGTERM", onEnd);
    process.once("SIGINT", onEnd);
    process.once("SIGHUP", onEnd);
    stdout.write("\x1b[?25l");
    draw();
  });
}
