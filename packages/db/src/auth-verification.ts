import { createHmac, timingSafeEqual } from "node:crypto";

import { getPrismaClient } from "./client.js";
import type {
  AuthVerificationChannel,
  AuthVerificationCodeRecord,
  AuthVerificationPurpose,
  DatabaseClient,
} from "./types.js";

type VerificationIdentity = {
  readonly channel: AuthVerificationChannel;
  readonly purpose: AuthVerificationPurpose;
  readonly target: string;
};

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireAuthVerificationCodeDelegate(client: DatabaseClient) {
  if (!client.authVerificationCode) {
    throw new Error("Database client is missing the authVerificationCode delegate.");
  }

  return client.authVerificationCode;
}

function normalizeRecord(record: AuthVerificationCodeRecord): AuthVerificationCodeRecord {
  return {
    id: record.id,
    channel: record.channel,
    purpose: record.purpose,
    target: record.target,
    codeHash: record.codeHash,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt ?? null,
    attemptCount: record.attemptCount,
    ipAddress: record.ipAddress ?? null,
    userAgent: record.userAgent ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function resolveVerificationCodeSecret(
  input: {
    readonly secret?: string;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): string {
  const secret =
    input.secret ??
    input.env?.VERIFICATION_CODE_SECRET ??
    input.env?.JWT_SECRET ??
    process.env.VERIFICATION_CODE_SECRET ??
    process.env.JWT_SECRET ??
    "";

  if (secret.length < 32) {
    throw new Error("VERIFICATION_CODE_SECRET or JWT_SECRET must be at least 32 characters.");
  }

  return secret;
}

export function hashAuthVerificationCode(
  input: VerificationIdentity & {
    readonly code: string;
    readonly secret?: string;
    readonly env?: NodeJS.ProcessEnv;
  },
): string {
  const secret = resolveVerificationCodeSecret(input);
  return createHmac("sha256", secret)
    .update(input.channel)
    .update(":")
    .update(input.purpose)
    .update(":")
    .update(input.target)
    .update(":")
    .update(input.code)
    .digest("hex");
}

export function verifyAuthVerificationCode(
  record: AuthVerificationCodeRecord,
  input: {
    readonly code: string;
    readonly secret?: string;
    readonly env?: NodeJS.ProcessEnv;
  },
): boolean {
  const expectedHash = hashAuthVerificationCode({
    channel: record.channel,
    purpose: record.purpose,
    target: record.target,
    code: input.code,
    secret: input.secret,
    env: input.env,
  });
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(record.codeHash, "hex");

  return (
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export async function createAuthVerificationCode(
  input: VerificationIdentity & {
    readonly code: string;
    readonly expiresAt: Date;
    readonly ipAddress?: string | null;
    readonly userAgent?: string | null;
    readonly secret?: string;
    readonly env?: NodeJS.ProcessEnv;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthVerificationCodeRecord> {
  const client = await resolveClient(options.client);
  const record = await requireAuthVerificationCodeDelegate(client).create({
    data: {
      channel: input.channel,
      purpose: input.purpose,
      target: input.target,
      codeHash: hashAuthVerificationCode(input),
      expiresAt: input.expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return normalizeRecord(record);
}

export async function findLatestActiveAuthVerificationCode(
  input: VerificationIdentity & {
    readonly now?: Date;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthVerificationCodeRecord | null> {
  const client = await resolveClient(options.client);
  const record = await requireAuthVerificationCodeDelegate(client).findFirst({
    where: {
      channel: input.channel,
      purpose: input.purpose,
      target: input.target,
      consumedAt: null,
      expiresAt: {
        gt: input.now ?? new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return record ? normalizeRecord(record) : null;
}

export async function consumeAuthVerificationCode(
  input: {
    readonly id: string;
    readonly now?: Date;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<boolean> {
  const now = input.now ?? new Date();
  const client = await resolveClient(options.client);
  const result = await requireAuthVerificationCodeDelegate(client).updateMany({
    where: {
      id: input.id,
      consumedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      consumedAt: now,
    },
  });

  return result.count === 1;
}

export async function incrementAuthVerificationAttempt(
  input: {
    readonly id: string;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthVerificationCodeRecord> {
  const client = await resolveClient(options.client);
  const record = await requireAuthVerificationCodeDelegate(client).update({
    where: {
      id: input.id,
    },
    data: {
      attemptCount: {
        increment: 1,
      },
    },
  });

  return normalizeRecord(record);
}

export async function pruneExpiredAuthVerificationCodes(
  input: {
    readonly now?: Date;
  } = {},
  options: { readonly client?: DatabaseClient } = {},
): Promise<number> {
  const client = await resolveClient(options.client);
  const delegate = requireAuthVerificationCodeDelegate(client);
  if (!delegate.deleteMany) {
    return 0;
  }

  const result = await delegate.deleteMany({
    where: {
      expiresAt: {
        lt: input.now ?? new Date(),
      },
    },
  });

  return result.count;
}
