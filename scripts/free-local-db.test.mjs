import { test } from "node:test";
import assert from "node:assert/strict";
import { assertFreeLocalDatabaseUrl } from "./free-local-db.mjs";

const localUrl = "postgresql://free_local:example@127.0.0.1:55432/photo_weather_free_local?schema=public";
test("accepts only the isolated local database", () => {
  assert.doesNotThrow(() => assertFreeLocalDatabaseUrl(localUrl));
});
for (const [label, value] of [
  ["remote host", localUrl.replace("127.0.0.1", "db.example.com")],
  ["old tunnel", localUrl.replace("55432", "15432")],
  ["another database", localUrl.replace("photo_weather_free_local", "production")],
  ["another owner", localUrl.replace("free_local:", "postgres:")],
  ["host override", `${localUrl}&host=remote.example.com`],
  ["schema override", localUrl.replace("schema=public", "schema=private")],
  ["missing url", ""],
]) test(`rejects ${label} before initialization`, () => {
  assert.throws(() => assertFreeLocalDatabaseUrl(value));
});
