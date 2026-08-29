import { z } from "zod";

/** Validation and normalisation for an admin's pinned-chart selection.
 *
 * Kept out of the route so the rules can be tested without a database: the
 * route is then only wiring, and every decision about what is storable lives
 * here.
 */

/** A card key names an analytics block ("industry") or one question's chart
 *  ("question:<id>"). Deliberately a loose string rather than an enum — the
 *  analytics screen grows new blocks often, and a key that no longer resolves
 *  is skipped at render time rather than rejected on save. */
export const cardKeySchema = z.string().trim().min(1).max(200);

/** An upper bound well past any real dashboard (6 charts a page), so a bug or
 *  a hostile client cannot write unbounded rows. */
export const MAX_DASHBOARD_CARDS = 60;

export const dashboardSelectionSchema = z.object({
  cardKeys: z.array(cardKeySchema).max(MAX_DASHBOARD_CARDS),
});

export type DashboardSelection = z.infer<typeof dashboardSelectionSchema>;

/**
 * Cleans a submitted selection into the exact rows to persist.
 *
 * Duplicates are dropped rather than rejected: they would collide on the
 * (user, event, cardKey) unique index, and the same chart twice on a display
 * board is a mistake rather than a layout. Order is preserved, since it is
 * what the dashboard pages through.
 */
export function normalizeCardKeys(cardKeys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cardKeys) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** The rows for one admin's selection, positioned in the submitted order. */
export function toCardRows(
  userId: string,
  eventId: string,
  cardKeys: string[],
): Array<{ userId: string; eventId: string; cardKey: string; position: number }> {
  return normalizeCardKeys(cardKeys).map((cardKey, position) => ({
    userId,
    eventId,
    cardKey,
    position,
  }));
}
