import { useRef, useState } from "react";
import { api, downloadFile, downloadUrl } from "@/lib/api";
import { useQuery, invalidateQueries } from "@/hooks/useQuery";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, Micro } from "@/components/ui/Card";
import {
  cleanCell,
  parsePhoneCell,
  parseEmailCell,
  normalizeProfileUrl,
  guessFieldForHeader,
  type FieldKey,
  type ParsedImportRow,
} from "@/lib/importNormalize";
import type { EventRecord } from "@/lib/types";

type Step = "upload" | "mapping" | "preview" | "result";

interface DetectedColumn {
  index: number;
  header: string;
  field: FieldKey;
}

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: "fullName", label: "Full name" },
  { value: "organization", label: "Organization" },
  { value: "designation", label: "Position" },
  { value: "profileUrl", label: "Profile URL" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "dietaryNotes", label: "Food preference" },
  { value: "ignore", label: "— Ignore —" },
];

function cellText(value: unknown): string {
  if (value && typeof value === "object" && "text" in value) return String((value as { text: unknown }).text);
  if (value && typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return value == null ? "" : String(value);
}

// Small RFC 4180-compatible parser for browser-side CSV imports. It handles
// quoted commas, escaped quotes, and CRLF files without adding another bundle.
function parseCsv(input: string): string[][] {
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === "," || char === "\t") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((value) => value.trim())) table.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) table.push(row);
  }
  return table;
}

export function Import() {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [columns, setColumns] = useState<DetectedColumn[]>([]);
  const [rawRows, setRawRows] = useState<Record<number, unknown>[]>([]);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"SKIP" | "UPDATE" | "CREATE_ANYWAY">("SKIP");
  const eventsQuery = useQuery("/events", () => api.get<{ events: EventRecord[] }>("/events"));
  const events = eventsQuery.data?.events ?? [];
  const [inviteToEventId, setInviteToEventId] = useState<string>("");
  const [committing, setCommitting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    batchId: string;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    invited: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);


  async function onFileSelected(file: File) {
    setParsing(true);
    setParseError(null);
    setFilename(file.name);
    try {
      let headers: string[];
      let collected: Record<number, unknown>[];

      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        const table = parseCsv(text);
        headers = table[0] ?? [];
        collected = table.slice(1).map((values) =>
          Object.fromEntries(values.map((value, index) => [index + 1, value])),
        );
      } else if (/\.xlsx$/i.test(file.name)) {
        // Lazy-loaded — ExcelJS is ~1MB and only the Import page needs it.
        const { default: ExcelJS } = await import("exceljs");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (!ws) throw new Error("The workbook does not contain a worksheet.");
        headers = [];
        ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
          headers[colNumber - 1] = cellText(cell.value);
        });
        collected = [];
        // Scan the used range and drop empty rows; some exports report a much
        // larger used range than their actual contact list.
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return;
          const values: Record<number, unknown> = {};
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            values[colNumber] = cell.value;
          });
          if (Object.keys(values).length > 0) collected.push(values);
        });
      } else {
        throw new Error("Please choose a .csv or .xlsx file.");
      }

      const detected = headers
        .map((header, index) => ({ index: index + 1, header: header.trim(), field: guessFieldForHeader(header) }))
        .filter((column) => column.header);
      if (!detected.length) throw new Error("The first row must contain contact column headers.");
      setColumns(detected);
      setRawRows(collected);
      setStep("mapping");
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "This file could not be parsed.");
      setStep("upload");
    } finally {
      setParsing(false);
    }
  }

  function buildRows(cols: DetectedColumn[]) {
    const parsed: ParsedImportRow[] = [];
    rawRows.forEach((raw, i) => {
      const get = (field: FieldKey) => {
        const col = cols.find((c) => c.field === field);
        return col ? raw[col.index] : undefined;
      };

      const nameCell = get("fullName");
      const fullName = cleanCell(nameCell);
      if (!fullName && Object.values(raw).every((v) => v === null || v === undefined || v === "")) return;

      const phoneCell = get("phone");
      const phoneResult = parsePhoneCell(phoneCell, typeof phoneCell === "number");
      const emailResult = parseEmailCell(get("email"));
      const flagReasons: string[] = [];
      if (phoneResult.flagged) flagReasons.push("Phone couldn't be parsed — kept as raw text.");
      if (emailResult.flagged) flagReasons.push("Email format looks off.");
      if (!fullName) flagReasons.push("Missing name — this row will fail on commit.");

      parsed.push({
        rowIndex: i,
        fullName,
        organization: cleanCell(get("organization")),
        designation: cleanCell(get("designation")),
        profileUrl: normalizeProfileUrl(get("profileUrl")),
        email: emailResult.primary,
        altEmail: emailResult.alt,
        phone: phoneResult.primary,
        altPhone: phoneResult.alt,
        phoneRaw: phoneResult.raw,
        dietaryNotes: cleanCell(get("dietaryNotes")),
        flagged: flagReasons.length > 0,
        flagReasons,
      });
    });
    setRows(parsed);
  }

  function onConfirmMapping() {
    buildRows(columns);
    setStep("preview");
  }

  async function onCommit() {
    setCommitting(true);
    try {
      const res = await api.post<typeof result>("/import/commit", {
        filename,
        rows,
        duplicateStrategy,
        inviteToEventId: inviteToEventId || null,
      });
      setResult(res);
      setStep("result");
      // An import rewrites the directory and can add invitations, so drop the
      // cached views of both rather than showing pre-import counts.
      invalidateQueries("/contacts");
      invalidateQueries("/events");
      invalidateQueries("/dashboard");
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setStep("upload");
    setColumns([]);
    setRawRows([]);
    setRows([]);
    setResult(null);
    setParseError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const flaggedCount = rows.filter((r) => r.flagged).length;
  const validCount = rows.filter((r) => r.fullName).length;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Import contacts</h1>
        <p className="text-sm text-ink-muted">Upload an Excel or CSV export. Only the name column is required.</p>
      </div>

      {step === "upload" && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>1. Upload a file</CardTitle>
            <a
              className="text-xs font-medium text-accent-ink"
              href={downloadUrl("/import/template")}
              onClick={(e) => {
                e.preventDefault();
                downloadFile("/import/template", "ccc-contact-import-template.xlsx");
              }}
            >
              Download blank template
            </a>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileSelected(f);
            }}
            className="tap-target block w-full rounded-control border border-dashed border-hairline bg-page px-4 py-8 text-center text-sm text-ink-muted"
          />
          {parsing && <p className="mt-3 text-sm text-ink-muted">Reading {filename}…</p>}
          {parseError && <p className="mt-3 text-sm text-accent-ink">{parseError}</p>}
          <p className="mt-3 text-xs text-ink-muted">
            Recognized columns: {FIELD_OPTIONS.filter((f) => f.value !== "ignore").map((f) => f.label).join(", ")}.
            Column headers don't need to match exactly — close names are auto-matched, and anything else can be
            mapped by hand on the next step.
          </p>
        </Card>
      )}

      {step === "mapping" && (
        <Card>
          <CardTitle>2. Map columns</CardTitle>
          <p className="mb-4 mt-1 text-xs text-ink-muted">
            {filename} · {rawRows.length} data rows detected
          </p>
          <div className="space-y-2">
            {columns.map((col, i) => (
              <div key={col.index} className="flex items-center gap-3 rounded-control bg-page px-3 py-2">
                <span className="flex-1 truncate text-sm text-ink">{col.header}</span>
                <select
                  value={col.field}
                  onChange={(e) => {
                    const next = [...columns];
                    next[i] = { ...col, field: e.target.value as FieldKey };
                    setColumns(next);
                  }}
                  className="tap-target rounded-control border border-hairline bg-surface px-2 py-1.5 text-sm"
                >
                  {FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {!columns.some((c) => c.field === "fullName") && (
            <p className="mt-3 text-sm text-accent-ink">Map a column to "Full name" to continue.</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>
              Start over
            </Button>
            <Button onClick={onConfirmMapping} disabled={!columns.some((c) => c.field === "fullName")}>
              Preview
            </Button>
          </div>
        </Card>
      )}

      {step === "preview" && (
        <Card>
          <CardTitle>3. Preview & confirm</CardTitle>
          <div className="mb-4 mt-2 grid grid-cols-3 gap-3 text-center">
            <div>
              <Micro>Total rows</Micro>
              <p className="text-lg font-semibold text-ink">{rows.length}</p>
            </div>
            <div>
              <Micro>Ready</Micro>
              <p className="text-lg font-semibold text-ink">{validCount}</p>
            </div>
            <div>
              <Micro>Flagged for review</Micro>
              <p className="text-lg font-semibold text-status-confirmed-fg">{flaggedCount}</p>
            </div>
          </div>

          <div className="mb-4 overflow-x-auto rounded-control border border-hairline">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-hairline bg-page text-left uppercase tracking-wide text-ink-muted">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Org</th>
                  <th className="px-2 py-2">Phone</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.rowIndex} className="border-b border-hairline last:border-0">
                    <td className="px-2 py-1.5 text-ink">{r.fullName ?? <em className="text-accent-ink">missing</em>}</td>
                    <td className="px-2 py-1.5 text-ink-muted">{r.organization ?? "—"}</td>
                    <td className="px-2 py-1.5 text-ink-muted">{r.phone ?? r.phoneRaw ?? "—"}</td>
                    <td className="px-2 py-1.5 text-ink-muted">{r.email ?? "—"}</td>
                    <td className="px-2 py-1.5 text-status-confirmed-fg">{r.flagReasons.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <p className="mb-4 text-xs text-ink-muted">Showing the first 10 of {rows.length} rows.</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Micro className="mb-1">If a match already exists</Micro>
              <select
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value as typeof duplicateStrategy)}
                className="tap-target w-full rounded-control border border-hairline bg-surface px-3 py-2 text-sm"
              >
                <option value="SKIP">Skip</option>
                <option value="UPDATE">Update existing</option>
                <option value="CREATE_ANYWAY">Create anyway</option>
              </select>
            </div>
            <div>
              <Micro className="mb-1">Also invite to event (optional)</Micro>
              <select
                value={inviteToEventId}
                onChange={(e) => setInviteToEventId(e.target.value)}
                className="tap-target w-full rounded-control border border-hairline bg-surface px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep("mapping")}>
              Back
            </Button>
            <Button onClick={onCommit} disabled={committing || validCount === 0}>
              {committing ? "Importing…" : `Import ${validCount} contacts`}
            </Button>
          </div>
        </Card>
      )}

      {step === "result" && result && (
        <Card>
          <CardTitle>Import complete</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Created" value={result.created} />
            <Stat label="Updated" value={result.updated} />
            <Stat label="Skipped" value={result.skipped} />
            <Stat label="Failed" value={result.failed} />
          </div>
          {result.invited > 0 && (
            <p className="mt-3 text-sm text-ink-muted">Invited {result.invited} of them to the selected event.</p>
          )}
          {result.failed > 0 && (
            <button
              className="mt-3 text-sm font-medium text-accent-ink"
              onClick={() => downloadFile(`/import/batches/${result.batchId}/errors.xlsx`, "import-errors.xlsx")}
            >
              Download failed rows
            </button>
          )}
          <div className="mt-5">
            <Button onClick={reset}>Import another file</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control bg-page px-3 py-3 text-center">
      <p className="text-xl font-semibold text-ink">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</p>
    </div>
  );
}
