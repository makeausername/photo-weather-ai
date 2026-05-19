import { buildApiServer } from "./server.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const app = buildApiServer();

app.listen({ host, port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
