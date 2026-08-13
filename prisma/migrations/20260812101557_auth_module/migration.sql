-- CreateEnum
CREATE TYPE "OtpType" AS ENUM ('LOGIN', 'FORGOT_PASSWORD');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "auth_otps" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "type" "OtpType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_otps_identifier_idx" ON "auth_otps"("identifier");
