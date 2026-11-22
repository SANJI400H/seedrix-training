"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/portal/action-state";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const FieldErrorsContext = React.createContext<Record<string, string>>({});
export const useFieldErrors = () => React.useContext(FieldErrorsContext);

/**
 * Form wrapper for server actions.
 * - keeps typed values when the server returns an error (no auto reset)
 * - shows "confirm to continue" warnings (overpay, possible double entry)
 *   and resubmits with confirm=1 once the user ticks the box
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className,
  submitVariant = "primary",
  extraButtons,
  resetOnSuccess,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  submitVariant?: "primary" | "secondary" | "outline";
  extraButtons?: React.ReactNode;
  resetOnSuccess?: boolean;
}) {
  const [state, setState] = React.useState<ActionState>({});
  const [pending, startTransition] = React.useTransition();
  const [confirmed, setConfirmed] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (confirmed) fd.set("confirm", "1");
    startTransition(async () => {
      const next = await action(state, fd);
      setState(next ?? {});
      if (!next?.confirm) setConfirmed(false);
      if (next?.ok && resetOnSuccess) formRef.current?.reset();
    });
  }

  return (
    <FieldErrorsContext.Provider value={state.fieldErrors ?? {}}>
      <form ref={formRef} onSubmit={onSubmit} className={cn("flex flex-col gap-3", className)} noValidate={false}>
        {children}
        {state.confirm?.length ? (
          <div className="rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-bold">Please check before saving</div>
            <ul className="mt-1 list-disc ps-5">
              {state.confirm.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 font-bold">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4"
              />
              I have checked this and want to save anyway
            </label>
          </div>
        ) : null}
        {state.error ? (
          <div role="alert" className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">
            {state.error}
          </div>
        ) : null}
        {state.ok && state.message ? (
          <div role="status" className="rounded-[8px] border border-seedrix-green/20 bg-seedrix-green/5 px-3 py-2 text-sm text-seedrix-dark-green">
            {state.message}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {extraButtons}
          <Button
            type="submit"
            variant={submitVariant}
            disabled={pending || (!!state.confirm?.length && !confirmed)}
            className="h-11 md:h-10"
          >
            {pending ? "Saving…" : state.confirm?.length ? `${submitLabel} anyway` : submitLabel}
          </Button>
        </div>
      </form>
    </FieldErrorsContext.Provider>
  );
}

export function FieldError({ name }: { name: string }) {
  const errs = useFieldErrors();
  return errs[name] ? <span className="text-xs font-bold text-red-700">{errs[name]}</span> : null;
}
