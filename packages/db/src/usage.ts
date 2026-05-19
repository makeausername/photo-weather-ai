import { assertProviderType } from "./constants.js";
import { getPrismaClient } from "./client.js";
import type { ApiUsageLogInput, DatabaseClient } from "./types.js";

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

export async function createApiUsageLog(
  input: ApiUsageLogInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<unknown> {
  assertProviderType(input.providerType);
  const client = await resolveClient(options.client);

  return client.apiUsageLog.create({
    data: {
      providerType: input.providerType,
      providerCode: input.providerCode,
      operation: input.operation,
      requestId: input.requestId ?? null,
      success: input.success,
      statusCode: input.statusCode ?? null,
      latencyMs: input.latencyMs ?? null,
      estimatedCost: input.estimatedCost ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });
}
