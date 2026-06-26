import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertPrivateKeyPem,
  assertPublicKeyPem,
  normalizePrivateKeyPem,
  normalizePublicKeyPem,
  rsaSha256Sign,
  rsaSha256Verify,
} from "../payment-security.js";

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
});
