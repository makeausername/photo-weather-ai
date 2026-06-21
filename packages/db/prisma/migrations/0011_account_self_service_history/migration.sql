DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'change_email'
      AND enumtypid = '"AuthVerificationPurpose"'::regtype
  ) THEN
    ALTER TYPE "AuthVerificationPurpose" ADD VALUE 'change_email';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'change_phone'
      AND enumtypid = '"AuthVerificationPurpose"'::regtype
  ) THEN
    ALTER TYPE "AuthVerificationPurpose" ADD VALUE 'change_phone';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'delete_account'
      AND enumtypid = '"AuthVerificationPurpose"'::regtype
  ) THEN
    ALTER TYPE "AuthVerificationPurpose" ADD VALUE 'delete_account';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_forecast_history" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "location_name" TEXT NOT NULL,
  "target" "ForecastReplayTarget" NOT NULL,
  "horizon" TEXT NOT NULL,
  "timezone" TEXT,
  "latitude_gcj02" DOUBLE PRECISION,
  "longitude_gcj02" DOUBLE PRECISION,
  "latitude_wgs84" DOUBLE PRECISION,
  "longitude_wgs84" DOUBLE PRECISION,
  "elevation_meters" DOUBLE PRECISION,
  "location_id" TEXT,
  "photo_spot_id" TEXT,
  "query_key" TEXT NOT NULL,
  "query_json" JSONB NOT NULL,
  "result_summary_json" JSONB,
  "overall_score" DOUBLE PRECISION,
  "recommendation_label" TEXT,
  "best_window_start" TIMESTAMP(3),
  "best_window_end" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_forecast_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_forecast_history_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_forecast_history_user_id_created_at_idx"
  ON "user_forecast_history"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "user_forecast_history_user_id_target_created_at_idx"
  ON "user_forecast_history"("user_id", "target", "created_at");
CREATE INDEX IF NOT EXISTS "user_forecast_history_user_id_query_key_created_at_idx"
  ON "user_forecast_history"("user_id", "query_key", "created_at");
