import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const COST = 12;

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Still runs a full compare for an unknown email, so timing doesn't reveal which accounts exist. */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (hash) return bcrypt.compare(password, hash);
  dummyHash ??= bcrypt.hash(randomBytes(32).toString("hex"), COST);
  await bcrypt.compare(password, await dummyHash);
  return false;
}
