export type MaskSecretOptions = {
  readonly visibleStart?: number;
  readonly visibleEnd?: number;
  readonly maskLength?: number;
};

export function maskSecret(
  value: string | null | undefined,
  options: MaskSecretOptions = {},
): string {
  if (!value) {
    return "";
  }

  const visibleStart = options.visibleStart ?? 4;
  const visibleEnd = options.visibleEnd ?? 4;
  const maskLength = options.maskLength ?? 8;

  if (value.length <= visibleStart + visibleEnd) {
    return "*".repeat(Math.max(4, Math.min(maskLength, 12)));
  }

  return `${value.slice(0, visibleStart)}${"*".repeat(maskLength)}${value.slice(
    value.length - visibleEnd,
  )}`;
}
