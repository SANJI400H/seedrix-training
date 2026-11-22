import Link from "next/link";
import * as React from "react";
import { aed } from "@/lib/ledger/money";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-11 w-full rounded-[8px] border border-seedrix-darkest/15 bg-seedrix-white px-3 text-base text-seedrix-black placeholder:text-seedrix-black/40 focus-visible:border-seedrix-green disabled:opacity-60 md:h-10 md:text-sm";
export const textareaCls =
  "min-h-20 w-full rounded-[8px] border border-seedrix-darkest/15 bg-seedrix-white px-3 py-2 text-base text-seedrix-black placeholder:text-seedrix-black/40 focus-visible:border-seedrix-green md:text-sm";

export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <h1 className="text-xl font-bold text-seedrix-darkest md:text-2xl">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-seedrix-black/60">{sub}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-w-0 rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-4", className)}
      {...props}
    />
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-base font-bold text-seedrix-darkest", className)}>{children}</h2>;
}

type Tone = "good" | "warn" | "bad" | "muted" | "info";
const toneCls: Record<Tone, string> = {
  good: "bg-seedrix-green/10 text-seedrix-dark-green",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-700",
  muted: "bg-seedrix-darkest/5 text-seedrix-black/60",
  info: "bg-sky-100 text-sky-800",
};

export function Pill({ tone = "muted", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold",
        toneCls[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "bad" | "info" | "good"; children: React.ReactNode }) {
  const cls = {
    warn: "bg-amber-50 text-amber-900 border-amber-200",
    bad: "bg-red-50 text-red-800 border-red-200",
    info: "bg-sky-50 text-sky-900 border-sky-200",
    good: "bg-seedrix-green/5 text-seedrix-dark-green border-seedrix-green/20",
  }[tone];
  return <div className={cn("rounded-[8px] border px-3 py-2 text-sm", cls)}>{children}</div>;
}

export function Kpi({
  label,
  value,
  note,
  hero,
  tone,
  href,
}: {
  label: string;
  value: number;
  note?: React.ReactNode;
  hero?: boolean;
  tone?: "bad" | "warn";
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "h-full min-w-0 rounded-[12px] border p-3",
        hero ? "border-transparent bg-seedrix-darkest text-seedrix-white" : "border-seedrix-darkest/10 bg-seedrix-white",
      )}
    >
      <div className={cn("text-[11px] font-bold uppercase tracking-wider", hero ? "text-seedrix-mint" : "text-seedrix-black/55")}>
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-bold tabular-nums md:text-xl",
          tone === "bad" && "text-red-700",
          tone === "warn" && "text-amber-700",
        )}
      >
        {aed(value)}
      </div>
      {note ? <div className={cn("mt-0.5 text-xs", hero ? "text-seedrix-white/70" : "text-seedrix-black/55")}>{note}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Money({ value, className, signed }: { value: number | null | undefined; className?: string; signed?: boolean }) {
  const v = Number(value ?? 0);
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {signed && v > 0 ? "+" : ""}
      {aed(v)}
    </span>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, num, className }: { children?: React.ReactNode; num?: boolean; className?: string }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap bg-seedrix-darkest/[0.04] px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-seedrix-black/55",
        num && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  num,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  num?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-t border-seedrix-darkest/10 px-3 py-2 align-top",
        num && "whitespace-nowrap text-right font-mono tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-seedrix-black/60">
      <div className="mb-1 font-bold text-seedrix-darkest">{title}</div>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-bold text-seedrix-darkest/80">{label}</span>
      {children}
      {hint ? <span className="text-xs text-seedrix-black/55">{hint}</span> : null}
      {error ? <span className="text-xs font-bold text-red-700">{error}</span> : null}
    </label>
  );
}

export function Grid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={cn("grid grid-cols-1 gap-3", c, className)}>{children}</div>;
}

export const linkBtn =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-4 text-sm font-bold transition-colors";
export const linkBtnPrimary = cn(linkBtn, "bg-seedrix-green text-seedrix-white hover:bg-seedrix-dark-green");
export const linkBtnOutline = cn(
  linkBtn,
  "border border-seedrix-darkest/15 bg-seedrix-white text-seedrix-darkest hover:border-seedrix-green hover:text-seedrix-green",
);
export const linkSmall = "text-sm font-bold text-seedrix-green hover:underline";
