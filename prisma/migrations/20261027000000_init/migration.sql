-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "notice_category" AS ENUM ('GENERAL', 'AGM', 'CIRCULAR', 'URGENT', 'SCHEME_UPDATE');

-- CreateEnum
CREATE TYPE "notice_channel" AS ENUM ('WEBSITE', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "statement_status" AS ENUM ('PUBLISHED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "batch_status" AS ENUM ('PENDING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "pending_action_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "action_type" AS ENUM ('MEMBER_EDIT', 'MEMBER_STATUS_CHANGE', 'RATE_CHANGE', 'STATEMENT_BATCH_PUBLISH', 'LOAN_APPROVAL', 'LOAN_CLOSURE', 'DEPOSIT_SCHEME_CHANGE', 'MEMBER_CHANGE_REQUEST_APPROVAL');

-- CreateEnum
CREATE TYPE "loan_status" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'CLOSED', 'DEFAULTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "repayment_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "change_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "rate_entity_type" AS ENUM ('LOAN_TYPE', 'DEPOSIT_SCHEME');

-- CreateEnum
CREATE TYPE "sender_type" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "interest_type" AS ENUM ('FLAT', 'REDUCING');

-- CreateEnum
CREATE TYPE "deposit_type" AS ENUM ('SAVINGS', 'RD', 'FD');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('PENDING', 'COMMITTED', 'REJECTED');

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "membership_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "father_or_husband_name" TEXT,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "gender" "gender" NOT NULL,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT,
    "aadhaar_hash" TEXT NOT NULL,
    "aadhaar_encrypted" TEXT NOT NULL,
    "pan_encrypted" TEXT,
    "photo_url" TEXT,
    "nominee_name" TEXT,
    "nominee_relation" TEXT,
    "nominee_contact" TEXT,
    "membership_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "share_capital" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "member_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "password_hash" TEXT,
    "is_first_login" BOOLEAN NOT NULL DEFAULT true,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "session_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "admin_role" NOT NULL DEFAULT 'OPERATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_first_login" BOOLEAN NOT NULL DEFAULT true,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "session_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "member_id" TEXT,
    "jti_hash" TEXT NOT NULL,
    "prev_jti_hash" TEXT,
    "rotated_at" TIMESTAMP(3),
    "user_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statements" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "status" "statement_status" NOT NULL DEFAULT 'PUBLISHED',
    "uploaded_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "supersedes_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_batches" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "unmatched_list" JSONB NOT NULL,
    "matched_statements" JSONB NOT NULL,
    "status" "batch_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "statement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "notice_category" NOT NULL DEFAULT 'GENERAL',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "attachment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_deliveries" (
    "id" TEXT NOT NULL,
    "notice_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "channel" "notice_channel" NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interest_rate" DECIMAL(6,4) NOT NULL,
    "interest_type" "interest_type" NOT NULL DEFAULT 'REDUCING',
    "max_tenure" INTEGER,
    "processing_fee" DECIMAL(14,2) NOT NULL,
    "min_amount" DECIMAL(14,2) NOT NULL,
    "max_amount" DECIMAL(14,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_schemes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "deposit_type" NOT NULL DEFAULT 'SAVINGS',
    "interest_rate" DECIMAL(6,4) NOT NULL,
    "tenure_options" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_histories" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_type" "rate_entity_type" NOT NULL,
    "old_rate" DECIMAL(6,4),
    "new_rate" DECIMAL(6,4) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_loans" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "loan_type_id" TEXT NOT NULL,
    "rate_history_id" TEXT NOT NULL,
    "principal_amount" DECIMAL(14,2) NOT NULL,
    "outstanding_amount" DECIMAL(14,2) NOT NULL,
    "status" "loan_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "disbursed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_repayments" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "principal_part" DECIMAL(14,2) NOT NULL,
    "interest_part" DECIMAL(14,2) NOT NULL,
    "penalty_part" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "repayment_status" NOT NULL DEFAULT 'PENDING',
    "reference_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_actions" (
    "id" TEXT NOT NULL,
    "action_type" "action_type" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "pending_action_status" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_type" "sender_type" NOT NULL,
    "sender_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachment_url" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_change_requests" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT NOT NULL,
    "status" "change_request_status" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "invalid_rows" INTEGER NOT NULL,
    "preview_data" JSONB,
    "error_list" JSONB,
    "status" "import_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_membership_number_key" ON "members"("membership_number");

-- CreateIndex
CREATE UNIQUE INDEX "members_mobile_number_key" ON "members"("mobile_number");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "members_aadhaar_hash_key" ON "members"("aadhaar_hash");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_email_idx" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");

-- CreateIndex
CREATE INDEX "auth_sessions_admin_user_id_idx" ON "auth_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_member_id_idx" ON "auth_sessions"("member_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "statements_member_id_idx" ON "statements"("member_id");

-- CreateIndex
CREATE INDEX "statements_period_idx" ON "statements"("period");

-- CreateIndex
CREATE INDEX "statement_batches_created_by_id_idx" ON "statement_batches"("created_by_id");

-- CreateIndex
CREATE INDEX "statement_batches_status_idx" ON "statement_batches"("status");

-- CreateIndex
CREATE INDEX "notices_category_idx" ON "notices"("category");

-- CreateIndex
CREATE INDEX "notices_is_active_idx" ON "notices"("is_active");

-- CreateIndex
CREATE INDEX "notice_deliveries_member_id_idx" ON "notice_deliveries"("member_id");

-- CreateIndex
CREATE INDEX "notice_deliveries_status_idx" ON "notice_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notice_deliveries_notice_id_member_id_channel_key" ON "notice_deliveries"("notice_id", "member_id", "channel");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "loan_types_name_key" ON "loan_types"("name");

-- CreateIndex
CREATE INDEX "loan_types_is_active_idx" ON "loan_types"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_schemes_name_key" ON "deposit_schemes"("name");

-- CreateIndex
CREATE INDEX "deposit_schemes_is_active_idx" ON "deposit_schemes"("is_active");

-- CreateIndex
CREATE INDEX "rate_histories_entity_type_entity_id_idx" ON "rate_histories"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "rate_histories_effective_from_idx" ON "rate_histories"("effective_from");

-- CreateIndex
CREATE INDEX "member_loans_member_id_idx" ON "member_loans"("member_id");

-- CreateIndex
CREATE INDEX "member_loans_status_idx" ON "member_loans"("status");

-- CreateIndex
CREATE INDEX "loan_repayments_loan_id_idx" ON "loan_repayments"("loan_id");

-- CreateIndex
CREATE INDEX "loan_repayments_status_idx" ON "loan_repayments"("status");

-- CreateIndex
CREATE INDEX "pending_actions_status_idx" ON "pending_actions"("status");

-- CreateIndex
CREATE INDEX "pending_actions_action_type_idx" ON "pending_actions"("action_type");

-- CreateIndex
CREATE INDEX "pending_actions_requested_by_id_idx" ON "pending_actions"("requested_by_id");

-- CreateIndex
CREATE INDEX "support_tickets_member_id_idx" ON "support_tickets"("member_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticket_id_idx" ON "support_ticket_messages"("ticket_id");

-- CreateIndex
CREATE INDEX "member_change_requests_member_id_idx" ON "member_change_requests"("member_id");

-- CreateIndex
CREATE INDEX "member_change_requests_status_idx" ON "member_change_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "import_batches_created_by_id_idx" ON "import_batches"("created_by_id");

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_batches" ADD CONSTRAINT "statement_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_deliveries" ADD CONSTRAINT "notice_deliveries_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_deliveries" ADD CONSTRAINT "notice_deliveries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_histories" ADD CONSTRAINT "rate_histories_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_histories" ADD CONSTRAINT "rate_histories_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_loans" ADD CONSTRAINT "member_loans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_loans" ADD CONSTRAINT "member_loans_loan_type_id_fkey" FOREIGN KEY ("loan_type_id") REFERENCES "loan_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_loans" ADD CONSTRAINT "member_loans_rate_history_id_fkey" FOREIGN KEY ("rate_history_id") REFERENCES "rate_histories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "member_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_change_requests" ADD CONSTRAINT "member_change_requests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_change_requests" ADD CONSTRAINT "member_change_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A session belongs to exactly one principal (Prisma cannot express this CHECK).
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_one_principal_chk"
  CHECK (("admin_user_id" IS NOT NULL) <> ("member_id" IS NOT NULL));
