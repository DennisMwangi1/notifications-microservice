DO $$
BEGIN
  CREATE TYPE "template_scope_enum" AS ENUM ('PLATFORM_DEFAULT', 'TENANT_OVERRIDE', 'TENANT_CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "actor_type_enum" AS ENUM ('PLATFORM_OPERATOR', 'TENANT_ADMIN', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "notification_logs"
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID;

ALTER TABLE "notification_logs"
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "notification_logs_tenant_id_sent_at_idx"
  ON "notification_logs"("tenant_id", "sent_at");

ALTER TABLE "templates"
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "event_type" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "target_ws_channel" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "scope" "template_scope_enum" NOT NULL DEFAULT 'TENANT_CUSTOM';

UPDATE "templates"
SET "scope" = CASE
  WHEN "tenant_id" IS NULL THEN 'PLATFORM_DEFAULT'::"template_scope_enum"
  ELSE 'TENANT_CUSTOM'::"template_scope_enum"
END
WHERE "scope" IS NULL OR "scope" = 'TENANT_CUSTOM';

CREATE INDEX IF NOT EXISTS "templates_tenant_id_event_type_channel_type_scope_is_active_idx"
  ON "templates"("tenant_id", "event_type", "channel_type", "scope", "is_active");

CREATE INDEX IF NOT EXISTS "templates_scope_event_type_channel_type_is_active_idx"
  ON "templates"("scope", "event_type", "channel_type", "is_active");

ALTER TABLE "template_library"
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID;

CREATE INDEX IF NOT EXISTS "template_library_tenant_id_channel_type_idx"
  ON "template_library"("tenant_id", "channel_type");

ALTER TABLE "provider_configs"
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "api_key_ciphertext" TEXT,
  ADD COLUMN IF NOT EXISTS "api_key_last4" VARCHAR(8),
  ADD COLUMN IF NOT EXISTS "key_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "rotated_at" TIMESTAMP(6);

CREATE INDEX IF NOT EXISTS "provider_configs_tenant_id_provider_idx"
  ON "provider_configs"("tenant_id", "provider");

CREATE TABLE IF NOT EXISTS "audit_logs" (
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

CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_created_at_idx"
  ON "audit_logs"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "audit_logs_resource_type_resource_id_idx"
  ON "audit_logs"("resource_type", "resource_id");

CREATE TABLE IF NOT EXISTS "tenant_admins" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "username" VARCHAR(150) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "tenant_admins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tenant_admins_tenant_id_is_active_idx"
  ON "tenant_admins"("tenant_id", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_admins_tenant_id_username_key"
  ON "tenant_admins"("tenant_id", "username");

ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template_library" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "in_app_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processed_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "failed_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_admins" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_tenant_isolation" ON "templates";
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

DROP POLICY IF EXISTS "template_library_tenant_isolation" ON "template_library";
CREATE POLICY "template_library_tenant_isolation" ON "template_library"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

DROP POLICY IF EXISTS "provider_configs_tenant_isolation" ON "provider_configs";
CREATE POLICY "provider_configs_tenant_isolation" ON "provider_configs"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

DROP POLICY IF EXISTS "notification_logs_tenant_isolation" ON "notification_logs";
CREATE POLICY "notification_logs_tenant_isolation" ON "notification_logs"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

DROP POLICY IF EXISTS "in_app_notifications_tenant_isolation" ON "in_app_notifications";
CREATE POLICY "in_app_notifications_tenant_isolation" ON "in_app_notifications"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

DROP POLICY IF EXISTS "processed_events_tenant_isolation" ON "processed_events";
CREATE POLICY "processed_events_tenant_isolation" ON "processed_events"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

DROP POLICY IF EXISTS "failed_notifications_tenant_isolation" ON "failed_notifications";
CREATE POLICY "failed_notifications_tenant_isolation" ON "failed_notifications"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON "audit_logs";
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

DROP POLICY IF EXISTS "tenant_admins_tenant_isolation" ON "tenant_admins";
CREATE POLICY "tenant_admins_tenant_isolation" ON "tenant_admins"
  USING (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.current_actor_type', true) = 'platform_operator'
    OR "tenant_id"::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );
