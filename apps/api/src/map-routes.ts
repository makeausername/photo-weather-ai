import type { FastifyInstance } from "fastify";
import {
  getRuntimeProviderConfig,
  type DatabaseClient,
  type ProviderConfigRecord,
} from "@photo-weather/db";
import { proxyAmap } from "./amap-map-proxy.js";

type Options = { env?: NodeJS.ProcessEnv; dbClient?: DatabaseClient };
function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
export function mapCredentials(provider: ProviderConfigRecord | null, env: NodeJS.ProcessEnv) {
  const secret: Record<string, unknown> =
    provider?.secretJson &&
    typeof provider.secretJson === "object" &&
    !Array.isArray(provider.secretJson)
      ? (provider.secretJson as Record<string, unknown>)
      : {};
  const config = provider?.configJson as Record<string, unknown> | null;
  const real = config?.realCallEnabled;
  const enabled =
    (provider?.enabled ?? true) &&
    (real === true || real === "true" || (real === undefined && env.ENABLE_REAL_AMAP === "true"));
  return {
    AMAP_JS_API_KEY: enabled
      ? stringValue(secret.jsApiKey) ||
        stringValue(secret.webJsKey) ||
        stringValue(env.AMAP_JS_API_KEY)
      : "",
    AMAP_SECURITY_JS_CODE: enabled
      ? stringValue(secret.securityJsCode) || stringValue(env.AMAP_SECURITY_JS_CODE)
      : "",
  };
}
async function credentials(options: Options) {
  const env = options.env ?? process.env;
  let provider: ProviderConfigRecord | null = null;
  if (options.dbClient || env.DATABASE_ENABLED !== "false") {
    try {
      provider = await getRuntimeProviderConfig("geo", "amap", { client: options.dbClient });
    } catch {
      /* Environment-only local preview remains available without the old database. */
    }
  }
  return mapCredentials(provider, env);
}
export function publicMapConfig(keys: ReturnType<typeof mapCredentials>, env: NodeJS.ProcessEnv) {
  const ready = Boolean(keys.AMAP_JS_API_KEY && keys.AMAP_SECURITY_JS_CODE);
  // The keyless basemap is only for local development. Production always uses Amap.
  const preview = !ready && env.NODE_ENV === "development" && env.LOCAL_MAP_PREVIEW === "true";
  return {
    provider: preview ? "osm" : "amap",
    amapKey: ready ? keys.AMAP_JS_API_KEY : null,
    amapServiceHost: "/api/service/maps/_AMapService",
    tileUrl: preview ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png" : "",
    tileAttribution: "© OpenStreetMap contributors",
    tileAttributionUrl: "https://www.openstreetmap.org/copyright",
  };
}
export function registerMapRoutes(app: FastifyInstance, options: Options = {}) {
  app.get("/maps/config", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return publicMapConfig(await credentials(options), options.env ?? process.env);
  });
  app.get<{ Params: { "*": string } }>("/maps/_AMapService/*", async (request, reply) => {
    const result = await proxyAmap(
      new Request(`http://localhost${request.url}`),
      request.params["*"].split("/"),
      await credentials(options),
    );
    reply.code(result.status);
    result.headers.forEach((value, key) => reply.header(key, value));
    return reply.send(Buffer.from(await result.arrayBuffer()));
  });
}
