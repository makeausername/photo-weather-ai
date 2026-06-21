import type { FastifyReply, FastifyRequest } from "fastify";
import {
  principalHasAdminRole,
  requiredAdminPermissions,
  type AuthenticatedPrincipal,
  type DatabaseClient,
} from "@photo-weather/db";
import type { AuthConfig, AuthenticatedRequestContext } from "./auth-routes.js";
import { authenticateRequest } from "./auth-routes.js";

type AuthFailure = {
  readonly statusCode?: 401 | 403;
  readonly code?: string;
  readonly message?: string;
};

function principalHasAnyPermission(
  principal: AuthenticatedPrincipal,
  permissions: readonly string[],
): boolean {
  if (principal.permissions.includes("admin.manage")) {
    return true;
  }
  if (permissions.some((permission) => principal.permissions.includes(permission))) {
    return true;
  }
  if (!principalHasAdminRole(principal)) {
    return false;
  }
  return permissions.some((permission) =>
    requiredAdminPermissions.includes(permission as (typeof requiredAdminPermissions)[number]),
  );
}

export async function requireAnyAdminPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  client: DatabaseClient | undefined,
  authConfig: AuthConfig,
  permissions: readonly string[],
): Promise<AuthenticatedRequestContext | null> {
  try {
    const context = await authenticateRequest(request, client, authConfig);
    if (!principalHasAnyPermission(context.principal, permissions)) {
      reply.status(403).send({
        error: "missing_permission",
        message: `Missing one of required permissions: ${permissions.join(", ")}`,
      });
      return null;
    }

    return context;
  } catch (error) {
    const authError = error as AuthFailure;
    if (authError.statusCode === 401 || authError.statusCode === 403) {
      reply.status(authError.statusCode).send({
        error: authError.code ?? "unauthenticated",
        message: authError.message ?? "Authentication is required.",
      });
      return null;
    }
    throw error;
  }
}

export function contextHasAdminManage(context: AuthenticatedRequestContext): boolean {
  return context.principal.permissions.includes("admin.manage");
}
