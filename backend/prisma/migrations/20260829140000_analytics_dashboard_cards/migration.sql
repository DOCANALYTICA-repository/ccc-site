-- Per-admin selection of analytics charts pinned to their dashboard for one
-- event. Private per user: two admins curating the same event's display would
-- otherwise overwrite each other's layout.
CREATE TABLE "analytics_dashboard_cards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "card_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_dashboard_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_dashboard_cards_user_id_event_id_card_key_key"
    ON "analytics_dashboard_cards"("user_id", "event_id", "card_key");

CREATE INDEX "analytics_dashboard_cards_user_id_event_id_position_idx"
    ON "analytics_dashboard_cards"("user_id", "event_id", "position");

ALTER TABLE "analytics_dashboard_cards"
    ADD CONSTRAINT "analytics_dashboard_cards_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_dashboard_cards"
    ADD CONSTRAINT "analytics_dashboard_cards_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
