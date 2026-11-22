import { describe, expect, it } from "vitest";
import {
  amount,
  mergeLeadsByPhone,
  newDateContext,
  parseTeacherName,
  parseLeadSheet,
  parseStudentsSheet,
  phone,
  resolveDate,
  summariseLedgerSheet,
} from "./workbook-parse";

const xl = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("resolveDate", () => {
  it("reads d/m text as day/month", () => {
    const ctx = newDateContext();
    expect(resolveDate("22/6", ctx).iso).toBe("2026-06-22");
    expect(resolveDate("13/9/2026", ctx).iso).toBe("2026-09-13");
  });

  it("rejects impossible dates like 31/9", () => {
    const r = resolveDate("31/9", newDateContext());
    expect(r.iso).toBeNull();
    expect(r.note).toMatch(/not a real date/);
  });

  it("swaps an Excel date that is only plausible swapped (2026-01-09 means 1 Sep)", () => {
    const r = resolveDate(xl(2026, 1, 9), newDateContext());
    expect(r).toMatchObject({ iso: "2026-09-01", swapped: true });
    expect(r.note).toMatch(/2026-01-09/);
  });

  it("keeps an Excel date that is only plausible as stored", () => {
    // 2026-10-13 cannot be swapped (no month 13)
    expect(resolveDate(xl(2026, 10, 13), newDateContext())).toMatchObject({ iso: "2026-10-13", swapped: false });
  });

  it("uses the previous row when both readings are plausible", () => {
    const ctx = newDateContext();
    resolveDate("13/8", ctx);
    // 2026-10-08 could be 8 Oct or 10 Aug; rows around it are mid-August
    expect(resolveDate(xl(2026, 10, 8), ctx)).toMatchObject({ iso: "2026-08-10", swapped: true });
    const ctx2 = newDateContext();
    resolveDate("5/10", ctx2);
    expect(resolveDate(xl(2026, 10, 8), ctx2)).toMatchObject({ iso: "2026-10-08", swapped: false });
  });

  it("continues a month from bare day numbers and rolls over on a big drop", () => {
    const ctx = newDateContext();
    resolveDate("30/6", ctx);
    expect(resolveDate(1, ctx).iso).toBe("2026-07-01");
    expect(resolveDate(4, ctx).iso).toBe("2026-07-04");
    expect(resolveDate(2, ctx).iso).toBe("2026-07-02"); // small step back stays in July
    expect(resolveDate(30, ctx).iso).toBe("2026-07-30");
    expect(resolveDate(1, ctx).iso).toBe("2026-08-01");
  });

  it("can't place a bare day with no month above", () => {
    expect(resolveDate(5, newDateContext()).iso).toBeNull();
  });
});

describe("phone + amount", () => {
  it("normalises UAE and foreign numbers", () => {
    expect(phone(561180187).e164).toBe("+971561180187");
    expect(phone("050 123 4567").e164).toBe("+971501234567");
    expect(phone(201271993475).e164).toBe("+201271993475");
    expect(phone(212620680122).e164).toBe("+212620680122");
    const bad = phone(50707782);
    expect(bad.e164).toBeNull();
    expect(bad.raw).toBe("50707782");
  });
  it("parses amounts and ignores placeholders", () => {
    expect(amount(1400)).toBe(1400);
    expect(amount("1,400")).toBe(1400);
    expect(amount("Not paid")).toBeNull();
    expect(amount("—")).toBeNull();
  });
});

describe("sheets", () => {
  it("parses a lead tab with the header in the middle of the sheet", () => {
    const grid = [
      [null, null, null, "Date", "Name", "Number", "Note", "Action"],
      [null, null, null, "30/6", "A Parent", 561180187, "Grade 6", "Called"],
      [null, null, null, 1, null, 569198149, "No name", null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, 2, null, null, "orphan note", null],
    ];
    const r = parseLeadSheet("Interested", grid, newDateContext());
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ name: "A Parent", phone: "+971561180187", date: "2026-06-30", action: "Called" });
    expect(r.rows[1]).toMatchObject({ name: "Unknown (569198149)", date: "2026-07-01" });
    expect(r.skipped).toBe(1);
  });

  it("merges the same phone across tabs", () => {
    const ctx = newDateContext();
    const a = parseLeadSheet("Interested", [["Date", "Name", "Number"], ["1/7", "X", 561180187]], ctx).rows;
    const b = parseLeadSheet("Social", [["Date", "Name", "Number", "Details"], ["2/7", "X again", 561180187, "more"]], ctx).rows;
    const m = mergeLeadsByPhone([...a, ...b]);
    expect(m.leads).toHaveLength(1);
    expect(m.merged).toBe(1);
    expect(m.leads[0].extraNotes[0]).toMatch(/Social/);
  });

  it("does not turn the sheet's Paid column into payments", () => {
    const grid = [
      ["Date", "Name", "Number", "Sales", "Teacher", "Course cost", "Paid", "Next payment", "Next payment date", "Schedule", "Course details"],
      [null, "Student A", 506057880, "Mohammed", "Osama", 600, 750, 150, "13/9/2026", "Sun", "weekly"],
      [null, "Student B", 568108115, "Ahmed", null, 1800, "Not paid", null, "31/9", null, null],
    ];
    const r = parseStudentsSheet(grid);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ agreedFee: 600, sheetPaid: 750, nextPaymentDate: "2026-09-13" });
    expect(r.rows[0].notes.join(" ")).toMatch(/not imported as a payment/);
    expect(r.rows[1].nextPaymentDate).toBeNull();
  });

  it("summarises Payments-style tabs and flags split mismatches", () => {
    const grid = [
      ["Date", "Client name", "Sales rep name", "Transferred (received)", "Sent", "Teacher", "To academy"],
      ["27/8", "A", "Karim", 850, 440, 350, 60],
      [xl(2026, 1, 9), "B", "Karim", 850, 400, 350, 100],
    ];
    const s = summariseLedgerSheet("Payments", grid);
    expect(s).toMatchObject({ rows: 2, received: 1700, swappedDates: 1, splitMismatches: 0, firstDate: "2026-08-27", lastDate: "2026-09-01" });
  });
});

describe("teacher names", () => {
  it("strips a trailing country into nationality instead of splitting into two teachers", () => {
    expect(parseTeacherName("Lyka, Philippines")).toEqual({ name: "Lyka", nationality: "Filipino" });
    expect(parseTeacherName("Lyka (Philippines)")).toEqual({ name: "Lyka", nationality: "Filipino" });
    expect(parseTeacherName("Sara Kamal")).toEqual({ name: "Sara Kamal", nationality: null });
    expect(parseTeacherName("Ahmed, Maths")).toEqual({ name: "Ahmed, Maths", nationality: null });
    expect(parseTeacherName("—")).toBeNull();
  });

  it("students keep one teacher name", () => {
    const grid = [
      ["Date", "Name", "Number", "Sales", "Teacher", "Course cost", "Paid"],
      [null, "Suhail", 504432677, "Nana", "Lyka, Philippines", 1500, 750],
    ];
    expect(parseStudentsSheet(grid).rows[0]).toMatchObject({ teacher: "Lyka", teacherNationality: "Filipino" });
  });
});
