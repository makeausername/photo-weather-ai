import {
  disconnectPrismaClient,
  getPrismaClient,
  readVerifyAdminEnv,
  type DatabaseClient,
} from "@photo-weather/db";
import { buildApiServer } from "./server.js";

const smokeAuthConfig = {
  jwtSecret: "admin-bootstrap-verification-secret-32-chars",
  accessTokenTtlSeconds: 15 * 60,
  userSessionTtlDays: 7,
  adminSessionTtlDays: 3,
  adminAuthBypass: false,
};

function roleMatchesAdmin(role: unknown): boolean {
  if (typeof role === "string") {
    return role.trim().toLowerCase() === "admin";
  }

  if (!role || typeof role !== "object") {
    return false;
  }

  const candidate = role as { readonly code?: unknown; readonly name?: unknown };
  return [candidate.code, candidate.name].some(
    (value) => typeof value === "string" && value.trim().toLowerCase() === "admin",
  );
}

function roleHasNormalizedShape(role: unknown): boolean {
  if (!role || typeof role !== "object") {
    return false;
  }

  const candidate = role as {
    readonly code?: unknown;
    readonly name?: unknown;
    readonly displayName?: unknown;
  };
  return (
    typeof candidate.code === "string" &&
    candidate.code.trim().length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    (typeof candidate.displayName === "string" || candidate.displayName === null)
  );
}

async function main(): Promise<void> {
  const input = readVerifyAdminEnv();
  if (!input.password) {
    throw new Error("Missing admin password for auth route verification.");
  }

  const dbClient = (await getPrismaClient()) as unknown as DatabaseClient;
  const app = buildApiServer({
    dbClient,
    authConfig: smokeAuthConfig,
    logger: false,
  });

  try {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: input.email,
        password: input.password,
      },
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error(
        `Admin auth route verification failed with status ${loginResponse.statusCode}.`,
      );
    }

    const loginBody = loginResponse.json() as {
      readonly accessToken?: string;
      readonly isAdmin?: boolean;
      readonly roles?: readonly unknown[];
      readonly roleCodes?: readonly string[];
    };

    if (!loginBody.accessToken || loginBody.isAdmin !== true) {
      throw new Error("Admin auth route did not return an administrator session.");
    }

    if (
      !loginBody.roles?.some(roleMatchesAdmin) &&
      !loginBody.roleCodes?.some((roleCode) => roleCode.trim().toLowerCase() === "admin")
    ) {
      throw new Error("Admin auth route did not return the admin role.");
    }

    if (!loginBody.roles?.some((role) => roleMatchesAdmin(role) && roleHasNormalizedShape(role))) {
      throw new Error("Admin auth route did not return normalized role code/name/displayName.");
    }

    const meResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
    });

    const meBody = meResponse.json() as {
      readonly isAdmin?: boolean;
      readonly roles?: readonly unknown[];
    };
    if (meResponse.statusCode !== 200 || meBody.isAdmin !== true) {
      throw new Error("Authenticated /auth/me did not recognize the admin role.");
    }

    if (!meBody.roles?.some((role) => roleMatchesAdmin(role) && roleHasNormalizedShape(role))) {
      throw new Error(
        "Authenticated /auth/me did not return normalized role code/name/displayName.",
      );
    }

    console.log("OK admin auth route recognizes admin role.");
  } finally {
    await app.close();
  }
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrismaClient();
  });
