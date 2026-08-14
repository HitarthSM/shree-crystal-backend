-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('FLAT', 'REDUCING');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('SAVINGS', 'RD', 'FD');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'COMMITTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'MEMBER_EDIT';

-- DropForeignKey
ALTER TABLE "rate_history" DROP CONSTRAINT "rate_history_deposit_scheme_fk";

-- DropForeignKey
ALTER TABLE "rate_history" DROP CONSTRAINT "rate_history_loan_type_fk";

-- DropForeignKey
ALTER TABLE "rate_history" DROP CONSTRAINT "rate_history_setByAdminId_fkey";

-- DropIndex
DROP INDEX "deposit_schemes_isActive_idx";

-- DropIndex
DROP INDEX "loan_types_isActive_idx";

-- DropIndex
DROP INDEX "members_memberNumber_idx";

-- DropIndex
DROP INDEX "members_memberNumber_key";

-- DropIndex
DROP INDEX "members_phone_key";

-- DropIndex
DROP INDEX "rate_history_effectiveTo_idx";

-- DropIndex
DROP INDEX "rate_history_entityType_entityId_idx";

-- AlterTable
ALTER TABLE "deposit_schemes" DROP COLUMN "defaultInterestRate",
DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "tenureMonths",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "interestRate" DECIMAL(6,4) NOT NULL,
ADD COLUMN     "tenureOptions" JSONB,
ADD COLUMN     "type" "DepositType" NOT NULL DEFAULT 'SAVINGS';

-- AlterTable
ALTER TABLE "loan_types" DROP COLUMN "defaultInterestRate",
DROP COLUMN "defaultPenaltyRate",
DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "maxTenureMonths",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "interestRate" DECIMAL(6,4) NOT NULL,
ADD COLUMN     "interestType" "InterestType" NOT NULL DEFAULT 'REDUCING',
ADD COLUMN     "maxAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "maxTenure" INTEGER,
ADD COLUMN     "minAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "processingFee" DECIMAL(14,2) NOT NULL;

-- AlterTable
ALTER TABLE "members" DROP COLUMN "address",
DROP COLUMN "joinedAt",
DROP COLUMN "memberNumber",
DROP COLUMN "name",
DROP COLUMN "phone",
DROP COLUMN "profilePhotoUrl",
ADD COLUMN     "aadhaarHash" TEXT NOT NULL,
ADD COLUMN     "addressLine1" TEXT NOT NULL,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "dob" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fatherOrHusbandName" TEXT,
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "gender" "Gender" NOT NULL,
ADD COLUMN     "memberId" TEXT NOT NULL,
ADD COLUMN     "membershipDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mobile" TEXT NOT NULL,
ADD COLUMN     "nomineeContact" TEXT,
ADD COLUMN     "nomineeName" TEXT,
ADD COLUMN     "nomineeRelation" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "pincode" TEXT NOT NULL,
ADD COLUMN     "shareCapital" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "state" TEXT NOT NULL,
ALTER COLUMN "aadhaar_encrypted" SET NOT NULL;

-- AlterTable
ALTER TABLE "query_messages" DROP COLUMN "body",
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "message" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rate_history" DROP COLUMN "effectiveTo",
DROP COLUMN "entityId",
DROP COLUMN "entityType",
DROP COLUMN "interestRate",
DROP COLUMN "penaltyRate",
DROP COLUMN "setByAdminId",
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "changedById" TEXT NOT NULL,
ADD COLUMN     "newRate" DECIMAL(6,4) NOT NULL,
ADD COLUMN     "oldRate" DECIMAL(6,4),
ADD COLUMN     "schemeId" TEXT NOT NULL,
ADD COLUMN     "schemeType" "RateEntityType" NOT NULL,
ALTER COLUMN "effectiveFrom" DROP DEFAULT;

-- AlterTable
ALTER TABLE "statements" ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "supersedesId" TEXT,
ADD COLUMN     "uploadedById" TEXT NOT NULL,
ALTER COLUMN "publishedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "support_queries" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "statement_batches" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedList" JSONB NOT NULL,
    "matchedStatements" JSONB NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "statement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "previewData" JSONB,
    "errorList" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statement_batches_adminId_idx" ON "statement_batches"("adminId");

-- CreateIndex
CREATE INDEX "statement_batches_status_idx" ON "statement_batches"("status");

-- CreateIndex
CREATE INDEX "import_batches_adminId_idx" ON "import_batches"("adminId");

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");

-- CreateIndex
CREATE INDEX "deposit_schemes_active_idx" ON "deposit_schemes"("active");

-- CreateIndex
CREATE INDEX "loan_types_active_idx" ON "loan_types"("active");

-- CreateIndex
CREATE UNIQUE INDEX "members_memberId_key" ON "members"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "members_mobile_key" ON "members"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "members_aadhaarHash_key" ON "members"("aadhaarHash");

-- CreateIndex
CREATE INDEX "members_memberId_idx" ON "members"("memberId");

-- CreateIndex
CREATE INDEX "rate_history_schemeType_schemeId_idx" ON "rate_history"("schemeType", "schemeId");

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_batches" ADD CONSTRAINT "statement_batches_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_history" ADD CONSTRAINT "rate_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_history" ADD CONSTRAINT "rate_history_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

