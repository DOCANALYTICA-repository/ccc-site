import { describe, expect, it } from "vitest";
import { parseSeatingGrid } from "./import-event-seating.js";

/** The grouping sheet is a grid of table blocks rather than one row per guest,
 *  so the parser is the part most likely to break on a re-export. These
 *  fixtures mirror the real sheet's shape. */

/** Builds a block at a column offset: heading, label, then numbered rows. */
function block(cols: number, rows: string[][]): string[][] {
  return rows.map((r) => [...Array<string>(cols).fill(""), ...r]);
}

function merge(...grids: string[][][]): string[][] {
  const out: string[][] = [];
  for (const grid of grids) {
    grid.forEach((row, i) => {
      const target = out[i] ?? (out[i] = []);
      row.forEach((cell, j) => { if (cell) target[j] = cell; });
    });
  }
  return out;
}

const TABLE_ONE = block(0, [
  ["", "Programme Focus", "BCOM (AFA)"],
  ["", "Table 1"],
  ["1", "Dr. Faculty Person", "", "Student:", "A Student"],
  ["2", "Dr. Second Faculty"],
  ["3", "Ullas M Shripathi Roa", "Synechron", "Assistant Director", "7. Associate Director / AVP"],
  ["4", "Chandrashekar BU", "Synopsys", "Senior Architect", "5. VP / Senior Director"],
]);

const TABLE_TWO = block(7, [
  ["", "Programme Focus", "MCOM"],
  ["", "Table 6"],
  ["1", "Dr. Third Faculty", "", "Student:", "B Student"],
  ["3", "Gargi verma", "SA global", "HR HEAD", "6. Director / Function Head"],
]);

describe("parseSeatingGrid", () => {
  const guests = parseSeatingGrid(merge(TABLE_ONE, TABLE_TWO));

  it("reads every industry guest across side-by-side blocks", () => {
    expect(guests).toHaveLength(3);
    expect(guests.map((g) => g.name).sort()).toEqual([
      "Chandrashekar BU", "Gargi verma", "Ullas M Shripathi Roa",
    ]);
  });

  it("takes the table number from its label", () => {
    expect(guests.find((g) => g.name === "Ullas M Shripathi Roa")?.tableNumber).toBe(1);
    expect(guests.find((g) => g.name === "Gargi verma")?.tableNumber).toBe(6);
  });

  it("picks up the programme focus from the row above each label", () => {
    expect(guests.find((g) => g.tableNumber === 1)?.programmeFocus).toBe("BCOM (AFA)");
    expect(guests.find((g) => g.tableNumber === 6)?.programmeFocus).toBe("MCOM");
  });

  it("keeps the organisers' seniority banding verbatim", () => {
    expect(guests.find((g) => g.name === "Chandrashekar BU")?.seniorityBand).toBe("5. VP / Senior Director");
  });

  it("skips faculty hosts and the student volunteer", () => {
    // Faculty rows carry no organisation, and the student is labelled as one.
    expect(guests.some((g) => g.name.startsWith("Dr."))).toBe(false);
    expect(guests.some((g) => g.name === "A Student")).toBe(false);
  });

  it("records a guest with no seniority band as null rather than empty text", () => {
    const noBand = parseSeatingGrid(block(0, [
      ["", "Programme Focus", "BCOM"],
      ["", "Table 9"],
      ["3", "Sambhav jain", "Zeiss", "Head of marketing", ""],
    ]));
    expect(noBand[0]?.seniorityBand).toBeNull();
  });

  it("returns nothing for a sheet with no table labels", () => {
    expect(parseSeatingGrid([["Name", "Org"], ["Someone", "Somewhere"]])).toEqual([]);
    expect(parseSeatingGrid([])).toEqual([]);
  });

  it("ignores a heading that only looks like a table label", () => {
    const grid = block(0, [
      ["", "Programme Focus", "BCOM"],
      ["", "Table of contents"],
      ["3", "Someone", "Somewhere", "Role", ""],
    ]);
    expect(parseSeatingGrid(grid)).toEqual([]);
  });
});
