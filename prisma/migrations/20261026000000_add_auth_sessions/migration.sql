-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "memberId" TEXT,
    "jtiHash" TEXT NOT NULL,
    "prevJtiHash" TEXT,
    "rotatedAt" TIMESTAMP(3),
    "userVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_sessions_adminUserId_idx" ON "auth_sessions"("adminUserId");

-- CreateIndex
CREATE INDEX "auth_sessions_memberId_idx" ON "auth_sessions"("memberId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A session belongs to exactly one principal (Prisma cannot express this CHECK).
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_one_principal_chk"
  CHECK (("adminUserId" IS NOT NULL) <> ("memberId" IS NOT NULL));
