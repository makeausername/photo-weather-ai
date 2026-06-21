-- Billing provider payment foundation.
CREATE TYPE "PaymentProviderCode" AS ENUM ('mock', 'wechat_pay', 'alipay');
CREATE TYPE "PaymentOrderStatus" AS ENUM ('created', 'pending', 'paid', 'closed', 'canceled', 'failed', 'refunded');
CREATE TYPE "PaymentNotifyStatus" AS ENUM ('received', 'verified', 'processed', 'ignored', 'failed');
CREATE TYPE "EntitlementType" AS ENUM ('forecast_credit', 'subscription', 'feature_unlock');

CREATE TABLE "billing_products" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "credits" INTEGER NOT NULL DEFAULT 0,
  "duration_days" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_orders" (
  "id" TEXT NOT NULL,
  "order_no" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" "PaymentProviderCode" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "product_code" TEXT NOT NULL,
  "product_id" TEXT,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'created',
  "paid_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "provider_trade_no" TEXT,
  "provider_payload_json" JSONB,
  "metadata_json" JSONB,
  "entitlement_granted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_notifications" (
  "id" TEXT NOT NULL,
  "provider" "PaymentProviderCode" NOT NULL,
  "order_no" TEXT,
  "provider_trade_no" TEXT,
  "raw_body" TEXT,
  "raw_json" JSONB,
  "headers_json" JSONB,
  "signature_verified" BOOLEAN NOT NULL DEFAULT false,
  "status" "PaymentNotifyStatus" NOT NULL DEFAULT 'received',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "payment_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_entitlements" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "type" "EntitlementType" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "remaining_quantity" INTEGER,
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata_json" JSONB,
  CONSTRAINT "user_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_credit_ledger" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "order_id" TEXT,
  "entitlement_id" TEXT,
  "delta" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_products_code_key" ON "billing_products"("code");
CREATE INDEX "billing_products_enabled_sort_order_idx" ON "billing_products"("enabled", "sort_order");

CREATE UNIQUE INDEX "payment_orders_order_no_key" ON "payment_orders"("order_no");
CREATE INDEX "payment_orders_user_id_idx" ON "payment_orders"("user_id");
CREATE INDEX "payment_orders_order_no_idx" ON "payment_orders"("order_no");
CREATE INDEX "payment_orders_provider_trade_no_idx" ON "payment_orders"("provider_trade_no");
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");
CREATE INDEX "payment_orders_created_at_idx" ON "payment_orders"("created_at");
CREATE INDEX "payment_orders_provider_provider_trade_no_idx" ON "payment_orders"("provider", "provider_trade_no");

CREATE INDEX "payment_notifications_provider_created_at_idx" ON "payment_notifications"("provider", "created_at");
CREATE INDEX "payment_notifications_order_no_idx" ON "payment_notifications"("order_no");
CREATE INDEX "payment_notifications_provider_trade_no_idx" ON "payment_notifications"("provider_trade_no");
CREATE INDEX "payment_notifications_status_idx" ON "payment_notifications"("status");

CREATE UNIQUE INDEX "user_entitlements_order_id_type_key" ON "user_entitlements"("order_id", "type");
CREATE INDEX "user_entitlements_user_id_idx" ON "user_entitlements"("user_id");
CREATE INDEX "user_entitlements_type_idx" ON "user_entitlements"("type");
CREATE INDEX "user_entitlements_expires_at_idx" ON "user_entitlements"("expires_at");

CREATE UNIQUE INDEX "user_credit_ledger_order_id_reason_key" ON "user_credit_ledger"("order_id", "reason");
CREATE INDEX "user_credit_ledger_user_id_created_at_idx" ON "user_credit_ledger"("user_id", "created_at");
CREATE INDEX "user_credit_ledger_entitlement_id_idx" ON "user_credit_ledger"("entitlement_id");

ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "billing_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_notifications" ADD CONSTRAINT "payment_notifications_order_no_fkey"
  FOREIGN KEY ("order_no") REFERENCES "payment_orders"("order_no") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_credit_ledger" ADD CONSTRAINT "user_credit_ledger_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_credit_ledger" ADD CONSTRAINT "user_credit_ledger_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_credit_ledger" ADD CONSTRAINT "user_credit_ledger_entitlement_id_fkey"
  FOREIGN KEY ("entitlement_id") REFERENCES "user_entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
