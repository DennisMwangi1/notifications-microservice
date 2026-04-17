ALTER TABLE "tenant_admins"
  ADD COLUMN IF NOT EXISTS "email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "must_reset_password" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "password_set_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "welcome_sent_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "welcome_delivery_status" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "welcome_delivery_error" TEXT;

UPDATE "tenant_admins"
SET "email" = COALESCE("email", "username" || '@pending.local')
WHERE "email" IS NULL;

ALTER TABLE "tenant_admins"
  ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_admins_tenant_id_email_key"
  ON "tenant_admins"("tenant_id", "email");

CREATE TABLE IF NOT EXISTS "operational_mailer_configs" (
  "id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "provider" "provider_type" NOT NULL,
  "api_key_ciphertext" TEXT NOT NULL,
  "api_key_last4" VARCHAR(8),
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "rotated_at" TIMESTAMP(6),
  "sender_email" VARCHAR(255),
  "sender_name" VARCHAR(255),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_mailer_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "operational_email_templates" (
  "id" UUID NOT NULL,
  "template_key" VARCHAR(120) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "subject_line" VARCHAR(255),
  "content_body" TEXT NOT NULL,
  "sample_data" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "operational_email_templates_template_key_key"
  ON "operational_email_templates"("template_key");
