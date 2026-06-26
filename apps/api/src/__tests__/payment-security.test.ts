import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  alipayCanonicalString,
  alipayRequestSignContent,
  assertPrivateKeyPem,
  assertPublicKeyPem,
  normalizePrivateKeyPem,
  normalizePublicKeyPem,
  rsaSha256Sign,
  rsaSha256Verify,
} from "../payment-security.js";
import { decodeAlipayText, encodeAlipayText, normalizeAlipayCharset } from "../alipay-encoding.js";

type PemPair = {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
};

function createPemPair(): PemPair {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function stripPemEnvelope(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

describe("payment security key normalization", () => {
  it("normalizes Alipay charset defaults and preserves explicit UTF-8", () => {
    expect(normalizeAlipayCharset(undefined)).toBe("GBK");
    expect(normalizeAlipayCharset("")).toBe("GBK");
    expect(normalizeAlipayCharset("utf-8")).toBe("UTF-8");
    expect(normalizeAlipayCharset("GBK")).toBe("GBK");
    expect(normalizeAlipayCharset("invalid")).toBe("GBK");
  });

  it("encodes readable Chinese Alipay text with GBK without unicode escaping", () => {
    const text = "月卡";
    const gbkBytes = encodeAlipayText(text, "GBK");

    expect(Buffer.from(gbkBytes).toString("hex")).toBe("d4c2bfa8");
    expect(decodeAlipayText(gbkBytes, "GBK")).toBe(text);
    expect(text).not.toContain("\\u");
  });

  it("builds Alipay request sign content with sign_type and ASCII ordering", () => {
    const params = new Map<string, string>([
      ["b", "2"],
      ["sign", "already-signed"],
      ["sign_type", "RSA2"],
      ["A", "1"],
      ["_", "underscore"],
      ["empty", ""],
    ]);

    expect(alipayRequestSignContent(params)).toBe("A=1&_=underscore&b=2&sign_type=RSA2");
  });

  it("keeps Alipay callback verify content excluding sign and sign_type", () => {
    const params = new Map<string, string>([
      ["trade_status", "TRADE_SUCCESS"],
      ["sign_type", "RSA2"],
      ["sign", "callback-signature"],
      ["app_id", "alipay-app-id"],
      ["out_trade_no", "order-1"],
    ]);

    expect(alipayCanonicalString(params)).toBe(
      "app_id=alipay-app-id&out_trade_no=order-1&trade_status=TRADE_SUCCESS",
    );
  });

  it("validates bare Base64 Alipay key-tool private and public keys", () => {
    const pair = createPemPair();
    const barePrivateKey = stripPemEnvelope(pair.privateKeyPem);
    const barePublicKey = stripPemEnvelope(pair.publicKeyPem);

    expect(assertPrivateKeyPem(barePrivateKey)).toBe(true);
    expect(assertPublicKeyPem(barePublicKey)).toBe(true);
    expect(normalizePrivateKeyPem(barePrivateKey)).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(normalizePublicKeyPem(barePublicKey)).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
  });

  it("keeps PEM private and public keys valid", () => {
    const pair = createPemPair();

    expect(assertPrivateKeyPem(pair.privateKeyPem)).toBe(true);
    expect(assertPublicKeyPem(pair.publicKeyPem)).toBe(true);
    expect(normalizePrivateKeyPem(pair.privateKeyPem)).toBe(pair.privateKeyPem.trim());
    expect(normalizePublicKeyPem(pair.publicKeyPem)).toBe(pair.publicKeyPem.trim());
  });

  it("validates escaped-newline PEM keys", () => {
    const pair = createPemPair();

    expect(assertPrivateKeyPem(pair.privateKeyPem.replace(/\n/g, "\\n"))).toBe(true);
    expect(assertPublicKeyPem(pair.publicKeyPem.replace(/\n/g, "\\n"))).toBe(true);
  });

  it("fails malformed keys without returning key material", () => {
    expect(assertPrivateKeyPem("")).toBe(false);
    expect(assertPublicKeyPem("")).toBe(false);
    expect(() => assertPrivateKeyPem("not-a-private-key")).toThrow();
    expect(() => assertPublicKeyPem("not-a-public-key")).toThrow();
  });

  it("signs and verifies with normalized bare Base64 keys", () => {
    const pair = createPemPair();
    const message = "app_id=alipay-app-id&out_trade_no=order-1";
    const signature = rsaSha256Sign(message, stripPemEnvelope(pair.privateKeyPem));

    expect(rsaSha256Verify(message, signature, stripPemEnvelope(pair.publicKeyPem))).toBe(true);
    expect(
      rsaSha256Verify(`${message}&tampered=1`, signature, stripPemEnvelope(pair.publicKeyPem)),
    ).toBe(false);
  });

  it("signs Chinese Alipay content with the selected charset bytes", () => {
    const pair = createPemPair();
    const message = 'biz_content={"subject":"月卡"}&charset=GBK&sign_type=RSA2';
    const gbkSignature = rsaSha256Sign(message, pair.privateKeyPem, "GBK");
    const utf8Signature = rsaSha256Sign(message, pair.privateKeyPem, "UTF-8");

    expect(gbkSignature).not.toBe(utf8Signature);
    expect(rsaSha256Verify(message, gbkSignature, pair.publicKeyPem, "GBK")).toBe(true);
    expect(rsaSha256Verify(message, gbkSignature, pair.publicKeyPem, "UTF-8")).toBe(false);
  });
});
