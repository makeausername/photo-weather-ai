CREATE TABLE "terrain_elevation_cache" (
  "id" TEXT NOT NULL,
  "cache_key" TEXT NOT NULL,
  "latitude_wgs84" DOUBLE PRECISION NOT NULL,
  "longitude_wgs84" DOUBLE PRECISION NOT NULL,
  "elevation_meters" DOUBLE PRECISION,
  "elevation_source" TEXT NOT NULL,
  "elevation_confidence" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "raw_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "terrain_elevation_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terrain_elevation_cache_cache_key_key" ON "terrain_elevation_cache"("cache_key");
CREATE INDEX "terrain_elevation_cache_expires_at_idx" ON "terrain_elevation_cache"("expires_at");
