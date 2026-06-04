import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs") as {
  readonly hash: (password: string, salt: string | number) => Promise<string>;
  readonly compare: (password: string, passwordHash: string) => Promise<boolean>;
};

export const minimumAdminPasswordLength = 12;
export const minimumUserPasswordLength = 8;

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))) {
      return true;
    }
  }

  return false;
}

export function validateAdminPassword(password: string): void {
  if (!password) {
    throw new Error("管理员密码不能为空。");
  }

  if (containsControlCharacter(password)) {
    throw new Error("管理员密码不能包含换行或控制字符。");
  }

  const characterCount = Array.from(password).length;
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/u.test(password);

  if (
    characterCount < minimumAdminPasswordLength ||
    !hasLowercase ||
    !hasUppercase ||
    !hasDigit ||
    !hasSpecial
  ) {
    throw new Error(
      "管理员密码至少 12 位，需包含大小写字母、数字和特殊字符；支持常见强密码符号。",
    );
  }
}

export function validateUserPassword(password: string): void {
  if (password.length < minimumUserPasswordLength) {
    throw new Error(`User password must be at least ${minimumUserPasswordLength} characters.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  validateAdminPassword(password);
  return bcrypt.hash(password, 12);
}

export async function hashUserPassword(password: string): Promise<string> {
  validateUserPassword(password);
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (!password || !passwordHash) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}
