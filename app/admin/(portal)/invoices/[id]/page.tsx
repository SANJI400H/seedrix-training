import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelBill, emailInvoiceAction, logLinkCopied, whatsappInvoiceAction } from "@/app/admin/actions/invoices";
import { ActionForm } from "@/components/portal/action-form";
import { InvoiceStatusPill, MethodLabel } from "@/components/portal/bits";
import { CopyLink } from "@/components/portal/copy-link";
import { Card, Field, Kpi, Money, Notice, PageHeader, SectionTitle, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { fmtDate, fmtDateTime } from "@/lib/ledger/dates";
import { loadInvoiceDoc, publicInvoiceUrl } from "@/lib/invoices/document";
import { requireStaff } from "@/lib/portal/auth";
import { loadStaff, staffByUser } from "@/lib/portal/data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Send = { id: string; channel: string; recipient: string | null; ok: boolean; error: string | null; created_at: string; created_by: string | null };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const doc = await loadInvoiceDoc(supabase, id);
  if (!doc) notFound();
  const [{ data: sends }, staff] = await Promise.all([
    supabase.from("invoice_sends").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    loadStaff(supabase),
  ]);
  const who = staffByUser(staff);
  const { invoice: inv, progress, client, student, course } = doc;
  const link = publicInvoiceUrl(id);
  const phone = client?.whatsapp ?? client?.phone ?? (inv.client_mobile !== "-" ? inv.client_mobile : "");
  const isBill = inv.kind === "bill";

  return (
    <>
      <PageHeader
        title={`${isBill ? "Invoice" : "Payment receipt"} ${inv.invoice_number}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <InvoiceStatusPill status={inv.status} />
            <span>Issued {fmtDate(inv.created_at.slice(0, 10))}</span>
            {student ? (
              <span>
                · for{" "}
                <Link href={`/admin/students/${student.id}`} className="font-bold text-seedrix-green underline">
                  {student.name}
                </Link>
              </span>
            ) : null}
          </span>
        }
      >
        <a href={`/admin/invoices/${id}/pdf`} className={linkBtnPrimary}>
          Download PDF
        </a>
        <a href={`/admin/invoices/${id}/pdf?inline=1`} target="_blank" rel="noopener" className={linkBtnOutline}>
          View PDF
        </a>
      </PageHeader>
      {sp.error === "phone" ? <Notice tone="bad">Add a phone number to open WhatsApp.</Notice> : null}
      {doc.amended ? <Notice tone="warn">The payment on this receipt was edited after it was issued; the PDF shows the correction.</Notice> : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Kpi label="Invoice total" value={inv.total_aed} note={inv.vat_rate > 0 ? `incl. VAT ${inv.vat_rate}% (${inv.vat_aed.toFixed(2)})` : "No VAT"} />
        <Kpi label="Paid" value={progress.paid} />
        <Kpi label={isBill ? "Still due" : "Course balance"} value={isBill ? progress.due : (course?.balance ?? 0)} tone={(isBill ? progress.due : (course?.balance ?? 0)) > 0 ? "warn" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle className="mb-2">Send to the client</SectionTitle>
          <div className="flex flex-col gap-4">
            <ActionForm action={emailInvoiceAction.bind(null, id)} submitLabel="Email PDF" submitVariant="outline">
              <Field label="Client email">
                <input className={inputCls} name="to" type="email" defaultValue={client?.email ?? inv.client_email ?? ""} required />
              </Field>
            </ActionForm>
            <form action={whatsappInvoiceAction.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="WhatsApp number" className="min-w-0 flex-1">
                <input className={inputCls} name="phone" defaultValue={phone ?? ""} inputMode="tel" />
              </Field>
              <button type="submit" className="h-11 rounded-[8px] bg-[#25D366] px-4 text-sm font-bold text-white md:h-10">
                Send on WhatsApp
              </button>
            </form>
            <div>
              <div className="mb-1 text-xs font-bold text-seedrix-darkest/80">Client link (shows status, lets them download the PDF)</div>
              <CopyLink url={link} onCopy={logLinkCopied.bind(null, id)} />
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle className="mb-2">Payments against this invoice</SectionTitle>
          {doc.payments.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {doc.payments.map((p) => (
                <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-2", p.void && "text-seedrix-black/40 line-through")}>
                  <Link href={`/admin/payments/${p.id}`} className="font-bold hover:underline">
                    {fmtDate(p.paid_on)}
                  </Link>
                  <span className="text-xs">
                    <MethodLabel method={p.method} />
                    {p.bank_ref ? ` · ref ${p.bank_ref}` : ""}
                  </span>
                  <Money value={p.amount} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-seedrix-black/55">No payment recorded against it yet.</p>
          )}
          {isBill && inv.status !== "paid" && inv.status !== "cancelled" && student ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/admin/payments/new?student=${student.id}&invoice=${id}`} className={linkBtnPrimary}>
                Record payment for this invoice
              </Link>
              {!doc.payments.some((p) => !p.void) ? (
                <ActionForm action={cancelBill.bind(null, id)} submitLabel="Cancel invoice" submitVariant="outline">
                  <span />
                </ActionForm>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle>Sent</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>How</Th>
              <Th>To</Th>
              <Th>By</Th>
              <Th>Result</Th>
            </tr>
          </thead>
          <tbody>
            {((sends ?? []) as Send[]).map((s) => (
              <tr key={s.id}>
                <Td>{fmtDateTime(s.created_at)}</Td>
                <Td>{s.channel === "link" ? "Link copied" : s.channel === "email" ? "Email" : "WhatsApp"}</Td>
                <Td>{s.recipient ?? "—"}</Td>
                <Td>{s.created_by ? who.get(s.created_by) : "—"}</Td>
                <Td className={s.ok ? "" : "text-red-700"}>{s.ok ? (s.channel === "email" ? "Sent" : "Opened") : s.error}</Td>
              </tr>
            ))}
            {!sends?.length ? (
              <tr>
                <Td colSpan={5} className="text-center text-seedrix-black/55">
                  Not sent yet.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>
    </>
  );
}
