-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "channel_enum" AS ENUM ('EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "status_enum" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "in_app_status" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "provider_type" AS ENUM ('SENDGRID', 'RESEND', 'TWILIO', 'AFRICASTALKING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "template_scope_enum" AS ENUM ('PLATFORM_DEFAULT', 'TENANT_OVERRIDE', 'TENANT_CUSTOM');

-- CreateEnum
CREATE TYPE "actor_type_enum" AS ENUM ('PLATFORM_OPERATOR', 'TENANT_ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "notification_logs" (
    "notification_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "template_id" VARCHAR(100) NOT NULL,
    "channel" "channel_enum" NOT NULL,
    "status" "status_enum" DEFAULT 'PENDING',
    "metadata" JSONB,
    "provider_ref" VARCHAR(255),
    "sent_at" TIMESTAMP(6),
    "error_details" TEXT,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "templates" (
    "template_id" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "channel_type" "channel_enum" NOT NULL,
    "subject_line" VARCHAR(255),
    "content_body" TEXT NOT NULL,
    "locale" VARCHAR(10) DEFAULT 'en',
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" UUID,
    "event_type" VARCHAR(100),
    "target_ws_channel" VARCHAR(100),
    "scope" "template_scope_enum" NOT NULL DEFAULT 'TENANT_CUSTOM',

    CONSTRAINT "templates_pkey" PRIMARY KEY ("template_id","version")
);

-- CreateTable
CREATE TABLE "template_library" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "channel_type" "channel_enum" NOT NULL,
    "subject_line" VARCHAR(255),
    "content_body" TEXT NOT NULL,
    "sample_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "template_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "in_app_status" NOT NULL DEFAULT 'UNREAD',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "webhook_secret" VARCHAR(255),
    "allowed_channels" TEXT[],
    "sender_email" VARCHAR(255),
    "sender_name" VARCHAR(255),
    "provider_config_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 100,
    "daily_notification_cap" INTEGER NOT NULL DEFAULT 10000,
    "max_template_count" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_notifications" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" "channel_enum" NOT NULL,
    "payload" JSONB NOT NULL,
    "error_details" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(6),
    "permanently_failed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "failed_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "provider" "provider_type" NOT NULL,
    "api_key_ciphertext" TEXT NOT NULL,
    "api_key_last4" VARCHAR(8),
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "rotated_at" TIMESTAMP(6),
    "sender_email" VARCHAR(255),
    "sender_name" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "actor_type_enum" NOT NULL,
    "actor_id" VARCHAR(255) NOT NULL,
    "tenant_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource_type" VARCHAR(120) NOT NULL,
    "resource_id" VARCHAR(255),
    "trace_id" VARCHAR(255),
    "before_state" JSONB,
    "after_state" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_admins" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "username" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "tenant_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_logs_tenant_id_sent_at_idx" ON "notification_logs"("tenant_id", "sent_at");

-- CreateIndex
CREATE INDEX "templates_tenant_id_event_type_channel_type_scope_is_active_idx" ON "templates"("tenant_id", "event_type", "channel_type", "scope", "is_active");

-- CreateIndex
CREATE INDEX "templates_scope_event_type_channel_type_is_active_idx" ON "templates"("scope", "event_type", "channel_type", "is_active");

-- CreateIndex
CREATE INDEX "template_library_tenant_id_channel_type_idx" ON "template_library"("tenant_id", "channel_type");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_api_key_key" ON "tenants"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_webhook_secret_key" ON "tenants"("webhook_secret");

-- CreateIndex
CREATE INDEX "processed_events_expires_at_idx" ON "processed_events"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_tenant_id_idempotency_key_key" ON "processed_events"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "failed_notifications_permanently_failed_next_retry_at_idx" ON "failed_notifications"("permanently_failed", "next_retry_at");

-- CreateIndex
CREATE INDEX "failed_notifications_tenant_id_idx" ON "failed_notifications"("tenant_id");

-- CreateIndex
CREATE INDEX "provider_configs_tenant_id_provider_idx" ON "provider_configs"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "tenant_admins_tenant_id_is_active_idx" ON "tenant_admins"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_admins_tenant_id_username_key" ON "tenant_admins"("tenant_id", "username");

-- AddForeignKey
ALTER TABLE "template_library" ADD CONSTRAINT "template_library_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_provider_config_id_fkey" FOREIGN KEY ("provider_config_id") REFERENCES "provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_admins" ADD CONSTRAINT "tenant_admins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security bootstrap for Level 2 multitenancy.
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template_library" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "in_app_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processed_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "failed_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_admins" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_tenant_isolation" ON "templates"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR (
      current_setting('app.current_actor_type', true) IN ('tenant_admin', 'system')
      AND (
        ("tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), ''))
        OR ("scope" = 'PLATFORM_DEFAULT' AND "tenant_id" IS NULL)
      )
    )
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR (
      current_setting('app.current_actor_type', true) IN ('tenant_admin', 'system')
      AND "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
      AND "scope" <> 'PLATFORM_DEFAULT'
    )
  );

CREATE POLICY "template_library_tenant_isolation" ON "template_library"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

CREATE POLICY "provider_configs_tenant_isolation" ON "provider_configs"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

CREATE POLICY "notification_logs_tenant_isolation" ON "notification_logs"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

CREATE POLICY "in_app_notifications_tenant_isolation" ON "in_app_notifications"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

CREATE POLICY "processed_events_tenant_isolation" ON "processed_events"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

CREATE POLICY "failed_notifications_tenant_isolation" ON "failed_notifications"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id" IS NULL
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

CREATE POLICY "tenant_admins_tenant_isolation" ON "tenant_admins"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );
