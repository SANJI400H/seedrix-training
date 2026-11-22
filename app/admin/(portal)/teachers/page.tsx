import Link from "next/link";
import { Empty, PageHeader, Pill, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadTeachers, loadTeachersFull } from "@/lib/portal/data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Teachers" };
export const dynamic = "force-dynamic";

type SP = { q?: string; subject?: string; curriculum?: string; area?: string; mode?: string; status?: string };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const sp = await searchParams;
  const [teachers, full] = await Promise.all([loadTeachers(supabase), manager ? loadTeachersFull(supabase) : Promise.resolve([])]);
  const rate = new Map(full.map((t) => [t.id, t.rate_aed ? `AED ${t.rate_aed}${t.pay_unit ? ` / ${t.pay_unit}` : ""}` : (t.rate_note ?? "")]));
  const has = (v: string | null | undefined, needle?: string) => !needle || (v ?? "").toLowerCase().includes(needle.toLowerCase());
  const status = sp.status ?? "current";
  const rows = teachers.filter(
    (t) =>
      (status === "all" || (status === "current" ? t.status !== "inactive" : t.status === status)) &&
      has([t.name, t.subjects, t.bio, t.nationality].join(" "), sp.q) &&
      has(t.subjects, sp.subject) &&
      has(t.curricula, sp.curriculum) &&
      has([t.emirate, t.areas].join(" "), sp.area) &&
      has(t.delivery_modes, sp.mode),
  );

  return (
    <>
      <PageHeader title="Teachers" sub={`${rows.length} of ${teachers.length}. Filter by subject, curriculum, area and delivery to pick a teacher for a lead.`}>
        {manager ? (
          <Link href="/admin/teachers/new" className={linkBtnPrimary}>
            Add teacher
          </Link>
        ) : null}
      </PageHeader>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search name or bio" className={cn(inputCls, "flex-[2_1_180px]")} />
        <input name="subject" defaultValue={sp.subject} placeholder="Subject (e.g. maths)" className={cn(inputCls, "flex-[1_1_140px]")} />
        <select name="curriculum" defaultValue={sp.curriculum ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="">Any curriculum</option>
          {["American", "British", "Ministry", "IB", "Indian"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input name="area" defaultValue={sp.area} placeholder="Emirate / area" className={cn(inputCls, "flex-[1_1_140px]")} />
        <select name="mode" defaultValue={sp.mode ?? ""} className={cn(inputCls, "flex-[1_1_120px]")}>
          <option value="">Any delivery</option>
          <option value="home">Home</option>
          <option value="online">Online</option>
          <option value="centre">Centre</option>
        </select>
        <select name="status" defaultValue={status} className={cn(inputCls, "flex-[1_1_120px]")}>
          <option value="current">Active + onboarding</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>Teacher</Th>
            <Th>Subjects</Th>
            <Th>Curricula / grades</Th>
            <Th>Area / delivery</Th>
            <Th>Languages</Th>
            {manager ? <Th>Pay</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((t) => (
              <tr key={t.id}>
                <Td>
                  <Link href={`/admin/teachers/${t.id}`} className="font-bold hover:underline">
                    {t.name}
                  </Link>
                  {t.status !== "active" ? <Pill className="ms-1">{t.status}</Pill> : null}
                  {t.nationality ? <div className="text-xs text-seedrix-black/55">{t.nationality}</div> : null}
                </Td>
                <Td className="max-w-[16rem]">
                  <span className="line-clamp-2">{t.subjects}</span>
                </Td>
                <Td>{[t.curricula, t.grade_range].filter(Boolean).join(" · ") || "—"}</Td>
                <Td>{[t.emirate, t.areas, t.delivery_modes].filter(Boolean).join(" · ") || "—"}</Td>
                <Td>{t.languages ?? "—"}</Td>
                {manager ? <Td className="whitespace-nowrap">{rate.get(t.id) || "—"}</Td> : null}
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={6}>
                <Empty title="No teachers match">Try fewer filters.</Empty>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
