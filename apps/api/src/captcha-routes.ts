import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@photo-weather/db";
import { getTencentCaptchaPublicConfig } from "./captcha-provider.js";

export type CaptchaRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
};

export function registerCaptchaRoutes(app: FastifyInstance, options: CaptchaRoutesOptions): void {
  app.get("/captcha/config", async () => ({
    captcha: await getTencentCaptchaPublicConfig({
      dbClient: options.dbClient,
      env: options.env,
    }),
  }));
}
