-- Expand existing enums without rewriting historical rows.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEMBER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GUEST';
ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'REMOVED');
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "NotificationType" AS ENUM ('EVENT_INVITATION', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'NEW_MESSAGE', 'CATALOG_ACCESS', 'SURVEY_OPENED');

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contact_id" TEXT;
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_contact_id_key" ON "users"("contact_id");
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");
ALTER TABLE "users" ADD CONSTRAINT "users_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "login_attempts_email_attempted_at_idx";
ALTER TABLE "login_attempts" RENAME COLUMN "email_attempted" TO "identifier_attempted";
CREATE INDEX "login_attempts_identifier_attempted_at_idx" ON "login_attempts"("identifier_attempted", "at");
ALTER TABLE "event_invitations" ADD COLUMN "responded_at" TIMESTAMP(3);

CREATE TABLE "event_check_in_sessions" (
  "id" TEXT NOT NULL, "event_id" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "started_by" TEXT NOT NULL, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3), CONSTRAINT "event_check_in_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "event_check_in_sessions_event_id_is_active_idx" ON "event_check_in_sessions"("event_id", "is_active");
ALTER TABLE "event_check_in_sessions" ADD CONSTRAINT "event_check_in_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_check_in_sessions" ADD CONSTRAINT "event_check_in_sessions_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "network_profiles" (
  "user_id" TEXT NOT NULL, "display_name" TEXT NOT NULL, "organization" TEXT, "designation" TEXT,
  "headline" TEXT, "bio" TEXT, "public_email" CITEXT, "linkedin_url" TEXT, "avatar_path" TEXT,
  "discoverable" BOOLEAN NOT NULL DEFAULT false, "share_designation" BOOLEAN NOT NULL DEFAULT false,
  "share_headline" BOOLEAN NOT NULL DEFAULT false, "share_bio" BOOLEAN NOT NULL DEFAULT false,
  "share_email" BOOLEAN NOT NULL DEFAULT false, "share_linkedin" BOOLEAN NOT NULL DEFAULT false,
  "share_avatar" BOOLEAN NOT NULL DEFAULT false, "admin_visible" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "network_profiles_pkey" PRIMARY KEY ("user_id")
);
CREATE INDEX "network_profiles_discoverable_admin_visible_idx" ON "network_profiles"("discoverable", "admin_visible");
ALTER TABLE "network_profiles" ADD CONSTRAINT "network_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connections" (
  "id" TEXT NOT NULL, "pair_key" TEXT NOT NULL, "requester_id" TEXT NOT NULL, "recipient_id" TEXT NOT NULL,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING', "responded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "connections_pair_key_key" ON "connections"("pair_key");
CREATE INDEX "connections_requester_id_status_idx" ON "connections"("requester_id", "status");
CREATE INDEX "connections_recipient_id_status_idx" ON "connections"("recipient_id", "status");
ALTER TABLE "connections" ADD CONSTRAINT "connections_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connections" ADD CONSTRAINT "connections_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_blocks" (
  "blocker_id" TEXT NOT NULL, "blocked_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "conversations" (
  "id" TEXT NOT NULL, "connection_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversations_connection_id_key" ON "conversations"("connection_id");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "conversation_participants" (
  "conversation_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "last_read_at" TIMESTAMP(3),
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "messages" (
  "id" TEXT NOT NULL, "conversation_id" TEXT NOT NULL, "sender_id" TEXT NOT NULL, "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "type" "NotificationType" NOT NULL, "title" TEXT NOT NULL,
  "body" TEXT, "entity_type" TEXT, "entity_id" TEXT, "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "programs" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

CREATE TABLE "course_catalogs" (
  "id" TEXT NOT NULL, "program_id" TEXT NOT NULL, "title" TEXT NOT NULL, "academic_year" TEXT NOT NULL,
  "version" TEXT NOT NULL, "description" TEXT, "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "published_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "course_catalogs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "course_catalogs_status_academic_year_idx" ON "course_catalogs"("status", "academic_year");
CREATE UNIQUE INDEX "course_catalogs_program_id_academic_year_version_key" ON "course_catalogs"("program_id", "academic_year", "version");
ALTER TABLE "course_catalogs" ADD CONSTRAINT "course_catalogs_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "courses" (
  "id" TEXT NOT NULL, "catalog_id" TEXT NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL,
  "semester" INTEGER NOT NULL, "credits" INTEGER, "description" TEXT, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "courses_catalog_id_semester_position_idx" ON "courses"("catalog_id", "semester", "position");
CREATE UNIQUE INDEX "courses_catalog_id_code_key" ON "courses"("catalog_id", "code");
ALTER TABLE "courses" ADD CONSTRAINT "courses_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "course_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "course_modules" (
  "id" TEXT NOT NULL, "course_id" TEXT NOT NULL, "title" TEXT NOT NULL, "content" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "course_modules_course_id_position_idx" ON "course_modules"("course_id", "position");
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "course_resources" (
  "id" TEXT NOT NULL, "course_id" TEXT NOT NULL, "title" TEXT NOT NULL, "resource_type" TEXT NOT NULL,
  "storage_path" TEXT, "external_url" TEXT, "mime_type" TEXT, "size_bytes" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "course_resources_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "course_resources_course_id_idx" ON "course_resources"("course_id");
ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "access_groups" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "access_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "access_groups_name_key" ON "access_groups"("name");
CREATE TABLE "access_group_members" (
  "group_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, CONSTRAINT "access_group_members_pkey" PRIMARY KEY ("group_id","user_id")
);
CREATE INDEX "access_group_members_user_id_idx" ON "access_group_members"("user_id");
ALTER TABLE "access_group_members" ADD CONSTRAINT "access_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "access_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_group_members" ADD CONSTRAINT "access_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "catalog_grants" (
  "id" TEXT NOT NULL, "catalog_id" TEXT NOT NULL, "user_id" TEXT, "group_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "catalog_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_grants_one_target" CHECK ((("user_id" IS NOT NULL)::int + ("group_id" IS NOT NULL)::int) = 1)
);
CREATE INDEX "catalog_grants_user_id_idx" ON "catalog_grants"("user_id");
CREATE INDEX "catalog_grants_group_id_idx" ON "catalog_grants"("group_id");
CREATE UNIQUE INDEX "catalog_grants_catalog_id_user_id_key" ON "catalog_grants"("catalog_id", "user_id");
CREATE UNIQUE INDEX "catalog_grants_catalog_id_group_id_key" ON "catalog_grants"("catalog_id", "group_id");
ALTER TABLE "catalog_grants" ADD CONSTRAINT "catalog_grants_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "course_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_grants" ADD CONSTRAINT "catalog_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_grants" ADD CONSTRAINT "catalog_grants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "access_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "survey_templates" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_templates_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "survey_template_questions" (
  "id" TEXT NOT NULL, "template_id" TEXT NOT NULL, "prompt" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "survey_template_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "survey_template_questions_template_id_position_idx" ON "survey_template_questions"("template_id", "position");
ALTER TABLE "survey_template_questions" ADD CONSTRAINT "survey_template_questions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "survey_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "event_surveys" (
  "id" TEXT NOT NULL, "event_id" TEXT NOT NULL, "template_id" TEXT, "title" TEXT NOT NULL,
  "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT', "opened_at" TIMESTAMP(3), "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_surveys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_surveys_event_id_key" ON "event_surveys"("event_id");
ALTER TABLE "event_surveys" ADD CONSTRAINT "event_surveys_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_surveys" ADD CONSTRAINT "event_surveys_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "survey_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "event_survey_questions" (
  "id" TEXT NOT NULL, "survey_id" TEXT NOT NULL, "prompt" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "event_survey_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "event_survey_questions_survey_id_position_idx" ON "event_survey_questions"("survey_id", "position");
ALTER TABLE "event_survey_questions" ADD CONSTRAINT "event_survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "event_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "survey_responses" (
  "id" TEXT NOT NULL, "survey_id" TEXT NOT NULL, "invitation_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "survey_responses_invitation_id_key" ON "survey_responses"("invitation_id");
CREATE INDEX "survey_responses_survey_id_user_id_idx" ON "survey_responses"("survey_id", "user_id");
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "event_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "event_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "survey_answers" (
  "response_id" TEXT NOT NULL, "question_id" TEXT NOT NULL, "value" BOOLEAN NOT NULL,
  CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("response_id","question_id")
);
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "survey_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "event_survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase private Broadcast authorization. This block is skipped on local
-- PostgreSQL installations that do not have the realtime schema.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'realtime') THEN
    EXECUTE 'CREATE POLICY "conversation_participants_receive" ON realtime.messages FOR SELECT TO authenticated USING (
      extension = ''broadcast'' AND EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.user_id = auth.uid()::text
          AND ''conversation:'' || cp.conversation_id = realtime.topic()
      )
    )';
  END IF;
END $$;
