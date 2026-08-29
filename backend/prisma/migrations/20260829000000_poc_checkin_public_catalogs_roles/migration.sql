-- CreateEnum
CREATE TYPE "CheckInSessionMode" AS ENUM ('GUEST_SCAN', 'POC_PORTAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'FACULTY';
ALTER TYPE "Role" ADD VALUE 'STUDENT';

-- DropIndex
DROP INDEX "event_check_in_sessions_event_id_is_active_idx";

-- AlterTable
ALTER TABLE "course_catalogs" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "event_check_in_sessions" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "mode" "CheckInSessionMode" NOT NULL DEFAULT 'GUEST_SCAN',
ADD COLUMN     "passcode_hash" TEXT;

-- AlterTable
ALTER TABLE "invitation_status_history" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bootstrap_code" TEXT;

-- CreateIndex
CREATE INDEX "event_check_in_sessions_event_id_mode_is_active_idx" ON "event_check_in_sessions"("event_id", "mode", "is_active");

