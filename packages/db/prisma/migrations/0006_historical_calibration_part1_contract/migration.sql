ALTER TABLE "historical_weather_samples" RENAME COLUMN "temperature" TO "temperature_c";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "humidity" TO "relative_humidity_percent";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "dew_point" TO "dew_point_c";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "wind_speed" TO "wind_speed_ms";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "wind_gust" TO "wind_gust_ms";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "wind_direction" TO "wind_direction_deg";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "precipitation_amount" TO "precipitation_amount_mm";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "precipitation_probability" TO "precipitation_probability_percent";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "rain_amount" TO "rain_amount_mm";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "snow_amount" TO "snow_amount_mm";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "cloud_total" TO "cloud_total_percent";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "cloud_low" TO "cloud_low_percent";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "cloud_mid" TO "cloud_mid_percent";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "cloud_high" TO "cloud_high_percent";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "visibility" TO "visibility_meters";
ALTER TABLE "historical_weather_samples" RENAME COLUMN "pressure" TO "pressure_msl_hpa";

ALTER TABLE "historical_weather_samples" ALTER COLUMN "location_key" DROP NOT NULL;
ALTER TABLE "historical_weather_samples" ALTER COLUMN "temperature_c" DROP NOT NULL;
ALTER TABLE "historical_weather_samples" ALTER COLUMN "relative_humidity_percent" DROP NOT NULL;
ALTER TABLE "historical_weather_samples" ALTER COLUMN "wind_speed_ms" DROP NOT NULL;
ALTER TABLE "historical_weather_samples" ALTER COLUMN "precipitation_amount_mm" DROP DEFAULT;
ALTER TABLE "historical_weather_samples" ALTER COLUMN "precipitation_amount_mm" DROP NOT NULL;

UPDATE "historical_weather_samples"
SET "visibility_meters" = "visibility_meters" * 1000
WHERE "visibility_meters" IS NOT NULL AND "visibility_meters" < 1000;

CREATE UNIQUE INDEX "historical_weather_samples_coordinates_source_provider_sample_time_key"
  ON "historical_weather_samples"("latitude_wgs84", "longitude_wgs84", "source_provider", "sample_time");

ALTER TABLE "forecast_replay_runs" ADD COLUMN "latitude_wgs84" DOUBLE PRECISION;
ALTER TABLE "forecast_replay_runs" ADD COLUMN "longitude_wgs84" DOUBLE PRECISION;
ALTER TABLE "forecast_replay_runs" ADD COLUMN "elevation_meters" DOUBLE PRECISION;

UPDATE "forecast_replay_runs" AS run
SET
  "latitude_wgs84" = sample."latitude_wgs84",
  "longitude_wgs84" = sample."longitude_wgs84",
  "elevation_meters" = sample."elevation_meters"
FROM (
  SELECT DISTINCT ON ("location_key")
    "location_key",
    "latitude_wgs84",
    "longitude_wgs84",
    "elevation_meters"
  FROM "historical_weather_samples"
  WHERE "location_key" IS NOT NULL
  ORDER BY "location_key", "sample_time" ASC
) AS sample
WHERE run."location_key" = sample."location_key";

UPDATE "forecast_replay_runs"
SET
  "latitude_wgs84" = 0,
  "longitude_wgs84" = 0
WHERE "latitude_wgs84" IS NULL OR "longitude_wgs84" IS NULL;

ALTER TABLE "forecast_replay_runs" ALTER COLUMN "latitude_wgs84" SET NOT NULL;
ALTER TABLE "forecast_replay_runs" ALTER COLUMN "longitude_wgs84" SET NOT NULL;
ALTER TABLE "forecast_replay_runs" ALTER COLUMN "location_key" DROP NOT NULL;
ALTER TABLE "forecast_replay_runs" ALTER COLUMN "model_version" DROP NOT NULL;
ALTER TABLE "forecast_replay_runs" ALTER COLUMN "rule_version" DROP NOT NULL;

ALTER TABLE "forecast_replay_results" ADD COLUMN "location_name" TEXT;

UPDATE "forecast_replay_results" AS result
SET "location_name" = run."location_name"
FROM "forecast_replay_runs" AS run
WHERE result."replay_run_id" = run."id";

UPDATE "forecast_replay_results"
SET "location_name" = ''
WHERE "location_name" IS NULL;

ALTER TABLE "forecast_replay_results" ALTER COLUMN "location_name" SET NOT NULL;
ALTER TABLE "forecast_replay_results" ALTER COLUMN "location_key" DROP NOT NULL;
ALTER TABLE "forecast_replay_results" ALTER COLUMN "overall_score" DROP NOT NULL;
ALTER TABLE "forecast_replay_results" ALTER COLUMN "recommendation_label" DROP NOT NULL;
ALTER TABLE "forecast_replay_results" ALTER COLUMN "confidence_label" DROP NOT NULL;
