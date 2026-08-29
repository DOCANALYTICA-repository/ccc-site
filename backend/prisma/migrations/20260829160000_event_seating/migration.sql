-- Table seating imported from the event's grouping sheet. Analytics-only:
-- nothing in check-in, invitations or messaging reads this.
CREATE TABLE "event_seatings" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "table_number" INTEGER NOT NULL,
    "table_label" TEXT NOT NULL,
    "programme_focus" TEXT,
    "seniority_band" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_seatings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_seatings_event_id_contact_id_key"
    ON "event_seatings"("event_id", "contact_id");

CREATE INDEX "event_seatings_event_id_table_number_idx"
    ON "event_seatings"("event_id", "table_number");

ALTER TABLE "event_seatings"
    ADD CONSTRAINT "event_seatings_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_seatings"
    ADD CONSTRAINT "event_seatings_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
