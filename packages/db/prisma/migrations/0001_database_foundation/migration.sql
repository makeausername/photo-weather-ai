CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

CREATE TYPE "ProviderType" AS ENUM ('ai', 'weather', 'geo', 'terrain', 'storage', 'billing', 'sms');

CREATE TYPE "SettingValueType" AS ENUM ('string', 'number', 'boolean', 'json', 'url', 'select', 'prompt', 'secret');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_login_at" TIMESTAMP(3),

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_profiles" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "avatar_url" TEXT,
  "preferred_units" TEXT NOT NULL DEFAULT 'metric',
  "preferred_language" TEXT NOT NULL DEFAULT 'zh-CN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_roles" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
  "id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value_json" JSONB NOT NULL,
  "value_type" "SettingValueType" NOT NULL,
  "setting_group" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "is_public" BOOLEAN NOT NULL DEFAULT false,
  "is_secret" BOOLEAN NOT NULL DEFAULT false,
  "is_editable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_configs" (
  "id" TEXT NOT NULL,
  "provider_type" "ProviderType" NOT NULL,
  "provider_code" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "config_json" JSONB NOT NULL,
  "secret_json" JSONB,
  "masked_secret_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "before_json" JSONB,
  "after_json" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_usage_logs" (
  "id" TEXT NOT NULL,
  "provider_type" "ProviderType" NOT NULL,
  "provider_code" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "request_id" TEXT,
  "success" BOOLEAN NOT NULL,
  "status_code" INTEGER,
  "latency_ms" INTEGER,
  "estimated_cost" DECIMAL(18,8),
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_status_idx" ON "users"("status");

CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
CREATE INDEX "system_settings_setting_group_idx" ON "system_settings"("setting_group");
CREATE INDEX "system_settings_is_public_idx" ON "system_settings"("is_public");

CREATE UNIQUE INDEX "provider_configs_provider_type_provider_code_key" ON "provider_configs"("provider_type", "provider_code");
CREATE INDEX "provider_configs_provider_type_enabled_priority_idx" ON "provider_configs"("provider_type", "enabled", "priority");

CREATE INDEX "admin_audit_logs_actor_user_id_idx" ON "admin_audit_logs"("actor_user_id");
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

CREATE INDEX "api_usage_logs_provider_type_provider_code_idx" ON "api_usage_logs"("provider_type", "provider_code");
CREATE INDEX "api_usage_logs_operation_idx" ON "api_usage_logs"("operation");
CREATE INDEX "api_usage_logs_request_id_idx" ON "api_usage_logs"("request_id");
CREATE INDEX "api_usage_logs_created_at_idx" ON "api_usage_logs"("created_at");

ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
