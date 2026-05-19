import { fileURLToPath } from "node:url";

import { disconnectPrismaClient, getPrismaClient } from "./client.js";
import { buildSeedData } from "./seed-data.js";
import type { DatabaseClient } from "./types.js";

export async function seedDatabase(client: DatabaseClient): Promise<void> {
  if (!client.role || !client.permission || !client.rolePermission) {
    throw new Error("Seed database client is missing role or permission delegates.");
  }
  if (!client.location || !client.photoSpot || !client.spotTag) {
    throw new Error("Seed database client is missing location or photo spot delegates.");
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

  for (const location of seedData.locations) {
    await client.location.upsert({
      where: { slug: location.slug },
      create: location,
      update: {},
    });
  }

  for (const spotTag of seedData.spotTags) {
    await client.spotTag.upsert({
      where: { code: spotTag.code },
      create: spotTag,
      update: {
        name: spotTag.name,
        description: spotTag.description,
      },
    });
  }

  for (const photoSpot of seedData.photoSpots) {
    const location = await client.location.findUnique({ where: { slug: photoSpot.locationSlug } });
    if (!location) {
      throw new Error(`Missing seed location for photo spot: ${photoSpot.locationSlug}`);
    }

    const { locationSlug: _locationSlug, ...photoSpotData } = photoSpot;
    await client.photoSpot.upsert({
      where: {
        locationId_slug: {
          locationId: location.id,
          slug: photoSpot.slug,
        },
      },
      create: {
        ...photoSpotData,
        locationId: location.id,
      },
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
