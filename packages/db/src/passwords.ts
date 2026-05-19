import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs") as {
  readonly hash: (password: string, salt: string | number) => Promise<string>;
  readonly compare: (password: string, passwordHash: string) => Promise<boolean>;
};

export const minimumAdminPasswordLength = 12;

export function validateAdminPassword(password: string): void {
  if (password.length < minimumAdminPasswordLength) {
    throw new Error(`Admin password must be at least ${minimumAdminPasswordLength} characters.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  validateAdminPassword(password);
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (!password || !passwordHash) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}
