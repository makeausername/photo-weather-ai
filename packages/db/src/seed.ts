import { fileURLToPath } from "node:url";

import { fullForecastAccessEntitlementType, trialFullAccessProductCode } from "./access.js";
import { disconnectPrismaClient, getPrismaClient } from "./client.js";
import { cloneJsonValue, isPlainJsonObject } from "./json.js";
import { buildSeedData } from "./seed-data.js";
import type { BillingProductSeed } from "./seed-data.js";
import type { DatabaseClient } from "./types.js";

function mergeBillingProductSeedMetadata(
  product: BillingProductSeed,
  existingMetadata: unknown,
) {
  const defaults = isPlainJsonObject(product.metadataJson) ? product.metadataJson : {};
  const existing = isPlainJsonObject(existingMetadata) ? existingMetadata : {};
  const merged = {
    ...defaults,
    ...existing,
  };

  if (product.code === trialFullAccessProductCode) {
    return cloneJsonValue({
      ...merged,
      internal: true,
      public: false,
      publicVisible: false,
      publicPurchasable: false,
      grantType: fullForecastAccessEntitlementType,
      source: "registration_trial",
    });
  }

  return cloneJsonValue(merged);
}

function billingProductSeedUpdateData(product: BillingProductSeed, existing: any) {
  const metadataJson = mergeBillingProductSeedMetadata(product, existing?.metadataJson);

  if (product.code === trialFullAccessProductCode) {
    return {
      amountCents: 0,
      currency: "CNY",
      credits: 0,
      durationDays: product.durationDays,
      enabled: true,
      metadataJson,
    };
  }

  if (
    product.code === "monthly_full" ||
    product.code === "quarterly_full" ||
    product.code === "yearly_full"
  ) {
    return {
      currency: "CNY",
      credits: 0,
      durationDays: product.durationDays,
      metadataJson,
    };
  }

  return { metadataJson };
}

export async function seedDatabase(client: DatabaseClient): Promise<void> {
  if (!client.role || !client.permission || !client.rolePermission) {
    throw new Error("Seed database client is missing role or permission delegates.");
  }
  if (!client.location) {
    throw new Error("Seed database client is missing location delegate.");
  }
  if (!client.billingProduct) {
    throw new Error("Seed database client is missing billing product delegate.");
  }

  const seedData = buildSeedData();

  for (const role of seedData.roles) {
    await client.role.upsert({
      where: { code: role.code },
      create: role,
      update: {
        name: role.name,
        description: role.description,
      },
    });
  }

  for (const permission of seedData.permissions) {
    await client.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: {
        name: permission.name,
        description: permission.description,
      },
    });
  }

  for (const rolePermission of seedData.rolePermissions) {
    const role = await client.role.findUnique({ where: { code: rolePermission.roleCode } });
    const permission = await client.permission.findUnique({
      where: { code: rolePermission.permissionCode },
    });

    if (!role || !permission) {
      throw new Error(
        `Missing role or permission for ${rolePermission.roleCode}:${rolePermission.permissionCode}`,
      );
    }

    await client.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: role.id,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  for (const setting of seedData.systemSettings) {
    await client.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: {
        group: setting.group,
        label: setting.label,
        description: setting.description,
      },
    });
  }

  for (const providerConfig of seedData.providerConfigs) {
    await client.providerConfig.upsert({
      where: {
        providerType_providerCode: {
          providerType: providerConfig.providerType,
          providerCode: providerConfig.providerCode,
        },
      },
      create: providerConfig,
      update: {
        displayName: providerConfig.displayName,
      },
    });
  }

  for (const product of seedData.billingProducts) {
    const existing = await client.billingProduct.findUnique({ where: { code: product.code } });
    if (!existing) {
      await client.billingProduct.upsert({
        where: { code: product.code },
        create: product,
        update: {},
      });
      continue;
    }

    if (typeof client.billingProduct.update !== "function") {
      continue;
    }

    await client.billingProduct.update({
      where: { code: product.code },
      data: billingProductSeedUpdateData(product, existing),
    });
  }

  for (const location of seedData.locations) {
    await client.location.upsert({
      where: { slug: location.slug },
      create: location,
      update: {},
    });
  }

}

async function main(): Promise<void> {
  const client = (await getPrismaClient()) as unknown as DatabaseClient;
  await seedDatabase(client);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then(async () => {
      await disconnectPrismaClient();
      console.log("Database seed completed.");
    })
    .catch(async (error: unknown) => {
      await disconnectPrismaClient();
      console.error(error);
      process.exit(1);
    });
}
