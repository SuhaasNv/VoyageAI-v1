-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hasOnboarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferences" JSONB;
