UPDATE "templates"
SET "scope" = 'TENANT_CUSTOM'
WHERE "tenant_id" IS NOT NULL
  AND "scope" = 'TENANT_OVERRIDE';
