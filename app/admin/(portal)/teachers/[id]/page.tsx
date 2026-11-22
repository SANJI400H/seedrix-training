/* eslint-disable @next/next/no-img-element -- signed Storage URLs are short-lived; next/image adds nothing here */
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveTeacher, uploadTeacherPhoto } from "@/app/admin/actions/teachers";
import { ActionForm } from "@/components/portal/action-form";
import { TeacherFields } from "@/components/portal/teacher-fields";
import { Card, Field, Kpi, Money, PageHeader, Pill, SectionTitle, Table, Td, Th } from "@/components/portal/ui";
import { fmtDate } from "@/lib/ledger/dates";
import { sum } from "@/lib/ledger/money";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { teacherPhotoUrl } from "@/lib/portal/storage";
import type { ClientPayment, Payout, Student, Teacher, TeacherPublic } from "@/lib/portal/types";

export const dynamic = "force-dynamic";

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const [{ data: pub }, { data: priv }, { data: studs }] = await Promise.all([
    supabase.from("teachers_public").select("*").eq("id", id).maybeSingle(),
    manager ? supabase.from("teachers").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("students").select("*").eq("teacher_id", id).neq("status", "archived").order("name"),
  ]);
  if (!pub) notFound();
  const t = pub as TeacherPublic;
  const full = priv as Teacher | null;
  const students = (studs ?? []) as Student[];
  const photo = await teacherPhotoUrl(t.photo_path);

  let owed: { due: number; paid: number; payouts: Payout[] } | null = null;
  if (manager) {
    const ids = students.map((s) => s.id);
    const [{ data: pays }, { data: outs }] = await Promise.all([
      ids.length ? supabase.from("client_payments").select("*").in("student_id", ids).eq("void", false) : Promise.resolve({ data: [] }),
      supabase.from("payouts").select("*").eq("teacher_id", id).eq("void", false).order("paid_on", { ascending: false }),
    ]);
    const payouts = ((outs ?? []) as Payout[]).map((o) => ({ ...o, amount: Number(o.amount) }));
    owed = {
      due: sum(((pays ?? []) as ClientPayment[]).map((p) => Number(p.teacher_share))),
      paid: sum(payouts.map((o) => o.amount)),
      payouts,
    };
  }

  const facts: Array<[string, string | null]> = [
    ["Subjects", t.subjects],
    ["Curricula", t.curricula],
    ["Grades", t.grade_range],
    ["Emirate / areas", [t.emirate, t.areas].filter(Boolean).join(" · ")],
    ["Delivery", t.delivery_modes],
    ["Languages", t.languages],
    ["Nationality", t.nationality],
    ["Availability", t.availability],
  ];

  return (
    <>
      <PageHeader title={t.name} sub={<Pill tone={t.status === "active" ? "good" : t.status === "onboarding" ? "warn" : "muted"}>{t.status}</Pill>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="flex flex-col gap-3 sm:flex-row">
          {photo ? (
            <img src={photo} alt={`Photo of ${t.name}`} className="h-28 w-28 shrink-0 rounded-[12px] object-cover" />
          ) : (
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[12px] bg-seedrix-darkest/5 text-3xl font-bold text-seedrix-black/30">
              {t.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-seedrix-black/55">{k}</dt>
                  <dd className="min-w-0 break-words">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {t.bio ? <p className="mt-2 whitespace-pre-wrap text-sm">{t.bio}</p> : null}
          </div>
        </Card>
        <Card>
          <SectionTitle className="mb-2">Current students{manager ? "" : " (yours)"}</SectionTitle>
          <ul className="flex flex-col gap-1 text-sm">
            {students.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2">
                <Link className="font-bold hover:underline" href={`/admin/students/${s.id}`}>
                  {s.name}
                </Link>
                <span className="text-seedrix-black/60">{s.schedule ?? "no schedule"}</span>
              </li>
            ))}
            {!students.length ? <li className="text-seedrix-black/55">None.</li> : null}
          </ul>
        </Card>
      </div>

      {manager && full && owed ? (
        <>
          <Card className="border-red-200">
            <SectionTitle className="mb-2 text-red-800">Private — owner / admin only</SectionTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
              {(
                [
                  ["Phone", full.phone],
                  ["Email", full.email],
                  ["Pay rate", full.rate_aed ? `AED ${full.rate_aed}${full.pay_unit ? ` per ${full.pay_unit}` : ""}` : full.rate_note],
                  ["Rating", full.rating !== null ? `${full.rating} / 5` : null],
                  ["Bank", full.bank_name],
                  ["IBAN", full.iban],
                ] as Array<[string, string | null]>
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-seedrix-black/55">{k}</dt>
                  <dd className="min-w-0 break-words">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {full.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-seedrix-black/70">{full.notes}</p> : null}
          </Card>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Kpi label="Teacher share due" value={owed.due} note="On payments from current students" />
            <Kpi label="Paid to teacher" value={owed.paid} />
            <Kpi hero label="Owed to teacher" value={Math.round((owed.due - owed.paid) * 100) / 100} />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Paid on</Th>
                <Th>Note</Th>
                <Th num>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {owed.payouts.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link href={`/admin/payouts/${o.id}`} className="font-bold hover:underline">
                      {fmtDate(o.paid_on)}
                    </Link>
                  </Td>
                  <Td>{o.note ?? "—"}</Td>
                  <Td num>
                    <Money value={o.amount} />
                  </Td>
                </tr>
              ))}
              {!owed.payouts.length ? (
                <tr>
                  <Td colSpan={3} className="text-center text-seedrix-black/55">
                    No payouts recorded for this teacher.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
          <Card>
            <details>
              <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Edit teacher</summary>
              <div className="mt-3 flex flex-col gap-4">
                <ActionForm action={uploadTeacherPhoto.bind(null, id)} submitLabel="Upload photo" submitVariant="outline" resetOnSuccess>
                  <Field label="Photo (private; JPG/PNG/WebP, under 800 KB)">
                    <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="text-sm" />
                  </Field>
                </ActionForm>
                <ActionForm action={saveTeacher.bind(null, id)} submitLabel="Save teacher">
                  <TeacherFields t={full} />
                </ActionForm>
              </div>
            </details>
          </Card>
        </>
      ) : null}
    </>
  );
}
