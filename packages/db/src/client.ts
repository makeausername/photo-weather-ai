import type { PrismaClient as PrismaClientInstance } from "@prisma/client";

let prismaClient: PrismaClientInstance | undefined;

export async function getPrismaClient(): Promise<PrismaClientInstance> {
  if (prismaClient) {
    return prismaClient;
  }

  const { PrismaClient } = await import("@prisma/client");
  prismaClient = new PrismaClient();
  return prismaClient;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = undefined;
}
