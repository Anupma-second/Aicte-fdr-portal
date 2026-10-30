function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function sameText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

/** Bank names are often abbreviated or suffixed, as in "HDFC Bank" and "HDFC Bank Ltd". */
export function sameBank(a: string, b: string): boolean {
  const first = normalizeText(a).replace(/(ltd|limited)$/, "");
  const second = normalizeText(b).replace(/(ltd|limited)$/, "");
  return first === second;
}

export function sameAmount(a: string | number | { toString(): string }, b: string | number | { toString(): string }): boolean {
  return Math.abs(Number(a.toString()) - Number(b.toString())) < 0.005;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
