export const invalidCredentialsMessage = "邮箱、手机号或密码不正确。";
export const loginServiceUnavailableMessage = "登录服务暂时不可用，请稍后重试或联系管理员。";

const unsafeAuthErrorPatterns: readonly RegExp[] = [
  /prisma/i,
  /database/i,
  /postgres/i,
  /Authentication failed against database server/i,
  /Invalid `prisma\./i,
  /findUnique\(/i,
  /Can't reach database server/i,
  /P1000/i,
  /P1001/i,
  /stack/i,
  /:\d+:\d+/,
  /[A-Z]:\\/,
  /\.ts:\d+/,
  /\bat\s+/,
];

export function sanitizeAuthErrorMessage(
  message: string | undefined,
  fallback = loginServiceUnavailableMessage,
): string {
  const trimmedMessage = message?.trim();
  if (!trimmedMessage) {
    return fallback;
  }

  if (unsafeAuthErrorPatterns.some((pattern) => pattern.test(trimmedMessage))) {
    return fallback;
  }

  return trimmedMessage;
}
