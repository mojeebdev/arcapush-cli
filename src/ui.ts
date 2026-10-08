// Copyright 2026 BlindspotLab Limited
// SPDX-License-Identifier: Apache-2.0
import { CLI_VERSION, apiBase } from "./lib.js";

const glyphs: Record<string, string[]> = {
  A: ["01110", "11011", "11011", "11111", "11011", "11011"],
  R: ["11110", "11011", "11110", "11100", "11010", "11011"],
  C: ["01111", "11000", "11000", "11000", "11000", "01111"],
  P: ["11110", "11011", "11011", "11110", "11000", "11000"],
  U: ["11011", "11011", "11011", "11011", "11011", "01110"],
  S: ["01111", "11000", "01110", "00011", "00011", "11110"],
  H: ["11011", "11011", "11111", "11011", "11011", "11011"],
};

export function wordmark(width = 80, ascii = false): string {
  if (width < 49) return "ARCAPUSH";
  return Array.from({ length: 6 }, (_, row) =>
    [..."ARCAPUSH"].map(letter => glyphs[letter][row].replace(/1/g, ascii ? "#" : "█").replace(/0/g, " ")).join(" ")
  ).join("\n");
}

export function banner(ascii = false): void {
  const color = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";
  const logo = wordmark(process.stdout.columns ?? 80, ascii || process.env.TERM === "dumb");
  process.stdout.write(`\n${color ? "\x1b[95m" : ""}${logo}${color ? "\x1b[0m" : ""}\n\n`);
  process.stdout.write(`Good products deserve to be discovered.\nCLI + MCP  |  v${CLI_VERSION}\n${apiBase()}\n\n`);
}

export function terminalText(value: unknown): string {
  // Prevent metadata, filenames, or API responses from injecting terminal escapes.
  return String(value ?? "").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
