import iconv from "iconv-lite";

export const alipayCharsets = ["UTF-8", "GBK"] as const;

export type AlipayCharset = (typeof alipayCharsets)[number];

export function normalizeAlipayCharset(value: unknown): AlipayCharset {
  if (typeof value !== "string") {
    return "GBK";
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "UTF-8" || normalized === "UTF8") {
    return "UTF-8";
  }
  if (normalized === "GBK" || normalized === "GB2312") {
    return "GBK";
  }

  return "GBK";
}

export function encodeAlipayText(value: string, charset: AlipayCharset): Uint8Array {
  if (charset === "GBK") {
    return new Uint8Array(iconv.encode(value, "gbk"));
  }

  return new Uint8Array(Buffer.from(value, "utf8"));
}

export function decodeAlipayText(value: Uint8Array, charset: AlipayCharset): string {
  if (charset === "GBK") {
    return iconv.decode(Buffer.from(value), "gbk");
  }

  return Buffer.from(value).toString("utf8");
}

export function parseAlipayFormUrlEncodedBody(input: {
  readonly rawBody: string;
  readonly rawBodyBytes?: Uint8Array;
  readonly headers?: Record<string, string | undefined>;
  readonly fallbackCharset?: unknown;
}): { readonly params: Map<string, string>; readonly charset: AlipayCharset } {
  const rawPairs = parseRawFormPairs(rawFormBody(input));
  const charset = detectAlipayFormCharset(rawPairs, input.headers, input.fallbackCharset);
  const params = new Map<string, string>();

  for (const pair of rawPairs) {
    const key = decodeAlipayFormComponent(pair.rawKey, "UTF-8");
    if (!key) {
      continue;
    }
    params.set(key, decodeAlipayFormComponent(pair.rawValue, charset));
  }

  return { params, charset };
}

function rawFormBody(input: { readonly rawBody: string; readonly rawBodyBytes?: Uint8Array }) {
  if (input.rawBodyBytes?.byteLength) {
    return Buffer.from(input.rawBodyBytes).toString("latin1");
  }

  return input.rawBody;
}

function parseRawFormPairs(
  rawForm: string,
): Array<{ readonly rawKey: string; readonly rawValue: string }> {
  return rawForm
    .split("&")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const separatorIndex = segment.indexOf("=");
      if (separatorIndex === -1) {
        return { rawKey: segment, rawValue: "" };
      }

      return {
        rawKey: segment.slice(0, separatorIndex),
        rawValue: segment.slice(separatorIndex + 1),
      };
    });
}

function detectAlipayFormCharset(
  rawPairs: Array<{ readonly rawKey: string; readonly rawValue: string }>,
  headers: Record<string, string | undefined> | undefined,
  fallbackCharset: unknown,
): AlipayCharset {
  for (const pair of rawPairs) {
    const key = decodeAlipayFormComponent(pair.rawKey, "UTF-8");
    if (key !== "charset") {
      continue;
    }

    const explicit = parseExplicitAlipayCharset(
      Buffer.from(decodeFormComponentBytes(pair.rawValue)).toString("ascii"),
    );
    if (explicit) {
      return explicit;
    }
  }

  return getAlipayHeaderCharset(headers) ?? normalizeAlipayCharset(fallbackCharset);
}

function getAlipayHeaderCharset(
  headers: Record<string, string | undefined> | undefined,
): AlipayCharset | null {
  const contentType = headers?.["content-type"];
  const charset = contentType?.match(/(?:^|;)\s*charset=([^;]+)/i)?.[1];
  return parseExplicitAlipayCharset(charset);
}

function parseExplicitAlipayCharset(value: unknown): AlipayCharset | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^"|"$/g, "").toUpperCase();
  if (normalized === "UTF-8" || normalized === "UTF8") {
    return "UTF-8";
  }
  if (normalized === "GBK" || normalized === "GB2312") {
    return "GBK";
  }

  return null;
}

function decodeAlipayFormComponent(value: string, charset: AlipayCharset): string {
  return decodeAlipayText(decodeFormComponentBytes(value), charset);
}

function decodeFormComponentBytes(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char === "+") {
      bytes.push(0x20);
      continue;
    }

    if (char === "%" && index + 2 < value.length) {
      const hex = value.slice(index + 1, index + 3);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }

    bytes.push(char.charCodeAt(0) & 0xff);
  }

  return new Uint8Array(bytes);
}
