/**
 * Imports table seating from an event's grouping spreadsheet.
 *
 *   npx tsx scripts/import-event-seating.ts "../Corpus Conclave - Grouping Lists.xlsx" "Corpus Conclave"
 *
 * The sheet lays tables out as a grid of blocks rather than one row per guest:
 * each block starts with a "Programme Focus" heading, then a "Table N" label,
 * then numbered rows of hosts and guests. This walks that grid, so re-exporting
 * the same sheet after edits and re-running is safe — seating is upserted per
 * (event, contact).
 *
 * Seating is analytics-only. Nothing in check-in, invitations or messaging
 * reads it; it exists so questionnaire results can be cut by table.
 */
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma.js";

/** Excel cells arrive as strings, rich text, or hyperlink objects. */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((r) => r.text).join("").trim();
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
    return "";
  }
  return String(value).trim();
}

/** Names are compared loosely: the sheet and the contact list disagree on
 *  spacing, capitalisation and punctuation for the same person. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface SeatedGuest {
  tableNumber: number;
  tableLabel: string;
  programmeFocus: string | null;
  name: string;
  organization: string;
  designation: string;
  seniorityBand: string | null;
}

/** Walks the sheet grid and returns one entry per seated guest. */
export function parseSeatingGrid(grid: string[][]): SeatedGuest[] {
  const guests: SeatedGuest[] = [];

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const label = (row[c] ?? "").trim();
      const match = /^Table\s+(\d+)$/i.exec(label);
      if (!match) continue;

      // The programme this table was themed around sits on the row above,
      // just right of the "Programme Focus" caption.
      const above = grid[r - 1] ?? [];
      let programmeFocus: string | null = null;
      for (let k = c; k < c + 3; k++) {
        const candidate = (above[k] ?? "").trim();
        if (candidate && !/^programme focus/i.test(candidate)) { programmeFocus = candidate; break; }
      }

      // Guest rows follow, numbered from 1, until the block runs out.
      for (let gr = r + 1; gr < r + 16 && gr < grid.length; gr++) {
        const cols = grid[gr] ?? [];
        const index = (cols[c - 1] ?? "").trim();
        const name = (cols[c] ?? "").trim();
        if (!/^\d+$/.test(index) || !name) continue;

        const organization = (cols[c + 1] ?? "").trim();
        const designation = (cols[c + 2] ?? "").trim();
        const seniorityBand = (cols[c + 3] ?? "").trim();

        // Faculty hosts and the student volunteer carry no organisation; only
        // industry guests are seated for analytics purposes.
        if (!organization && !designation) continue;
        if (/^student/i.test(designation)) continue;

        guests.push({
          tableNumber: Number(match[1]),
          tableLabel: label,
          programmeFocus,
          name,
          organization,
          designation,
          seniorityBand: seniorityBand || null,
        });
      }
    }
  }
  return guests;
}

async function main() {
  const [filePath, eventName] = process.argv.slice(2);
  if (!filePath || !eventName) {
    console.error('Usage: tsx scripts/import-event-seating.ts <xlsx path> "<event name>"');
    process.exit(1);
  }

  const event = await prisma.event.findFirst({ where: { name: eventName } });
  if (!event) throw new Error(`No event named "${eventName}".`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no sheets.");
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    grid[n - 1] = ((row.values as unknown[]) ?? []).slice(1).map(cellText);
  });

  const seated = parseSeatingGrid(grid);
  console.log(`Parsed ${seated.length} seated guests across ${new Set(seated.map((g) => g.tableNumber)).size} tables.`);

  const contacts = await prisma.contact.findMany({ select: { id: true, fullName: true, organization: true } });
  const byName = new Map(contacts.map((c) => [normalizeName(c.fullName), c]));
  const byOrg = new Map(
    contacts.filter((c) => c.organization).map((c) => [c.organization!.toLowerCase().trim(), c]),
  );

  let matched = 0;
  const unmatched: string[] = [];
  for (const guest of seated) {
    // Name first; organisation is the fallback, since the sheet and the guest
    // list occasionally spell the same person differently.
    const contact = byName.get(normalizeName(guest.name))
      ?? (guest.organization ? byOrg.get(guest.organization.toLowerCase().trim()) : undefined);
    if (!contact) { unmatched.push(`${guest.name} (${guest.organization})`); continue; }

    await prisma.eventSeating.upsert({
      where: { eventId_contactId: { eventId: event.id, contactId: contact.id } },
      create: {
        eventId: event.id,
        contactId: contact.id,
        tableNumber: guest.tableNumber,
        tableLabel: guest.tableLabel,
        programmeFocus: guest.programmeFocus,
        seniorityBand: guest.seniorityBand,
      },
      update: {
        tableNumber: guest.tableNumber,
        tableLabel: guest.tableLabel,
        programmeFocus: guest.programmeFocus,
        seniorityBand: guest.seniorityBand,
      },
    });
    matched++;
  }

  console.log(`Seated ${matched} guests.`);
  if (unmatched.length) {
    console.log(`\nNo matching contact for ${unmatched.length}:`);
    unmatched.forEach((u) => console.log(`  ${u}`));
  }
}

// Only run when invoked directly, so the parser can be unit tested.
if (process.argv[1]?.includes("import-event-seating")) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
