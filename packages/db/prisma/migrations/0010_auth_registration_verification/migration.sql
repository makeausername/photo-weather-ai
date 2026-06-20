ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'email'
      AND enumtypid = '"ProviderType"'::regtype
  ) THEN
    ALTER TYPE "ProviderType" ADD VALUE 'email';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthVerificationChannel') THEN
    CREATE TYPE "AuthVerificationChannel" AS ENUM ('email', 'sms');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthVerificationPurpose') THEN
    CREATE TYPE "AuthVerificationPurpose" AS ENUM ('register');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "auth_verification_codes" (
  "id" TEXT NOT NULL,
  "channel" "AuthVerificationChannel" NOT NULL,
  "purpose" "AuthVerificationPurpose" NOT NULL,
  "target" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auth_verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "auth_verification_codes_channel_purpose_target_idx"
  ON "auth_verification_codes"("channel", "purpose", "target");
CREATE INDEX IF NOT EXISTS "auth_verification_codes_expires_at_idx"
  ON "auth_verification_codes"("expires_at");
CREATE INDEX IF NOT EXISTS "auth_verification_codes_consumed_at_idx"
  ON "auth_verification_codes"("consumed_at");
CREATE INDEX IF NOT EXISTS "auth_verification_codes_created_at_idx"
  ON "auth_verification_codes"("created_at");
