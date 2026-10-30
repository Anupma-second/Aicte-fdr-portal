import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const block = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((match) => [match[1], match[2]]));
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Text on background, at the WCAG AA 4.5:1 level for normal text. */
const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["accent-foreground", "background"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-muted", "sidebar"],
  ["status-green", "status-green-bg"],
  ["status-amber", "status-amber-bg"],
  ["status-red", "status-red-bg"],
  ["status-blue", "status-blue-bg"],
  ["status-grey", "status-grey-bg"],
  ["status-green", "card"],
  ["status-amber", "card"],
  ["status-red", "card"],
  ["status-grey", "card"],
  ["status-blue", "card"],
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme contrast", (_name, selector) => {
  const theme = tokens(selector);

  it.each(TEXT_PAIRS)("%s on %s is readable", (text, background) => {
    expect(theme[text], `missing token ${text}`).toBeDefined();
    expect(theme[background], `missing token ${background}`).toBeDefined();
    expect(contrast(theme[text], theme[background])).toBeGreaterThanOrEqual(4.5);
  });

  it("white sidebar text on the active item is readable", () => {
    expect(contrast("#ffffff", theme["sidebar-active"])).toBeGreaterThanOrEqual(4.5);
  });

  it("navy text on the gold button is readable", () => {
    expect(contrast(theme.navy, theme.gold)).toBeGreaterThanOrEqual(4.5);
  });
});
