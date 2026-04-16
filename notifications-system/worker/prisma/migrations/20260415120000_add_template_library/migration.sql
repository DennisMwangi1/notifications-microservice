CREATE TABLE "template_library" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "channel_type" "channel_enum" NOT NULL,
    "subject_line" VARCHAR(255),
    "content_body" TEXT NOT NULL,
    "sample_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "template_library_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "template_library_channel_type_idx" ON "template_library"("channel_type");
