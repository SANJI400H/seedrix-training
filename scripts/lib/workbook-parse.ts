/**
 * Pure parsing for the manager's Excel workbook (see scripts/import-workbook.ts).
 * No I/O here so it can be unit-tested with plain arrays.
 */

export type Cell = string | number | boolean | Date | null;
export type Grid = Cell[][];

// ---------------------------------------------------------------------------
// Text / numbers / phones
// ---------------------------------------------------------------------------

export function text(v: Cell | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s || /^[—–\-_\\/.]+$/.test(s)) return null;
  return s;
}

/** Numbers like 1400, "1,400", "1400 AED". Returns null for "Not paid", "—" etc. */
export function amount(v: Cell | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const s = text(v);
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/^(?:AED\s*)?(\d+(?:\.\d+)?)\s*(?:AED|dhs?|dirhams?)?$/i);
  return m ? Math.round(Number(m[1]) * 100) / 100 : null;
}

export type Phone = { e164: string | null; raw: string | null; note: string | null };

/** UAE-first phone normalisation; keeps the raw value when unsure. */
export function phone(v: Cell | undefined): Phone {
  const raw = text(v);
  if (!raw) return { e164: null, raw: null, note: null };
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^5\d{8}$/.test(d)) return { e164: "+971" + d, raw, note: null };
  if (/^05\d{8}$/.test(d)) return { e164: "+971" + d.slice(1), raw, note: null };
  if (/^9715\d{8}$/.test(d)) return { e164: "+" + d, raw, note: null };
  if (/^(20|212|966|962|963|249|63|91|92)\d{8,10}$/.test(d)) return { e164: "+" + d, raw, note: null };
  return { e164: null, raw, note: `Phone "${raw}" doesn't look like a complete number` };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export type DateContext = {
  year: number;
  windowStart: string; // inclusive ISO
  windowEnd: string; // inclusive ISO
  prev: string | null; // last resolved date in this column
};

export type DateResult = { iso: string | null; note: string | null; swapped: boolean };

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function valid(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const dayDist = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

export function newDateContext(year = 2026, windowStart = "2026-06-01", windowEnd = "2026-11-30"): DateContext {
  return { year, windowStart, windowEnd, prev: null };
}

/**
 * Resolve a date cell from the workbook.
 * - "22/6", "13/9/2026": day/month text (the sheet is written d/m).
 * - Excel datetime cells: the author typed d/m and Excel may have stored it as
 *   m/d (e.g. 2026-01-09 meaning 1 Sep). If only one reading falls inside the
 *   plausible window it wins; if both do, the one nearest the previous row's
 *   date wins (falling back to the swapped reading).
 * - a bare day number (1..31) continues the month of the rows above; a big
 *   drop (e.g. 30 -> 1) moves to the next month.
 * The original text is always returned in `note` when anything was inferred.
 */
export function resolveDate(v: Cell | undefined, ctx: DateContext): DateResult {
  const inWin = (s: string) => s >= ctx.windowStart && s <= ctx.windowEnd;
  const done = (r: DateResult) => {
    if (r.iso) ctx.prev = r.iso;
    return r;
  };
  if (v === null || v === undefined || v === "") return { iso: null, note: null, swapped: false };

  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = v.getUTCMonth() + 1;
    const d = v.getUTCDate();
    const orig = iso(y, m, d);
    const canSwap = d <= 12 && valid(y, d, m) && d !== m;
    const swapped = canSwap ? iso(y, d, m) : null;
    const origOk = inWin(orig);
    const swapOk = swapped ? inWin(swapped) : false;
    let pick: string;
    let isSwap = false;
    if (origOk && !swapOk) pick = orig;
    else if (swapOk && !origOk) {
      pick = swapped!;
      isSwap = true;
    } else if (origOk && swapOk) {
      if (ctx.prev && dayDist(orig, ctx.prev) < dayDist(swapped!, ctx.prev)) pick = orig;
      else {
        pick = swapped!;
        isSwap = true;
      }
    } else {
      return done({ iso: orig, swapped: false, note: `Date ${orig} is outside ${ctx.windowStart}..${ctx.windowEnd}; kept as stored` });
    }
    return done({
      iso: pick,
      swapped: isSwap,
      note: isSwap ? `Sheet cell ${orig} read as ${pick} (day/month swapped by Excel)` : null,
    });
  }

  if (typeof v === "number") {
    const day = Math.trunc(v);
    if (v !== day || day < 1 || day > 31) return { iso: null, note: `Unrecognised date "${v}"`, swapped: false };
    if (!ctx.prev) return { iso: null, note: `Day "${v}" with no month above it`, swapped: false };
    let y = Number(ctx.prev.slice(0, 4));
    let m = Number(ctx.prev.slice(5, 7));
    const prevDay = Number(ctx.prev.slice(8, 10));
    if (day < prevDay - 7) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    if (!valid(y, m, day)) return { iso: null, note: `Day "${v}" is not a valid date in ${iso(y, m, 1).slice(0, 7)}`, swapped: false };
    const r = iso(y, m, day);
    return done({ iso: r, swapped: false, note: `Day "${v}" read as ${r} from the rows above` });
  }

  const s = text(v);
  if (!s) return { iso: null, note: null, swapped: false };
  const m = s.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?:\s*[/.\-]\s*(\d{2,4}))?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : ctx.year;
    if (y < 100) y += 2000;
    if (!valid(y, mo, d)) return { iso: null, note: `"${s}" is not a real date`, swapped: false };
    return done({ iso: iso(y, mo, d), swapped: false, note: null });
  }
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) return resolveDate(new Date(Date.UTC(+isoM[1], +isoM[2] - 1, +isoM[3])), ctx);
  return { iso: null, note: `Unrecognised date "${s}"`, swapped: false };
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

/** Find the header row (first row containing all `must` labels) and map label -> column index. */
export function findHeader(grid: Grid, must: string[], maxScan = 10) {
  for (let r = 0; r < Math.min(grid.length, maxScan); r++) {
    const labels = (grid[r] ?? []).map((c) => (text(c) ?? "").toLowerCase());
    if (must.every((m) => labels.some((l) => l === m.toLowerCase()))) {
      const cols = new Map<string, number>();
      labels.forEach((l, i) => {
        if (l && !cols.has(l)) cols.set(l, i);
      });
      return { row: r, cols };
    }
  }
  return null;
}

function col(cols: Map<string, number>, ...names: string[]) {
  for (const n of names) {
    const i = cols.get(n.toLowerCase());
    if (i !== undefined) return i;
  }
  return -1;
}

const at = (row: Cell[], i: number) => (i >= 0 ? (row[i] ?? null) : null);

export type LeadRow = {
  ref: string;
  sheet: string;
  rowNo: number;
  name: string;
  phone: string | null;
  phoneNote: string | null;
  emirate: string | null;
  source: "social" | "other";
  date: string | null;
  dateNote: string | null;
  note: string | null;
  action: string | null;
};

export function parseLeadSheet(sheet: string, grid: Grid, ctx: DateContext): { rows: LeadRow[]; skipped: number } {
  const h = findHeader(grid, ["Name"]);
  if (!h) return { rows: [], skipped: 0 };
  const cDate = col(h.cols, "Date");
  const cName = col(h.cols, "Name");
  const cPhone = col(h.cols, "Number", "Mobile number", "Phone number", "Phone");
  const cNote = col(h.cols, "Note", "Details");
  const cAction = col(h.cols, "Action");
  const cEmirate = col(h.cols, "Emirate");
  const rows: LeadRow[] = [];
  let skipped = 0;
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = text(at(row, cName));
    const ph = phone(at(row, cPhone));
    const note = text(at(row, cNote));
    const action = text(at(row, cAction));
    const dateRes = resolveDate(at(row, cDate), ctx);
    if (!name && !ph.raw) {
      if (note || action) skipped++;
      continue;
    }
    rows.push({
      ref: `wb:${sheet}:${r + 1}`,
      sheet,
      rowNo: r + 1,
      name: name ?? `Unknown (${ph.raw})`,
      phone: ph.e164 ?? ph.raw,
      phoneNote: ph.note,
      emirate: text(at(row, cEmirate)),
      source: sheet.toLowerCase() === "social" ? "social" : "other",
      date: dateRes.iso,
      dateNote: dateRes.note,
      note,
      action,
    });
  }
  return { rows, skipped };
}

export type StudentRow = {
  ref: string;
  rowNo: number;
  name: string;
  phone: string | null;
  phoneNote: string | null;
  rep: string | null;
  teacher: string | null;
  agreedFee: number | null;
  sheetPaidText: string | null;
  sheetPaid: number | null;
  nextPayment: number | null;
  nextPaymentDate: string | null;
  schedule: string | null;
  details: string | null;
  startDate: string | null;
  notes: string[];
};

export function parseStudentsSheet(grid: Grid, year = 2026): { rows: StudentRow[]; skipped: number } {
  const h = findHeader(grid, ["Name", "Sales"]);
  if (!h) return { rows: [], skipped: 0 };
  const c = {
    date: col(h.cols, "Date"),
    name: col(h.cols, "Name"),
    phone: col(h.cols, "Number", "Phone number"),
    rep: col(h.cols, "Sales"),
    teacher: col(h.cols, "Teacher"),
    fee: col(h.cols, "Course cost"),
    paid: col(h.cols, "Paid"),
    next: col(h.cols, "Next payment"),
    nextDate: col(h.cols, "Next payment date"),
    schedule: col(h.cols, "Schedule"),
    details: col(h.cols, "Course details"),
  };
  const startCtx = newDateContext(year);
  const nextCtx = newDateContext(year, `${year}-06-01`, `${year}-12-31`);
  const rows: StudentRow[] = [];
  let skipped = 0;
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = text(at(row, c.name));
    if (!name) {
      if (row.some((v) => text(v))) skipped++;
      continue;
    }
    const notes: string[] = [];
    const ph = phone(at(row, c.phone));
    if (ph.note) notes.push(ph.note);
    const start = resolveDate(at(row, c.date), startCtx);
    if (start.note) notes.push(`Start date: ${start.note}`);
    const nd = resolveDate(at(row, c.nextDate), nextCtx);
    if (nd.note) notes.push(`Next payment date: ${nd.note}`);
    const feeText = text(at(row, c.fee));
    const fee = amount(at(row, c.fee));
    if (feeText && fee === null) notes.push(`Course cost in sheet: "${feeText}"`);
    const paidText = text(at(row, c.paid));
    const paid = amount(at(row, c.paid));
    if (paidText) notes.push(`Sheet said paid: "${paidText}" — not imported as a payment; record verified payments in the portal.`);
    rows.push({
      ref: `wb:Our Students:${r + 1}`,
      rowNo: r + 1,
      name,
      phone: ph.e164 ?? ph.raw,
      phoneNote: ph.note,
      rep: text(at(row, c.rep)),
      teacher: text(at(row, c.teacher)),
      agreedFee: fee,
      sheetPaidText: paidText,
      sheetPaid: paid,
      nextPayment: amount(at(row, c.next)),
      nextPaymentDate: nd.iso,
      schedule: text(at(row, c.schedule)),
      details: text(at(row, c.details)),
      startDate: start.iso,
      notes,
    });
  }
  return { rows, skipped };
}

export type TeacherRow = {
  ref: string;
  sheet: string;
  name: string;
  phone: string | null;
  nationality: string | null;
  emirate: string | null;
  subjects: string | null;
  rateNote: string | null;
  notes: string | null;
};

export function parseTeacherSheet(sheet: string, grid: Grid): { rows: TeacherRow[]; skipped: number } {
  const h = findHeader(grid, ["Name", "Nationality"]);
  if (!h) return { rows: [], skipped: 0 };
  const c = {
    name: col(h.cols, "Name"),
    nat: col(h.cols, "Nationality"),
    emirate: col(h.cols, "Emirate"),
    phone: col(h.cols, "Phone number", "Number"),
    subject: col(h.cols, "Subject"),
    rate: col(h.cols, "Price", "Hourly rate"),
    status: col(h.cols, "Status"),
  };
  const online = /online/i.test(sheet);
  const rows: TeacherRow[] = [];
  let skipped = 0;
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = text(at(row, c.name));
    const ph = phone(at(row, c.phone));
    if (!name && !ph.raw) {
      if (row.some((v) => text(v))) skipped++;
      continue;
    }
    const rate = text(at(row, c.rate));
    const status = text(at(row, c.status));
    rows.push({
      ref: `wb:${sheet}:${r + 1}`,
      sheet,
      name: name ?? `Unknown (${ph.raw})`,
      phone: ph.e164 ?? ph.raw,
      nationality: text(at(row, c.nat)),
      emirate: online ? "Online" : text(at(row, c.emirate)) ?? sheet,
      subjects: text(at(row, c.subject)),
      rateNote: rate ? `${rate}${online ? " (hourly, currency not stated in sheet)" : ""}` : null,
      notes: [status && !/^\d+$/.test(status) ? `Status in sheet: ${status}` : null, `Imported from "${sheet}" tab`]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return { rows, skipped };
}

export type LedgerSheetSummary = {
  sheet: string;
  rows: number;
  received: number;
  teacher: number;
  commission: number;
  academy: number;
  unparsedAmounts: number;
  swappedDates: number;
  undatedRows: number;
  splitMismatches: number;
  firstDate: string | null;
  lastDate: string | null;
};

/** Payments / Sheet2 are NOT imported (found unreliable); summarise them for the dry-run report. */
export function summariseLedgerSheet(sheet: string, grid: Grid, year = 2026): LedgerSheetSummary {
  const h = findHeader(grid, ["Client name"]);
  const s: LedgerSheetSummary = {
    sheet,
    rows: 0,
    received: 0,
    teacher: 0,
    commission: 0,
    academy: 0,
    unparsedAmounts: 0,
    swappedDates: 0,
    undatedRows: 0,
    splitMismatches: 0,
    firstDate: null,
    lastDate: null,
  };
  if (!h) return s;
  const c = {
    date: col(h.cols, "Date"),
    client: col(h.cols, "Client name"),
    received: col(h.cols, "Transferred (received)", "Paid"),
    teacher: col(h.cols, "Teacher", "Teacher's account"),
    commission: col(h.cols, "Sent", "Commission"),
    academy: col(h.cols, "To academy", "Institute's share"),
  };
  const ctx = newDateContext(year);
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (!text(at(row, c.client))) continue;
    s.rows++;
    const d = resolveDate(at(row, c.date), ctx);
    if (d.swapped) s.swappedDates++;
    if (!d.iso) s.undatedRows++;
    else {
      if (!s.firstDate || d.iso < s.firstDate) s.firstDate = d.iso;
      if (!s.lastDate || d.iso > s.lastDate) s.lastDate = d.iso;
    }
    const rec = amount(at(row, c.received));
    const t = amount(at(row, c.teacher)) ?? 0;
    const cm = amount(at(row, c.commission)) ?? 0;
    const ac = amount(at(row, c.academy)) ?? 0;
    if (rec === null) {
      if (text(at(row, c.received))) s.unparsedAmounts++;
      continue;
    }
    s.received += rec;
    s.teacher += t;
    s.commission += cm;
    s.academy += ac;
    if (Math.round((rec - t - cm - ac) * 100) !== 0) s.splitMismatches++;
  }
  for (const k of ["received", "teacher", "commission", "academy"] as const) s[k] = Math.round(s[k] * 100) / 100;
  return s;
}

/** Merge leads that share a phone number across tabs (first row wins, notes concatenated). */
export function mergeLeadsByPhone(rows: LeadRow[]) {
  const byPhone = new Map<string, LeadRow & { mergedRefs: string[]; extraNotes: string[] }>();
  const out: Array<LeadRow & { mergedRefs: string[]; extraNotes: string[] }> = [];
  let merged = 0;
  for (const r of rows) {
    const key = r.phone && /^\+\d{9,}$/.test(r.phone) ? r.phone : null;
    const existing = key ? byPhone.get(key) : undefined;
    if (existing) {
      merged++;
      existing.mergedRefs.push(r.ref);
      existing.extraNotes.push(
        [`Also in "${r.sheet}" row ${r.rowNo}${r.date ? ` (${r.date})` : ""}`, r.note, r.action ? `Action: ${r.action}` : null]
          .filter(Boolean)
          .join(" — "),
      );
      if (!existing.emirate && r.emirate) existing.emirate = r.emirate;
      continue;
    }
    const item = { ...r, mergedRefs: [], extraNotes: [] };
    if (key) byPhone.set(key, item);
    out.push(item);
  }
  return { leads: out, merged };
}
