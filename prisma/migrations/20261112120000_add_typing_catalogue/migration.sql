CREATE TYPE "TypingContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

CREATE TYPE "TypingBackspacePolicy" AS ENUM ('UNRESTRICTED', 'DISABLED', 'CURRENT_WORD_ONLY');

CREATE TYPE "TypingPassageSourceKind" AS ENUM ('OFFICIAL_PREVIOUS_YEAR', 'RECONSTRUCTED', 'PRACTICE');

CREATE TABLE "TypingExam" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypingExam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TypingExamVersion" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "TypingContentStatus" NOT NULL DEFAULT 'DRAFT',
    "examYear" INTEGER,
    "durationSeconds" INTEGER,
    "backspacePolicy" "TypingBackspacePolicy",
    "editingPolicy" TEXT,
    "scoringMethod" TEXT,
    "targetWpm" INTEGER,
    "maxErrorPercent" DOUBLE PRECISION,
    "targetKeystrokes" INTEGER,
    "instructions" TEXT,
    "ruleSourceUrl" TEXT,
    "ruleSourceNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypingExamVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TypingPassage" (
    "id" TEXT NOT NULL,
    "examVersionId" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceKind" "TypingPassageSourceKind" NOT NULL,
    "status" "TypingContentStatus" NOT NULL DEFAULT 'DRAFT',
    "examYear" INTEGER,
    "shift" TEXT,
    "sourceUrl" TEXT,
    "sourceNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypingPassage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TypingExam_slug_key" ON "TypingExam"("slug");

CREATE UNIQUE INDEX "TypingExamVersion_examId_versionKey_key" ON "TypingExamVersion"("examId", "versionKey");
CREATE INDEX "TypingExamVersion_examId_status_idx" ON "TypingExamVersion"("examId", "status");

CREATE UNIQUE INDEX "TypingPassage_examVersionId_contentKey_revision_key" ON "TypingPassage"("examVersionId", "contentKey", "revision");
CREATE INDEX "TypingPassage_examVersionId_status_idx" ON "TypingPassage"("examVersionId", "status");

ALTER TABLE "TypingExamVersion" ADD CONSTRAINT "TypingExamVersion_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "TypingExam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TypingPassage" ADD CONSTRAINT "TypingPassage_examVersionId_fkey"
    FOREIGN KEY ("examVersionId") REFERENCES "TypingExamVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
