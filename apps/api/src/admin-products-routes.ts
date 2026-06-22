import type { FastifyInstance, FastifyReply } from "fastify";
import {
  BillingProductNotFoundError,
  InvalidBillingProductUpdateError,
  getAdminBillingProductByCode,
  listAdminBillingProducts,
  updateAdminBillingProduct,
} from "@photo-weather/db";
import type { DatabaseClient } from "@photo-weather/db";
import { z } from "zod";
import type { AuthConfig } from "./auth-routes.js";
import { requirePermission } from "./auth-routes.js";
import { requireAnyAdminPermission } from "./admin-permissions.js";

export type AdminProductRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
};

const productCodeParamsSchema = z.object({
  code: z.string().trim().min(1).max(120),
});

const productPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    amountCents: z.number().int().min(0).optional(),
    currency: z.enum(["CNY"]).optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    publicVisible: z.boolean().optional(),
    publicPurchasable: z.boolean().optional(),
    recommended: z.boolean().optional(),
    badgeText: z.string().trim().max(20).nullable().optional(),
    featureBullets: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
    publicDescription: z.string().trim().max(500).nullable().optional(),
    shortDescription: z.string().trim().max(160).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  });

function sendZodError(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string) {
  return reply.status(statusCode).send({ error, message });
}

function sendAdminProductError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof BillingProductNotFoundError) {
    return sendError(reply, 404, "product_not_found", "未找到该计费产品。");
  }
  if (error instanceof InvalidBillingProductUpdateError) {
    return sendError(reply, 400, "invalid_product_update", error.message);
  }
  throw error;
}

export function registerAdminProductRoutes(
  app: FastifyInstance,
  options: AdminProductRoutesOptions,
): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;

  app.get("/admin/products", async (request, reply) => {
    const auth = await requireAnyAdminPermission(request, reply, client, authConfig, [
      "users.manage",
      "admin.manage",
    ]);
    if (!auth) {
      return reply;
    }

    return { products: await listAdminBillingProducts({ client }) };
  });

  app.get<{ Params: { code: string } }>("/admin/products/:code", async (request, reply) => {
    const auth = await requireAnyAdminPermission(request, reply, client, authConfig, [
      "users.manage",
      "admin.manage",
    ]);
    if (!auth) {
      return reply;
    }

    const parsedParams = productCodeParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }

    const product = await getAdminBillingProductByCode(parsedParams.data.code, { client });
    if (!product) {
      return sendError(reply, 404, "product_not_found", "未找到该计费产品。");
    }
    return { product };
  });

  app.patch<{ Params: { code: string } }>("/admin/products/:code", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }
    const parsedParams = productCodeParamsSchema.safeParse(request.params);
    const parsedBody = productPatchSchema.safeParse(request.body ?? {});
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    try {
      const product = await updateAdminBillingProduct(
        {
          code: parsedParams.data.code,
          ...parsedBody.data,
          actorUserId: auth.auditActorUserId,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );
      return { product };
    } catch (error) {
      return sendAdminProductError(reply, error);
    }
  });

  app.post<{ Params: { code: string } }>(
    "/admin/products/:code/enable",
    async (request, reply) => {
      const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
      if (!auth) {
        return reply;
      }
      const parsedParams = productCodeParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }

      try {
        const product = await updateAdminBillingProduct(
          {
            code: parsedParams.data.code,
            enabled: true,
            actorUserId: auth.auditActorUserId,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"] ?? null,
          },
          { client },
        );
        return { product };
      } catch (error) {
        return sendAdminProductError(reply, error);
      }
    },
  );

  app.post<{ Params: { code: string } }>(
    "/admin/products/:code/disable",
    async (request, reply) => {
      const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
      if (!auth) {
        return reply;
      }
      const parsedParams = productCodeParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }

      try {
        const product = await updateAdminBillingProduct(
          {
            code: parsedParams.data.code,
            enabled: false,
            actorUserId: auth.auditActorUserId,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"] ?? null,
          },
          { client },
        );
        return { product };
      } catch (error) {
        return sendAdminProductError(reply, error);
      }
    },
  );
}
