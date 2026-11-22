/**
 * Import the sales manager's Excel workbook into the staff portal.
 *
 *   npx tsx scripts/import-workbook.ts <path/to/workbook.xlsx> --dry-run
 *   npx tsx scripts/import-workbook.ts <path/to/workbook.xlsx>
 *
 * Options
 *   --dry-run            parse and report only; nothing is written
 *   --year 2026          year for d/m dates without a year
 *   --window 2026-06-01:2026-11-30
 *                        plausible date range used to un-swap Excel day/month dates
 *   --details            print every inferred/rejected date and phone in the report
 *
 * Imports (idempotent: each row has an import_ref, re-running skips rows already imported)
 *   leads     <- "Interested", "The Interested", "Social" (merged by phone number)
 *   students  <- "Our Students" (agreed fee, schedule, next payment; the sheet's
 *                "Paid" column is NOT turned into payments — kept as a note)
 *   teachers  <- emirate tabs + "Online Teachers" (merged by phone number)
 *   staff     <- sales rep names found in "Our Students" (no login; invite later)
 * Not imported: "Payments" and "Sheet2" (found unreliable) — summarised in the report.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from the
 * environment or .env.local) unless --dry-run. Runs with the service role, so
 * the audit log records these rows as "Import / system".
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  mergeLeadsByPhone,
  newDateContext,
  parseLeadSheet,
  parseStudentsSheet,
  parseTeacherSheet,
  summariseLedgerSheet,
  type Cell,
  type Grid,
  type LeadRow,
  type TeacherRow,
} from "./lib/workbook-parse";

const LEAD_TABS = ["Interested", "The Interested", "Social"];
const STUDENT_TAB = "Our Students";
const TEACHER_TABS = ["Dubai", "Sharjah", "Ajman", "Al Ain", "Abu Dhabi", "Online Teachers"];
const LEDGER_TABS = ["Payments", "Sheet2"];

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function cellValue(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

/** Worksheet -> 0-based grid aligned to A1 (so row numbers match Excel). */
function toGrid(ws: XLSX.WorkSheet): Grid {
  const ref = ws["!ref"];
  if (!ref) return [];
  const start = XLSX.utils.decode_range(ref).s;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true, UTC: true });
  const grid: Grid = Array.from({ length: start.r }, () => []);
  for (const r of rows) grid.push([...Array<Cell>(start.c).fill(null), ...r.map(cellValue)]);
  return grid;
}

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        /* ignore */
      }
    }
  }
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const file = process.argv[2];
  const dry = process.argv.includes("--dry-run");
  const details = process.argv.includes("--details");
  if (!file || file.startsWith("--")) {
    console.error("Usage: npx tsx scripts/import-workbook.ts <workbook.xlsx> [--dry-run] [--year 2026] [--window 2026-06-01:2026-11-30]");
    process.exit(1);
  }
  const year = Number(arg("--year") ?? 2026);
  const [winStart, winEnd] = (arg("--window") ?? `${year}-06-01:${year}-11-30`).split(":");

  const wb = XLSX.read(readFileSync(path.resolve(file)), { cellDates: true, cellFormula: false });
  const sheetNames = wb.SheetNames;
  const grid = (name: string) => {
    const ws = wb.Sheets[name];
    return ws ? toGrid(ws) : null;
  };

  // ---- parse --------------------------------------------------------------
  const report: string[] = [];
  const log = (s = "") => report.push(s);
  log(`Workbook: ${path.basename(file)} — tabs: ${sheetNames.join(", ")}`);
  log(`Date window for un-swapping Excel dates: ${winStart} .. ${winEnd}`);
  log("");

  const allLeads: LeadRow[] = [];
  for (const tab of LEAD_TABS) {
    const g = grid(tab);
    if (!g) {
      log(`! Lead tab "${tab}" not found — skipped`);
      continue;
    }
    const { rows, skipped } = parseLeadSheet(tab, g, newDateContext(year, winStart, winEnd));
    allLeads.push(...rows);
    const swapped = rows.filter((r) => r.dateNote?.includes("swapped")).length;
    const inferred = rows.filter((r) => r.dateNote?.startsWith("Day ")).length;
    const undated = rows.filter((r) => !r.date).length;
    const noName = rows.filter((r) => r.name.startsWith("Unknown (")).length;
    const badPhone = rows.filter((r) => r.phoneNote).length;
    log(
      `Leads · ${tab}: ${rows.length} rows (${noName} without a name, ${badPhone} odd phone numbers, ${undated} undated, ${swapped} day/month-swapped dates, ${inferred} day-only dates placed from rows above; ${skipped} note-only rows skipped)`,
    );
    if (details) for (const r of rows) if (r.dateNote || r.phoneNote) log(`    row ${r.rowNo}: ${[r.dateNote, r.phoneNote].filter(Boolean).join("; ")}`);
  }
  const { leads, merged } = mergeLeadsByPhone(allLeads);
  log(`Leads total: ${allLeads.length} rows -> ${leads.length} leads after merging ${merged} duplicate phone numbers across tabs`);
  log("");

  const sg = grid(STUDENT_TAB);
  const students = sg ? parseStudentsSheet(sg, year) : { rows: [], skipped: 0 };
  if (!sg) log(`! "${STUDENT_TAB}" tab not found`);
  const sheetPaid = students.rows.reduce((a, r) => a + (r.sheetPaid ?? 0), 0);
  const fees = students.rows.reduce((a, r) => a + (r.agreedFee ?? 0), 0);
  log(
    `Students · ${STUDENT_TAB}: ${students.rows.length} students (${students.rows.filter((r) => r.agreedFee === null).length} without a usable course cost; ${students.skipped} non-empty rows without a name skipped)`,
  );
  log(`  agreed fees total AED ${fees.toFixed(2)}; the sheet's "Paid" column claims AED ${sheetPaid.toFixed(2)} — NOT imported as payments`);
  const studentDateNotes = students.rows.flatMap((r) => r.notes.filter((n) => n.includes("date")));
  log(`  ${studentDateNotes.length} date notes (swapped / invalid / outside window)`);
  if (details) for (const r of students.rows) if (r.notes.length) log(`    row ${r.rowNo}: ${r.notes.join("; ")}`);
  const repNames = [...new Set(students.rows.map((r) => r.rep).filter(Boolean) as string[])];
  log(`  sales reps found: ${repNames.join(", ") || "none"}`);
  const studentPhones = new Set(students.rows.map((r) => r.phone).filter(Boolean));
  log(`  ${leads.filter((l) => l.phone && studentPhones.has(l.phone)).length} leads share a phone with a student (will be linked and marked enrolled)`);
  log("");

  const teacherRows: TeacherRow[] = [];
  for (const tab of TEACHER_TABS) {
    const g = grid(tab);
    if (!g) {
      log(`! Teacher tab "${tab}" not found — skipped`);
      continue;
    }
    const { rows, skipped } = parseTeacherSheet(tab, g);
    teacherRows.push(...rows);
    log(`Teachers · ${tab}: ${rows.length} rows${skipped ? ` (${skipped} skipped)` : ""}`);
  }
  const teacherByKey = new Map<string, TeacherRow>();
  for (const t of teacherRows) {
    const key = t.phone && /^\+\d{9,}$/.test(t.phone) ? t.phone : `${norm(t.name)}|${norm(t.emirate)}`;
    const ex = teacherByKey.get(key);
    if (ex) {
      ex.notes = `${ex.notes} · also listed in "${t.sheet}"`;
      if (t.emirate && !norm(ex.emirate).includes(norm(t.emirate))) ex.emirate = `${ex.emirate} / ${t.emirate}`;
    } else teacherByKey.set(key, { ...t });
  }
  const teachers = [...teacherByKey.values()];
  const studentTeacherNames = [...new Set(students.rows.map((r) => r.teacher).filter(Boolean) as string[])];
  const findTeacher = (name: string) => {
    const n = norm(name);
    return (
      teachers.find((t) => norm(t.name) === n) ??
      teachers.find((t) => norm(t.name).split(" ")[0] === n.split(" ")[0] && n.split(" ").length === 1)
    );
  };
  const missingTeachers = studentTeacherNames.filter((n) => !findTeacher(n));
  log(`Teachers total: ${teacherRows.length} rows -> ${teachers.length} after merging by phone`);
  log(`  teachers named in "Our Students" but not in the directory (will be created): ${missingTeachers.join(", ") || "none"}`);
  log("");

  log("NOT imported (unreliable) — for reconciliation only:");
  for (const tab of LEDGER_TABS) {
    const g = grid(tab);
    if (!g) {
      log(`  "${tab}" not found`);
      continue;
    }
    const s = summariseLedgerSheet(tab, g, year);
    log(
      `  ${tab}: ${s.rows} rows ${s.firstDate ?? "?"}..${s.lastDate ?? "?"}; received AED ${s.received.toFixed(2)}, teacher ${s.teacher.toFixed(2)}, commission/sent ${s.commission.toFixed(2)}, academy ${s.academy.toFixed(2)}; ${s.splitMismatches} rows where received ≠ teacher+commission+academy, ${s.swappedDates} swapped dates, ${s.undatedRows} undated, ${s.unparsedAmounts} non-numeric amounts`,
    );
  }
  log("  -> Record verified payments in the portal and match them to the Wio statement instead.");

  console.log(report.join("\n"));
  if (dry) {
    console.log("\nDry run: nothing was written.");
    return;
  }

  // ---- write --------------------------------------------------------------
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\nSet NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run).");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await write(db, { leads, students: students.rows, teachers, repNames, findTeacher });
}

async function write(
  db: SupabaseClient,
  d: {
    leads: ReturnType<typeof mergeLeadsByPhone>["leads"];
    students: ReturnType<typeof parseStudentsSheet>["rows"];
    teachers: TeacherRow[];
    repNames: string[];
    findTeacher: (n: string) => TeacherRow | undefined;
  },
) {
  const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  };

  // staff (reps without login)
  const staff = must(await db.from("staff").select("id, full_name"), "read staff") as Array<{ id: string; full_name: string }>;
  const repId = new Map(staff.map((s) => [norm(s.full_name), s.id]));
  for (const name of d.repNames) {
    if (repId.has(norm(name))) continue;
    const row = must(await db.from("staff").insert({ full_name: name, role: "sales", active: true }).select("id").single(), `add rep ${name}`) as { id: string };
    repId.set(norm(name), row.id);
    console.log(`+ staff (no login yet): ${name}`);
  }

  // teachers
  const teacherRows = d.teachers.map((t) => ({
    name: t.name,
    phone: t.phone,
    nationality: t.nationality,
    emirate: t.emirate,
    subjects: t.subjects,
    rate_note: t.rateNote,
    notes: t.notes,
    active: true,
    import_ref: t.ref,
  }));
  for (const n of [...new Set(d.students.map((s) => s.teacher).filter(Boolean) as string[])]) {
    if (!d.findTeacher(n)) teacherRows.push({ name: n, phone: null, nationality: null, emirate: null, subjects: null, rate_note: null, notes: 'Named in "Our Students"; not in the teacher directory', active: true, import_ref: `wb:teacher-name:${norm(n)}` });
  }
  must(await db.from("teachers").upsert(teacherRows, { onConflict: "import_ref", ignoreDuplicates: true }), "teachers");
  const allTeachers = must(await db.from("teachers").select("id, name, import_ref"), "read teachers") as Array<{ id: string; name: string; import_ref: string | null }>;
  const teacherIdByRef = new Map(allTeachers.filter((t) => t.import_ref).map((t) => [t.import_ref as string, t.id]));
  const teacherIdFor = (name: string | null) => {
    if (!name) return null;
    const t = d.findTeacher(name);
    return teacherIdByRef.get(t ? t.ref : `wb:teacher-name:${norm(name)}`) ?? null;
  };
  console.log(`teachers: ${teacherRows.length} offered (existing import refs skipped)`);

  // leads
  const studentPhones = new Set(d.students.map((s) => s.phone).filter(Boolean));
  const existingLeads = new Set(
    (must(await db.from("leads").select("import_ref").not("import_ref", "is", null), "read leads") as Array<{ import_ref: string }>).map((l) => l.import_ref),
  );
  const newLeads = d.leads.filter((l) => !existingLeads.has(l.ref));
  let leadCount = 0;
  for (let i = 0; i < newLeads.length; i += 200) {
    const chunk = newLeads.slice(i, i + 200);
    const inserted = must(
      await db
        .from("leads")
        .upsert(
          chunk.map((l) => ({
            name: l.name,
            phone: l.phone,
            source: l.source,
            emirate: l.emirate,
            interest: l.note ? l.note.slice(0, 200) : null,
            stage: l.phone && studentPhones.has(l.phone) ? "enrolled" : l.action ? "contacted" : "new",
            first_contact_on: l.date,
            import_ref: l.ref,
          })),
          { onConflict: "import_ref", ignoreDuplicates: true },
        )
        .select("id, import_ref"),
      "leads",
    ) as Array<{ id: string; import_ref: string }>;
    leadCount += inserted.length;
    const idByRef = new Map(inserted.map((x) => [x.import_ref, x.id]));
    const notes = chunk.flatMap((l) => {
      const id = idByRef.get(l.ref);
      if (!id) return [];
      const body = [
        `Imported from the manager's sheet, "${l.sheet}" row ${l.rowNo}.`,
        l.note ? `Note: ${l.note}` : null,
        l.action ? `Action: ${l.action}` : null,
        l.dateNote ? `Date: ${l.dateNote}` : null,
        l.phoneNote,
        ...l.extraNotes,
      ]
        .filter(Boolean)
        .join("\n");
      return [{ lead_id: id, body, kind: "import" }];
    });
    if (notes.length) must(await db.from("lead_notes").insert(notes), "lead notes");
  }
  console.log(`leads: ${leadCount} inserted, ${d.leads.length - newLeads.length} already imported`);

  // students
  const leadIdByPhone = new Map(
    (must(await db.from("leads").select("id, phone").not("phone", "is", null), "read lead phones") as Array<{ id: string; phone: string }>).map((l) => [l.phone, l.id]),
  );
  const studentRows = d.students.map((s) => ({
    name: s.name,
    phone: s.phone,
    rep_id: s.rep ? repId.get(norm(s.rep)) ?? null : null,
    teacher_id: teacherIdFor(s.teacher),
    course: s.details,
    agreed_fee: s.agreedFee ?? 0,
    schedule: s.schedule,
    start_date: s.startDate,
    next_payment_amount: s.nextPayment,
    next_payment_date: s.nextPaymentDate,
    status: "active",
    notes: [`Imported from "Our Students" row ${s.rowNo}.`, ...s.notes].join("\n"),
    lead_id: s.phone ? leadIdByPhone.get(s.phone) ?? null : null,
    import_ref: s.ref,
  }));
  const ins = must(await db.from("students").upsert(studentRows, { onConflict: "import_ref", ignoreDuplicates: true }).select("id"), "students") as Array<{ id: string }>;
  console.log(`students: ${ins.length} inserted, ${studentRows.length - ins.length} already imported`);
  console.log("\nDone. Check Leads and Students in the portal, then invite the reps from Settings → Staff.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
