import { disconnectPrismaClient, getPrismaClient, type DatabaseClient } from "@photo-weather/db";
import { buildApiServer } from "./server.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const dbClient = (await getPrismaClient()) as unknown as DatabaseClient;
const app = buildApiServer({ dbClient });

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down API server");
  await app.close();
  await disconnectPrismaClient();
  process.exit(0);
}

process.once("SIGINT", (signal) => {
  void shutdown(signal);
});
process.once("SIGTERM", (signal) => {
  void shutdown(signal);
});

app.listen({ host, port }).catch(async (error) => {
  app.log.error(error);
  await disconnectPrismaClient();
  process.exit(1);
});
