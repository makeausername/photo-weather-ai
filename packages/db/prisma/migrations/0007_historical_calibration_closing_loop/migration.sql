ALTER TYPE "CalibrationLevel" ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE "WhiteoutLevel" ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE "TransparencyLevel" ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE "RainImpactLevel" ADD VALUE IF NOT EXISTS 'unknown';

ALTER TABLE "observed_outcomes" ADD COLUMN "latitude_wgs84" DOUBLE PRECISION;
ALTER TABLE "observed_outcomes" ADD COLUMN "longitude_wgs84" DOUBLE PRECISION;
ALTER TABLE "observed_outcomes" ADD COLUMN "milky_way_visibility_level" "CalibrationLevel";
ALTER TABLE "observed_outcomes" ALTER COLUMN "location_key" DROP NOT NULL;

ALTER TABLE "calibration_stats" ADD COLUMN "location_name" TEXT;
UPDATE "calibration_stats" AS stats
SET "location_name" = COALESCE(
  (
    SELECT result."location_name"
    FROM "forecast_replay_results" AS result
    WHERE result."location_key" = stats."location_key"
      AND result."target" = stats."target"
    ORDER BY result."forecast_date" DESC
    LIMIT 1
  ),
  stats."location_key",
  ''
);
ALTER TABLE "calibration_stats" ALTER COLUMN "location_name" SET NOT NULL;
ALTER TABLE "calibration_stats" ALTER COLUMN "rule_version" DROP NOT NULL;
ALTER TABLE "calibration_stats" ADD COLUMN "labeled_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "calibration_stats" ADD COLUMN "hit_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "calibration_stats" ADD COLUMN "partial_hit_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "calibration_stats" ADD COLUMN "false_positive_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "calibration_stats" ADD COLUMN "false_negative_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "calibration_stats" ADD COLUMN "true_positive_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "calibration_stats" ADD COLUMN "true_negative_count" INTEGER NOT NULL DEFAULT 0;
