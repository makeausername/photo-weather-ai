import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
} from "node:crypto";
import { encodeAlipayText, normalizeAlipayCharset } from "./alipay-encoding.js";

export function sanitizePaymentErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  const firstLine = raw.trim().split(/\r?\n/)[0]?.slice(0, 300) ?? "";
  if (!firstLine) {
    return fallback;
  }

  if (
    [
      /BEGIN [A-Z ]+KEY/,
      /apiV3Key/i,
      /appPrivateKey/i,
      /merchantPrivateKey/i,
      /platformCertificate/i,
      /alipayPublicKey/i,
      /authorization/i,
      /signature/i,
      /secretJson/i,
      /[A-Za-z]:[\\/]/,
      /\/(?:home|var|srv|app|tmp)\//,
      /\bat\s+\S+\s+\(/,
    ].some((pattern) => pattern.test(firstLine))
  ) {
    return fallback;
  }

  return firstLine
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(WECHATPAY2-SHA256-RSA2048\s+)[^,\s]+/gi, "$1[redacted]")
    .replace(/((?:key|token|secret|signature|authorization)=)[^&\s]+/gi, "$1[redacted]");
}

export function readStringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readBooleanField(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

export function readIntegerField(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function amountCentsToDecimalString(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error("Amount must be a non-negative integer number of cents.");
  }
  const yuan = Math.floor(amountCents / 100);
  const cents = String(amountCents % 100).padStart(2, "0");
  return `${yuan}.${cents}`;
}

export function decimalAmountToCents(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new Error("Invalid decimal money amount.");
  }
  const yuan = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(yuan) || !Number.isInteger(cents)) {
    throw new Error("Invalid decimal money amount.");
  }
  return yuan * 100 + cents;
}

export function createNonce(length = 16): string {
  return randomBytes(length).toString("hex");
}

export function normalizePemLineBreaks(value: string): string {
  return value
    .trim()
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function ensurePemBlock(value: string, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  const normalized = normalizePemLineBreaks(value);
  if (!normalized || normalized.includes("-----BEGIN")) {
    return normalized;
  }

  const body =
    normalized
      .replace(/\s+/g, "")
      .match(/.{1,64}/g)
      ?.join("\n") ?? "";
  if (!body) {
    return "";
  }
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

export function normalizePrivateKeyPem(value: string): string {
  return ensurePemBlock(value, "PRIVATE KEY");
}

export function normalizePublicKeyPem(value: string): string {
  return ensurePemBlock(value, "PUBLIC KEY");
}

function encodePaymentText(value: string, charset: string): Buffer {
  return Buffer.from(encodeAlipayText(value, normalizeAlipayCharset(charset)));
}

export function rsaSha256Sign(message: string, privateKeyPem: string, charset = "utf-8"): string {
  const signer = createSign("RSA-SHA256");
  signer.update(encodePaymentText(message, charset));
  signer.end();
  return signer.sign(createPrivateKey(normalizePrivateKeyPem(privateKeyPem)), "base64");
}

export function rsaSha256Verify(
  message: string,
  signatureBase64: string,
  publicKeyPem: string,
  charset = "utf-8",
): boolean {
  const verifier = createVerify("RSA-SHA256");
  verifier.update(encodePaymentText(message, charset));
  verifier.end();
  return verifier.verify(
    createPublicKey(normalizePublicKeyPem(publicKeyPem)),
    signatureBase64,
    "base64",
  );
}

export function assertPrivateKeyPem(value: string): boolean {
  const normalized = normalizePrivateKeyPem(value);
  if (!normalized) {
    return false;
  }
  createPrivateKey(normalized);
  return true;
}

export function assertPublicKeyPem(value: string): boolean {
  const normalized = normalizePublicKeyPem(value);
  if (!normalized) {
    return false;
  }
  createPublicKey(normalized);
  return true;
}

export function decryptWechatResource(input: {
  readonly apiV3Key: string;
  readonly nonce: string;
  readonly associatedData?: string;
  readonly ciphertext: string;
}): string {
  const key = Buffer.from(input.apiV3Key, "utf8");
  if (key.byteLength !== 32) {
    throw new Error("WeChat Pay API v3 key must be 32 bytes.");
  }

  const encrypted = Buffer.from(input.ciphertext, "base64");
  if (encrypted.byteLength <= 16) {
    throw new Error("WeChat Pay encrypted resource is invalid.");
  }

  const authTag = encrypted.subarray(encrypted.byteLength - 16);
  const ciphertext = encrypted.subarray(0, encrypted.byteLength - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.nonce, "utf8"));
  decipher.setAuthTag(authTag);
  if (input.associatedData) {
    decipher.setAAD(Buffer.from(input.associatedData, "utf8"));
  }
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptWechatResourceForFixture(input: {
  readonly apiV3Key: string;
  readonly nonce: string;
  readonly associatedData?: string;
  readonly plaintext: string;
}): string {
  const key = Buffer.from(input.apiV3Key, "utf8");
  const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(input.nonce, "utf8"));
  if (input.associatedData) {
    cipher.setAAD(Buffer.from(input.associatedData, "utf8"));
  }
  const encrypted = Buffer.concat([cipher.update(input.plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");
}

function compareAsciiKeys([left]: readonly [string, string], [right]: readonly [string, string]) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function alipaySortedContent(
  params: ReadonlyMap<string, string>,
  options: { readonly excludeSignType: boolean },
): string {
  return [...params.entries()]
    .filter(
      ([key, value]) =>
        key !== "sign" && (!options.excludeSignType || key !== "sign_type") && value.trim() !== "",
    )
    .sort(compareAsciiKeys)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function alipayRequestSignContent(params: ReadonlyMap<string, string>): string {
  return alipaySortedContent(params, { excludeSignType: false });
}

export function alipayCanonicalString(params: ReadonlyMap<string, string>): string {
  return alipaySortedContent(params, { excludeSignType: true });
}

export function parseFormUrlEncodedBody(rawBody: string): Map<string, string> {
  const params = new URLSearchParams(rawBody);
  const result = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    result.set(key, value);
  }
  return result;
}
