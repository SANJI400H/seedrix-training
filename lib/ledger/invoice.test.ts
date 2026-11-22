import { describe, expect, it } from "vitest";
import { courseBalance, invoiceProgress, vatParts } from "./invoice";

describe("invoice totals", () => {
  it("VAT off: total is the amount, no VAT line", () => {
    expect(vatParts(1700, false, 5)).toEqual({ net: 1700, vat: 0, total: 1700, rate: 0 });
  });

  it("VAT on: splits the gross VAT-inclusive and adds back exactly", () => {
    expect(vatParts(1050, true, 5)).toEqual({ net: 1000, vat: 50, total: 1050, rate: 5 });
    const p = vatParts(1700, true, 5);
    expect(p.net).toBe(1619.05);
    expect(p.vat).toBe(80.95);
    expect(Math.round((p.net + p.vat) * 100) / 100).toBe(1700);
  });

  it("partial payment: shows paid vs due", () => {
    expect(invoiceProgress(1700, [{ amount: 500 }, { amount: 300 }, { amount: 900, void: true }])).toEqual({
      total: 1700,
      paid: 800,
      due: 900,
      status: "partial",
    });
    expect(invoiceProgress(1700, []).status).toBe("issued");
    expect(invoiceProgress(1700, [{ amount: 1700 }]).status).toBe("paid");
    expect(invoiceProgress(1700, [{ amount: 1800 }])).toMatchObject({ status: "paid", due: 0 });
  });

  it("receipt follows its payment", () => {
    expect(invoiceProgress(850, [{ amount: 850 }], "receipt").status).toBe("paid");
    expect(invoiceProgress(850, [{ amount: 850, void: true }], "receipt").status).toBe("cancelled");
  });

  it("course balance up to the invoice date", () => {
    const pays = [
      { amount: 500, paid_on: "2026-09-01" },
      { amount: 600, paid_on: "2026-10-01" },
      { amount: 100, paid_on: "2026-10-02", void: true },
    ];
    expect(courseBalance(1700, pays, "2026-09-30")).toEqual({ agreedFee: 1700, paidToDate: 500, balance: 1200 });
    expect(courseBalance(1700, pays)).toEqual({ agreedFee: 1700, paidToDate: 1100, balance: 600 });
    expect(courseBalance(1000, [{ amount: 1200, paid_on: "2026-09-01" }]).balance).toBe(0);
  });
});
