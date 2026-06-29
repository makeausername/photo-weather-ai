"use client";

import { useEffect, useRef } from "react";
import type { BillingCheckoutPayload } from "./account-session";
import { Button, cn } from "./ui";

type CheckoutPayloadViewProps = {
  readonly checkout: BillingCheckoutPayload;
  readonly autoRedirect?: boolean;
  readonly autoSubmit?: boolean;
  readonly className?: string;
};

const qrVersionConfigs = [
  { version: 1, size: 21, dataCodewords: 19, eccCodewords: 7, blocks: [19] },
  { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, blocks: [34] },
  { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, blocks: [55] },
  { version: 4, size: 33, dataCodewords: 80, eccCodewords: 20, blocks: [80] },
  { version: 5, size: 37, dataCodewords: 108, eccCodewords: 26, blocks: [108] },
  { version: 6, size: 41, dataCodewords: 136, eccCodewords: 18, blocks: [68, 68] },
] as const;

const qrAlignmentPatternPositions: Record<number, readonly number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

function appendBits(target: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    target.push((value >>> index) & 1);
  }
}

function gfMultiply(left: number, right: number): number {
  let x = left;
  let y = right;
  let result = 0;
  while (y > 0) {
    if ((y & 1) !== 0) {
      result ^= x;
    }
    x = (x << 1) ^ ((x >>> 7) * 0x11d);
    y >>>= 1;
  }
  return result & 0xff;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let coefficient = 0; coefficient < degree; coefficient += 1) {
      result[coefficient] = gfMultiply(result[coefficient] ?? 0, root);
      if (coefficient + 1 < degree) {
        result[coefficient] ^= result[coefficient + 1] ?? 0;
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const divisor = reedSolomonDivisor(degree);
  const result = Array<number>(degree).fill(0);
  for (const value of data) {
    const factor = value ^ (result.shift() ?? 0);
    result.push(0);
    for (let index = 0; index < divisor.length; index += 1) {
      result[index] = (result[index] ?? 0) ^ gfMultiply(divisor[index] ?? 0, factor);
    }
  }
  return result;
}

function createQrCodewords(value: string): {
  readonly codewords: readonly number[];
  readonly size: number;
  readonly version: number;
} {
  const bytes = Array.from(new TextEncoder().encode(value));
  const config = qrVersionConfigs.find(
    (candidate) => 4 + 8 + bytes.length * 8 <= candidate.dataCodewords * 8,
  );
  if (!config) {
    throw new Error("QR payload is too long for the built-in renderer.");
  }

  const bits: number[] = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const capacityBits = config.dataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    dataCodewords.push(Number.parseInt(bits.slice(index, index + 8).join(""), 2));
  }
  for (let padIndex = 0; dataCodewords.length < config.dataCodewords; padIndex += 1) {
    dataCodewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  const blocks = config.blocks.map((blockSize, blockIndex) => {
    const offset = config.blocks.slice(0, blockIndex).reduce((sum, size) => sum + size, 0);
    const data = dataCodewords.slice(offset, offset + blockSize);
    return { data, ecc: reedSolomonRemainder(data, config.eccCodewords) };
  });
  const codewords: number[] = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let index = 0; index < maxDataLength; index += 1) {
    for (const block of blocks) {
      if (index < block.data.length) {
        codewords.push(block.data[index] ?? 0);
      }
    }
  }
  for (let index = 0; index < config.eccCodewords; index += 1) {
    for (const block of blocks) {
      codewords.push(block.ecc[index] ?? 0);
    }
  }

  return { codewords, size: config.size, version: config.version };
}

function createQrMatrix(value: string): boolean[][] {
  const { codewords, size, version } = createQrCodewords(value);
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const isFunction = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  function setFunctionModule(x: number, y: number, dark: boolean) {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      return;
    }
    modules[y]![x] = dark;
    isFunction[y]![x] = true;
  }

  function drawFinderPattern(centerX: number, centerY: number) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunctionModule(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
      }
    }
  }

  function drawAlignmentPattern(centerX: number, centerY: number) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        setFunctionModule(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function drawFormatBits(mask: number) {
    const data = (1 << 3) | mask;
    let remainder = data;
    for (let index = 0; index < 10; index += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    const bits = ((data << 10) | remainder) ^ 0x5412;
    const bit = (index: number) => ((bits >>> index) & 1) !== 0;

    for (let index = 0; index <= 5; index += 1) {
      setFunctionModule(8, index, bit(index));
    }
    setFunctionModule(8, 7, bit(6));
    setFunctionModule(8, 8, bit(7));
    setFunctionModule(7, 8, bit(8));
    for (let index = 9; index < 15; index += 1) {
      setFunctionModule(14 - index, 8, bit(index));
    }
    for (let index = 0; index < 8; index += 1) {
      setFunctionModule(size - 1 - index, 8, bit(index));
    }
    for (let index = 8; index < 15; index += 1) {
      setFunctionModule(8, size - 15 + index, bit(index));
    }
    setFunctionModule(8, size - 8, true);
  }

  drawFinderPattern(3, 3);
  drawFinderPattern(size - 4, 3);
  drawFinderPattern(3, size - 4);
  for (let index = 8; index < size - 8; index += 1) {
    const dark = index % 2 === 0;
    setFunctionModule(6, index, dark);
    setFunctionModule(index, 6, dark);
  }
  for (const y of qrAlignmentPatternPositions[version] ?? []) {
    for (const x of qrAlignmentPatternPositions[version] ?? []) {
      if (!isFunction[y]?.[x]) {
        drawAlignmentPattern(x, y);
      }
    }
  }
  drawFormatBits(0);

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (isFunction[y]?.[x]) {
          continue;
        }
        const codeword = codewords[Math.floor(bitIndex / 8)] ?? 0;
        modules[y]![x] =
          bitIndex < codewords.length * 8 && ((codeword >>> (7 - (bitIndex % 8))) & 1) !== 0;
        bitIndex += 1;
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isFunction[y]?.[x] && (x + y) % 2 === 0) {
        modules[y]![x] = !modules[y]![x];
      }
    }
  }
  drawFormatBits(0);

  return modules;
}

function createQrSvgDataUri(value: string): string {
  const matrix = createQrMatrix(value);
  const quietZone = 4;
  const dimension = matrix.length + quietZone * 2;
  const path = matrix
    .flatMap((row, y) =>
      row
        .map((dark, x) => (dark ? `M${x + quietZone} ${y + quietZone}h1v1h-1z` : ""))
        .filter(Boolean),
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${dimension}v${dimension}H0z"/><path fill="#111827" d="${path}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function WechatQrCodeImage({ codeUrl }: { readonly codeUrl: string }) {
  try {
    return (
      <img
        src={createQrSvgDataUri(codeUrl)}
        width={192}
        height={192}
        alt="微信支付二维码"
        data-qr-code-image="wechat-native"
        className="h-48 w-48 max-w-full rounded-md border border-border bg-white p-2"
      />
    );
  } catch {
    return (
      <p className="rounded-md border border-danger/40 bg-card px-3 py-2 text-xs leading-5 text-danger [overflow-wrap:anywhere]">
        二维码暂时无法生成，请使用下方支付链接。
      </p>
    );
  }
}

export function CheckoutPayloadView({
  checkout,
  autoRedirect = false,
  autoSubmit = false,
  className,
}: CheckoutPayloadViewProps) {
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!autoRedirect || checkout.kind !== "redirect_url") {
      return;
    }
    window.location.assign(checkout.redirectUrl);
  }, [autoRedirect, checkout]);

  useEffect(() => {
    if (!autoSubmit || checkout.kind !== "form_post") {
      return;
    }
    const timer = window.setTimeout(() => {
      formRef.current?.submit();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [autoSubmit, checkout]);

  if (checkout.kind === "qr_code") {
    return (
      <div className={cn("min-w-0 max-w-full rounded-lg border border-border bg-muted/30 p-4", className)}>
        <p className="text-sm font-bold text-card-foreground [overflow-wrap:anywhere]">请使用微信扫码支付</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          请使用微信扫码完成支付。支付完成后，会员权益自动生效。
        </p>
        <div className="mt-3 flex min-w-0 justify-center">
          <WechatQrCodeImage codeUrl={checkout.codeUrl} />
        </div>
        <details className="mt-3 min-w-0 rounded-md border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-card-foreground">
            查看支付链接
          </summary>
          <p className="mt-2 break-all">{checkout.codeUrl}</p>
        </details>
        {checkout.message ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{checkout.message}</p>
        ) : null}
        <p className="mt-3 rounded-md border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          当前为扫码模式，建议在电脑端打开，或返回选择支付宝。
        </p>
      </div>
    );
  }

  if (checkout.kind === "redirect_url") {
    return (
      <div className={cn("grid min-w-0 gap-2", className)}>
        {autoRedirect ? (
          <p className="text-sm font-semibold text-card-foreground [overflow-wrap:anywhere]">
            {checkout.message || "正在唤起支付..."}
          </p>
        ) : null}
        <a
          href={checkout.redirectUrl}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)] sm:w-fit"
        >
          继续完成支付
        </a>
        {checkout.message ? (
          <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{checkout.message}</p>
        ) : null}
      </div>
    );
  }

  if (checkout.kind === "form_post") {
    return (
      <form
        ref={formRef}
        action={checkout.actionUrl}
        method={checkout.method}
        acceptCharset={checkout.charset}
        className={cn("grid min-w-0 gap-2", className)}
      >
        {Object.entries(checkout.fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {autoSubmit ? (
          <p className="text-sm font-semibold text-card-foreground [overflow-wrap:anywhere]">正在跳转支付宝收银台...</p>
        ) : null}
        <Button type="submit" className="w-full">
          继续前往支付宝
        </Button>
        <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          支付页面已生成，请继续完成支付。支付完成后，会员权益自动生效。
        </p>
        {checkout.message ? (
          <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{checkout.message}</p>
        ) : null}
      </form>
    );
  }

  if (checkout.kind === "form_html") {
    return (
      <p
        className={cn(
          "rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]",
          className,
        )}
      >
        支付页面已生成，请按页面提示继续完成支付。
      </p>
    );
  }

  return (
    <p
      className={cn(
        "rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]",
        className,
      )}
    >
      {checkout.message}
    </p>
  );
}
