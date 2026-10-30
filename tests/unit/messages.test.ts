import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

function placeholders(text: string): string[] {
  return (text.match(/\{\w+\}/g) ?? []).sort();
}

function lookup(source: unknown, path: string): string {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], source) as string;
}

describe("translations", () => {
  it("has the same keys in English and Hindi", () => {
    expect(keysOf(hi).sort()).toEqual(keysOf(en).sort());
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of keysOf(en)) {
      expect(placeholders(lookup(hi, key)), key).toEqual(placeholders(lookup(en, key)));
    }
  });
});
