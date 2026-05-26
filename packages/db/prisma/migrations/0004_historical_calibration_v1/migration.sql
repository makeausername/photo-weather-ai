CREATE TYPE "HistoricalWeatherSourceProvider" AS ENUM ('open_meteo_historical', 'meteoblue_history', 'manual', 'imported');

CREATE TYPE "ForecastReplayTarget" AS ENUM ('general', 'cloud_sea', 'glow', 'astro');

CREATE TYPE "ForecastReplayStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TYPE "ObservedResult" AS ENUM ('success', 'partial', 'fail', 'unknown');

CREATE TYPE "CalibrationLevel" AS ENUM ('none', 'weak', 'medium', 'strong');

CREATE TYPE "WhiteoutLevel" AS ENUM ('none', 'low', 'medium', 'high');

CREATE TYPE "TransparencyLevel" AS ENUM ('poor', 'fair', 'good', 'excellent');

CREATE TYPE "RainImpactLevel" AS ENUM ('none', 'low', 'medium', 'high');

CREATE TYPE "ObservedOutcomeSource" AS ENUM ('admin_manual', 'user_feedback', 'imported');

CREATE TABLE "historical_weather_samples" (
  "id" TEXT NOT NULL,
  "spot_id" TEXT,
  "location_key" TEXT NOT NULL,
  "location_name" TEXT NOT NULL,
  "latitude_wgs84" DOUBLE PRECISION NOT NULL,
  "longitude_wgs84" DOUBLE PRECISION NOT NULL,
  "elevation_meters" DOUBLE PRECISION,
  "source_provider" "HistoricalWeatherSourceProvider" NOT NULL,
  "sample_time" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "temperature" DOUBLE PRECISION NOT NULL,
  "humidity" DOUBLE PRECISION NOT NULL,
  "dew_point" DOUBLE PRECISION,
  "wind_speed" DOUBLE PRECISION NOT NULL,
  "wind_gust" DOUBLE PRECISION,
  "wind_direction" DOUBLE PRECISION,
  "precipitation_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "precipitation_probability" DOUBLE PRECISION,
  "rain_amount" DOUBLE PRECISION,
  "snow_amount" DOUBLE PRECISION,
  "cloud_total" DOUBLE PRECISION,
  "cloud_low" DOUBLE PRECISION,
  "cloud_mid" DOUBLE PRECISION,
  "cloud_high" DOUBLE PRECISION,
  "visibility" DOUBLE PRECISION,
  "pressure" DOUBLE PRECISION,
  "weather_code" TEXT,
  "weather_text" TEXT,
  "raw_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "historical_weather_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forecast_replay_runs" (
  "id" TEXT NOT NULL,
  "spot_id" TEXT,
  "location_key" TEXT NOT NULL,
  "location_name" TEXT NOT NULL,
  "date_start" DATE NOT NULL,
  "date_end" DATE NOT NULL,
  "target" "ForecastReplayTarget" NOT NULL,
  "model_version" TEXT NOT NULL,
  "rule_version" TEXT NOT NULL,
  "source_provider" "HistoricalWeatherSourceProvider" NOT NULL,
  "status" "ForecastReplayStatus" NOT NULL DEFAULT 'pending',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "forecast_replay_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forecast_replay_results" (
  "id" TEXT NOT NULL,
  "replay_run_id" TEXT NOT NULL,
  "spot_id" TEXT,
  "location_key" TEXT NOT NULL,
  "target" "ForecastReplayTarget" NOT NULL,
  "forecast_date" DATE NOT NULL,
  "overall_score" DOUBLE PRECISION NOT NULL,
  "recommendation_label" TEXT NOT NULL,
  "dedicated_trip_recommendation" TEXT,
  "nearby_observation_recommendation" TEXT,
  "best_window_start" TIMESTAMP(3),
  "best_window_end" TIMESTAMP(3),
  "best_subject" TEXT,
  "cloud_sea_formation_score" DOUBLE PRECISION,
  "cloud_sea_shootable_score" DOUBLE PRECISION,
  "whiteout_risk_score" DOUBLE PRECISION,
  "sunrise_glow_score" DOUBLE PRECISION,
  "sunset_glow_score" DOUBLE PRECISION,
  "astro_practical_score" DOUBLE PRECISION,
  "milky_way_practical_score" DOUBLE PRECISION,
  "precipitation_risk_level" TEXT,
  "transparency_grade" TEXT,
  "confidence_label" TEXT NOT NULL,
  "predicted_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "forecast_replay_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "observed_outcomes" (
  "id" TEXT NOT NULL,
  "spot_id" TEXT,
  "location_key" TEXT NOT NULL,
  "location_name" TEXT NOT NULL,
  "target" "ForecastReplayTarget" NOT NULL,
  "outcome_date" DATE NOT NULL,
  "observation_window_start" TIMESTAMP(3),
  "observation_window_end" TIMESTAMP(3),
  "observed_result" "ObservedResult" NOT NULL,
  "cloud_sea_level" "CalibrationLevel",
  "whiteout_level" "WhiteoutLevel",
  "sunrise_glow_level" "CalibrationLevel",
  "sunset_glow_level" "CalibrationLevel",
  "astro_visibility_level" "CalibrationLevel",
  "transparency_level" "TransparencyLevel",
  "rain_impact_level" "RainImpactLevel",
  "notes" TEXT,
  "photo_evidence_url" TEXT,
  "source" "ObservedOutcomeSource" NOT NULL DEFAULT 'admin_manual',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "observed_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calibration_stats" (
  "id" TEXT NOT NULL,
  "spot_id" TEXT,
  "location_key" TEXT NOT NULL,
  "target" "ForecastReplayTarget" NOT NULL,
  "rule_version" TEXT NOT NULL,
  "sample_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "partial_count" INTEGER NOT NULL DEFAULT 0,
  "fail_count" INTEGER NOT NULL DEFAULT 0,
  "hit_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "false_positive_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "false_negative_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "whiteout_false_positive_rate" DOUBLE PRECISION,
  "best_window_hit_rate" DOUBLE PRECISION,
  "recommended_trip_hit_rate" DOUBLE PRECISION,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "summary_json" JSONB NOT NULL,

  CONSTRAINT "calibration_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "historical_weather_samples_location_key_source_provider_sample_time_key"
  ON "historical_weather_samples"("location_key", "source_provider", "sample_time");
CREATE INDEX "historical_weather_samples_spot_id_idx" ON "historical_weather_samples"("spot_id");
CREATE INDEX "historical_weather_samples_location_key_sample_time_idx" ON "historical_weather_samples"("location_key", "sample_time");
CREATE INDEX "historical_weather_samples_source_provider_sample_time_idx" ON "historical_weather_samples"("source_provider", "sample_time");

CREATE INDEX "forecast_replay_runs_location_key_target_idx" ON "forecast_replay_runs"("location_key", "target");
CREATE INDEX "forecast_replay_runs_status_idx" ON "forecast_replay_runs"("status");
CREATE INDEX "forecast_replay_runs_created_at_idx" ON "forecast_replay_runs"("created_at");

CREATE UNIQUE INDEX "forecast_replay_results_replay_run_id_forecast_date_target_key"
  ON "forecast_replay_results"("replay_run_id", "forecast_date", "target");
CREATE INDEX "forecast_replay_results_location_key_target_forecast_date_idx"
  ON "forecast_replay_results"("location_key", "target", "forecast_date");
CREATE INDEX "forecast_replay_results_spot_id_idx" ON "forecast_replay_results"("spot_id");

CREATE UNIQUE INDEX "observed_outcomes_location_key_target_outcome_date_key"
  ON "observed_outcomes"("location_key", "target", "outcome_date");
CREATE INDEX "observed_outcomes_spot_id_idx" ON "observed_outcomes"("spot_id");
CREATE INDEX "observed_outcomes_target_outcome_date_idx" ON "observed_outcomes"("target", "outcome_date");

CREATE UNIQUE INDEX "calibration_stats_location_key_target_rule_version_key"
  ON "calibration_stats"("location_key", "target", "rule_version");
CREATE INDEX "calibration_stats_spot_id_idx" ON "calibration_stats"("spot_id");
CREATE INDEX "calibration_stats_target_idx" ON "calibration_stats"("target");

ALTER TABLE "forecast_replay_results" ADD CONSTRAINT "forecast_replay_results_replay_run_id_fkey"
  FOREIGN KEY ("replay_run_id") REFERENCES "forecast_replay_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
