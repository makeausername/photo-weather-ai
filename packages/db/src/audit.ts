import { getPrismaClient } from "./client.js";
import { buildAuditLogDisplay } from "./audit-display.js";
import { isPlainJsonObject } from "./json.js";
import { maskSecretValue } from "./secrets.js";
import type {
  AdminAuditLogInput,
  AdminAuditLogRecord,
  DatabaseClient,
  JsonValue,
} from "./types.js";

const SENSITIVE_AUDIT_KEY_PATTERN =
  /(api[_-]?key|access[_-]?key|authorization|credential|database[_-]?url|password|private[_-]?key|secret|token)/i;

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

export function sanitizeAuditJson(value: JsonValue | null | undefined): JsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  return sanitizeAuditValue(value);
}

function sanitizeAuditValue(value: JsonValue, key?: string): JsonValue {
  if (key && SENSITIVE_AUDIT_KEY_PATTERN.test(key)) {
    return maskSecretValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (isPlainJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeAuditValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

export async function createAuditLog(
  input: AdminAuditLogInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<unknown> {
  const client = await resolveClient(options.client);

  return client.adminAuditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      beforeJson: sanitizeAuditJson(input.beforeJson),
      afterJson: sanitizeAuditJson(input.afterJson),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

function normalizeAuditLog(record: any): AdminAuditLogRecord {
  const display = buildAuditLogDisplay({
    actorUserId: record.actorUserId ?? null,
    actor: record.actor ?? null,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId ?? null,
    beforeJson: record.beforeJson ?? null,
    afterJson: record.afterJson ?? null,
  });

  return {
    id: record.id,
    actorUserId: record.actorUserId ?? null,
    actorDisplayName: display.actorDisplayName,
    actorEmailMasked: display.actorEmailMasked,
    actorPhoneMasked: display.actorPhoneMasked,
    actorLabel: display.actorLabel,
    action: record.action,
    actionLabel: display.actionLabel,
    targetType: record.targetType,
    targetId: record.targetId ?? null,
    targetLabel: display.targetLabel,
    targetSummary: display.targetSummary,
    technicalActorUserId: display.technicalActorUserId,
    technicalTargetId: display.technicalTargetId,
    beforeJson: record.beforeJson ?? null,
    afterJson: record.afterJson ?? null,
    ipAddress: record.ipAddress ?? null,
    userAgent: record.userAgent ?? null,
    createdAt: record.createdAt,
  };
}

export async function listAuditLogs(
  options: { readonly limit?: number; readonly client?: DatabaseClient } = {},
): Promise<AdminAuditLogRecord[]> {
  const client = await resolveClient(options.client);
  const take = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const records = await client.adminAuditLog.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: { actor: true },
  });

  return records.map((record) => normalizeAuditLog(record));
}
