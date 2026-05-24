import { disconnectPrismaClient, formatVerifyAdminResult, runVerifyAdminFromEnv } from "./index.js";

async function main(): Promise<void> {
  const result = await runVerifyAdminFromEnv();
  for (const line of formatVerifyAdminResult(result)) {
    console.log(line);
  }
}

if (process.argv[1]?.endsWith("verify-admin.ts")) {
  main()
    .catch((error) => {
      console.error((error as Error).message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectPrismaClient();
    });
}
