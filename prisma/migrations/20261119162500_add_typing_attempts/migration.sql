CREATE TYPE "TypingAttemptMode" AS ENUM ('PRACTICE', 'EXAM');

CREATE TABLE "TypingAttempt" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "passageContentHash" TEXT NOT NULL,
    "mode" "TypingAttemptMode" NOT NULL,
    "examVersionId" TEXT,
    "grossWpm" DOUBLE PRECISION NOT NULL,
    "netWpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "errorPercent" DOUBLE PRECISION NOT NULL,
    "keystrokes" INTEGER NOT NULL,
    "backspaceCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,
    "passedRule" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TypingAttempt_authUserId_passageId_createdAt_idx" ON "TypingAttempt"("authUserId", "passageId", "createdAt");

CREATE INDEX "TypingAttempt_authUserId_createdAt_idx" ON "TypingAttempt"("authUserId", "createdAt");

CREATE INDEX "TypingAttempt_passageId_mode_createdAt_idx" ON "TypingAttempt"("passageId", "mode", "createdAt");

ALTER TABLE "TypingAttempt" ADD CONSTRAINT "TypingAttempt_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TypingAttempt" ADD CONSTRAINT "TypingAttempt_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "TypingPassage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TypingAttempt" ADD CONSTRAINT "TypingAttempt_examVersionId_fkey" FOREIGN KEY ("examVersionId") REFERENCES "TypingExamVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
