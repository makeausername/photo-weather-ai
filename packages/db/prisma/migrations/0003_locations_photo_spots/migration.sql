CREATE TYPE "LocationType" AS ENUM ('scenic_area', 'viewpoint', 'mountain', 'lake', 'city', 'custom');

CREATE TYPE "LocationSource" AS ENUM ('manual', 'amap', 'user');

CREATE TYPE "ViewDirection" AS ENUM ('north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'all', 'unknown');

CREATE TABLE "locations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "district" TEXT,
  "address" TEXT,
  "latitude_gcj02" DOUBLE PRECISION NOT NULL,
  "longitude_gcj02" DOUBLE PRECISION NOT NULL,
  "latitude_wgs84" DOUBLE PRECISION NOT NULL,
  "longitude_wgs84" DOUBLE PRECISION NOT NULL,
  "elevation" DOUBLE PRECISION,
  "location_type" "LocationType" NOT NULL DEFAULT 'scenic_area',
  "source" "LocationSource" NOT NULL DEFAULT 'manual',
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "photo_spots" (
  "id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "latitude_gcj02" DOUBLE PRECISION NOT NULL,
  "longitude_gcj02" DOUBLE PRECISION NOT NULL,
  "latitude_wgs84" DOUBLE PRECISION NOT NULL,
  "longitude_wgs84" DOUBLE PRECISION NOT NULL,
  "elevation" DOUBLE PRECISION,
  "view_direction" "ViewDirection" NOT NULL DEFAULT 'unknown',
  "best_for_sunrise" BOOLEAN NOT NULL DEFAULT false,
  "best_for_sunset" BOOLEAN NOT NULL DEFAULT false,
  "best_for_cloud_sea" BOOLEAN NOT NULL DEFAULT false,
  "best_for_stars" BOOLEAN NOT NULL DEFAULT false,
  "best_for_milky_way" BOOLEAN NOT NULL DEFAULT false,
  "best_for_snow" BOOLEAN NOT NULL DEFAULT false,
  "access_note" TEXT,
  "traffic_note" TEXT,
  "safety_note" TEXT,
  "risk_note" TEXT,
  "is_hot" BOOLEAN NOT NULL DEFAULT false,
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "photo_spots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_tags" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "spot_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "photo_spot_tags" (
  "id" TEXT NOT NULL,
  "photo_spot_id" TEXT NOT NULL,
  "spot_tag_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "photo_spot_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_direction_profiles" (
  "id" TEXT NOT NULL,
  "photo_spot_id" TEXT NOT NULL,
  "sunrise_direction_note" TEXT,
  "sunset_direction_note" TEXT,
  "milky_way_direction_note" TEXT,
  "blocked_directions_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "spot_direction_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_light_pollution" (
  "id" TEXT NOT NULL,
  "photo_spot_id" TEXT NOT NULL,
  "bortle_level" INTEGER,
  "light_pollution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "spot_light_pollution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "locations_slug_key" ON "locations"("slug");
CREATE INDEX "locations_province_city_idx" ON "locations"("province", "city");
CREATE INDEX "locations_location_type_idx" ON "locations"("location_type");
CREATE INDEX "locations_source_idx" ON "locations"("source");
CREATE INDEX "locations_is_verified_idx" ON "locations"("is_verified");

CREATE UNIQUE INDEX "photo_spots_location_id_slug_key" ON "photo_spots"("location_id", "slug");
CREATE INDEX "photo_spots_slug_idx" ON "photo_spots"("slug");
CREATE INDEX "photo_spots_location_id_idx" ON "photo_spots"("location_id");
CREATE INDEX "photo_spots_is_hot_idx" ON "photo_spots"("is_hot");
CREATE INDEX "photo_spots_is_verified_idx" ON "photo_spots"("is_verified");

CREATE UNIQUE INDEX "spot_tags_code_key" ON "spot_tags"("code");

CREATE UNIQUE INDEX "photo_spot_tags_photo_spot_id_spot_tag_id_key" ON "photo_spot_tags"("photo_spot_id", "spot_tag_id");
CREATE INDEX "photo_spot_tags_spot_tag_id_idx" ON "photo_spot_tags"("spot_tag_id");

CREATE UNIQUE INDEX "spot_direction_profiles_photo_spot_id_key" ON "spot_direction_profiles"("photo_spot_id");
CREATE UNIQUE INDEX "spot_light_pollution_photo_spot_id_key" ON "spot_light_pollution"("photo_spot_id");

ALTER TABLE "photo_spots" ADD CONSTRAINT "photo_spots_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "photo_spot_tags" ADD CONSTRAINT "photo_spot_tags_photo_spot_id_fkey"
  FOREIGN KEY ("photo_spot_id") REFERENCES "photo_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "photo_spot_tags" ADD CONSTRAINT "photo_spot_tags_spot_tag_id_fkey"
  FOREIGN KEY ("spot_tag_id") REFERENCES "spot_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_direction_profiles" ADD CONSTRAINT "spot_direction_profiles_photo_spot_id_fkey"
  FOREIGN KEY ("photo_spot_id") REFERENCES "photo_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_light_pollution" ADD CONSTRAINT "spot_light_pollution_photo_spot_id_fkey"
  FOREIGN KEY ("photo_spot_id") REFERENCES "photo_spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
