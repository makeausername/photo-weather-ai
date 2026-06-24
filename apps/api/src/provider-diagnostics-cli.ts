import { pathToFileURL } from "node:url";
import { disconnectPrismaClient, getPrismaClient, type DatabaseClient } from "@photo-weather/db";
import {
  providerDiagnosticCodes,
  runProviderDiagnostic,
  type ProviderDiagnosticCode,
  type ProviderDiagnosticResult,
} from "./provider-diagnostics.js";

export type ProviderDiagnosticsCliOptions = {
  readonly providerCodes: readonly ProviderDiagnosticCode[];
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: typeof fetch;
};

export function parseProviderDiagnosticsArgs(argv: readonly string[]): readonly ProviderDiagnosticCode[] {
  let provider: string | undefined;
  let all = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      all = true;
      continue;
    }

    if (arg === "--provider") {
      provider = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg?.startsWith("--provider=")) {
      provider = arg.slice("--provider=".length);
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(usageText());
    }

    throw new Error(`未知参数：${arg}\n${usageText()}`);
  }

  if (all) {
    return providerDiagnosticCodes;
  }

  const matched = providerDiagnosticCodes.find((code) => code === provider);
  if (!matched) {
    throw new Error(`请使用 --provider 指定服务商，或使用 --all。\n${usageText()}`);
  }

  return [matched];
}

export async function runProviderDiagnostics(
  options: ProviderDiagnosticsCliOptions,
): Promise<readonly ProviderDiagnosticResult[]> {
  const env = options.env ?? process.env;
  const results: ProviderDiagnosticResult[] = [];
  for (const providerCode of options.providerCodes) {
    results.push(
      await runProviderDiagnostic({
        providerCode,
        dbClient: options.dbClient,
        env,
        fetcher: options.fetcher,
      }),
    );
  }

  return results;
}

export async function runProviderDiagnosticsCli(
  argv: readonly string[],
  output: (text: string) => void = console.log,
  errorOutput: (text: string) => void = console.error,
): Promise<number> {
  let dbClient: DatabaseClient | undefined;
  try {
    const providerCodes = parseProviderDiagnosticsArgs(argv);
    dbClient = (await getPrismaClient()) as unknown as DatabaseClient;
    const diagnostics = await runProviderDiagnostics({
      providerCodes,
      dbClient,
      env: process.env,
    });
    output(
      JSON.stringify(providerCodes.length === 1 ? diagnostics[0] : { diagnostics }, null, 2),
    );
    return 0;
  } catch (error) {
    errorOutput(error instanceof Error ? error.message : "服务商诊断命令执行失败。");
    return 1;
  } finally {
    if (dbClient) {
      await disconnectPrismaClient();
    }
  }
}

function usageText(): string {
  return [
    "用法：pnpm test-provider --provider meteoblue",
    "      pnpm test-provider --provider open_meteo",
    "      pnpm test-provider --provider qweather",
    "      pnpm test-provider --provider amap",
    "      pnpm test-provider --all",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runProviderDiagnosticsCli(process.argv.slice(2));
  process.exit(exitCode);
}
