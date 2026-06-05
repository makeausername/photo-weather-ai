import { disconnectPrismaClient, formatCreateAdminResult, runCreateAdminFromEnv } from "./index.js";

async function main(): Promise<void> {
  const result = await runCreateAdminFromEnv();
  for (const line of formatCreateAdminResult(result)) {
    console.log(line);
  }
}

if (process.argv[1]?.endsWith("bootstrap-admin.ts")) {
  main()
    .catch((error) => {
      console.error((error as Error).message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectPrismaClient();
    });
}
