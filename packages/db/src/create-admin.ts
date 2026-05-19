import { disconnectPrismaClient, getPrismaClient } from "./client.js";
import { hashPassword, validateAdminPassword } from "./passwords.js";
import { safeUser } from "./auth.js";
import type { DatabaseClient, SafeUser } from "./types.js";

export type CreateAdminInput = {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string | null;
  readonly resetPassword?: boolean;
  readonly client?: DatabaseClient;
};

export type CreateAdminResult = {
  readonly user: SafeUser;
  readonly created: boolean;
  readonly passwordUpdated: boolean;
  readonly roleAssigned: boolean;
};

export type CreateAdminEnv = {
  readonly [key: string]: string | undefined;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly ADMIN_DISPLAY_NAME?: string;
  readonly ADMIN_RESET_PASSWORD?: string;
};

const adminEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireDelegate<TDelegate>(
  client: DatabaseClient,
  key: keyof DatabaseClient,
  label: string,
): TDelegate {
  const delegate = client[key];
  if (!delegate) {
    throw new Error(`Database client is missing the ${label} delegate.`);
  }

  return delegate as TDelegate;
}

function normalizeAdminEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  if (!adminEmailPattern.test(normalizedEmail)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  return normalizedEmail;
}

export function readCreateAdminEnv(source: CreateAdminEnv = process.env): CreateAdminInput {
  const email = source.ADMIN_EMAIL?.trim();
  const password = source.ADMIN_PASSWORD ?? "";

  if (!email) {
    throw new Error("ADMIN_EMAIL is required.");
  }

  if (!password) {
    throw new Error("ADMIN_PASSWORD is required.");
  }

  return {
    email,
    password,
    displayName: source.ADMIN_DISPLAY_NAME?.trim() || "Super Admin",
    resetPassword: source.ADMIN_RESET_PASSWORD === "true",
  };
}

export async function createOrUpdateSuperAdmin(
  input: CreateAdminInput,
): Promise<CreateAdminResult> {
  const email = normalizeAdminEmail(input.email);
  validateAdminPassword(input.password);

  const client = await resolveClient(input.client);
  const userDelegate = requireDelegate<NonNullable<DatabaseClient["user"]>>(client, "user", "user");
  const roleDelegate = requireDelegate<NonNullable<DatabaseClient["role"]>>(client, "role", "role");
  const userRoleDelegate = requireDelegate<NonNullable<DatabaseClient["userRole"]>>(
    client,
    "userRole",
    "userRole",
  );

  const superAdminRole = await roleDelegate.findUnique({
    where: { code: "super_admin" },
  });

  if (!superAdminRole) {
    throw new Error("Missing super_admin role. Run db:seed before create-admin.");
  }

  const existingUser = await userDelegate.findUnique({
    where: { email },
  });

  let user = existingUser;
  let created = false;
  let passwordUpdated = false;

  if (!existingUser) {
    user = await userDelegate.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName?.trim() || "Super Admin",
        status: "active",
      },
    });
    created = true;
    passwordUpdated = true;
  } else if (input.resetPassword) {
    user = await userDelegate.update({
      where: { id: existingUser.id },
      data: {
        passwordHash: await hashPassword(input.password),
      },
    });
    passwordUpdated = true;
  }

  await userRoleDelegate.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: superAdminRole.id,
      },
    },
    create: {
      userId: user.id,
      roleId: superAdminRole.id,
    },
    update: {},
  });

  return {
    user: safeUser(user),
    created,
    passwordUpdated,
    roleAssigned: true,
  };
}

export function formatCreateAdminResult(result: CreateAdminResult): readonly string[] {
  return [
    result.created ? "Created super admin user." : "Super admin user already exists.",
    result.passwordUpdated
      ? "Password hash is set."
      : "Password hash was not changed. Set ADMIN_RESET_PASSWORD=true to rotate it.",
    `Assigned super_admin role to ${result.user.email}.`,
  ];
}

export async function runCreateAdminFromEnv(
  source: CreateAdminEnv = process.env,
): Promise<CreateAdminResult> {
  return createOrUpdateSuperAdmin(readCreateAdminEnv(source));
}

async function main(): Promise<void> {
  const result = await runCreateAdminFromEnv();
  for (const line of formatCreateAdminResult(result)) {
    console.log(line);
  }
}

if (process.argv[1]?.endsWith("create-admin.ts")) {
  main()
    .catch((error) => {
      console.error((error as Error).message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectPrismaClient();
    });
}
