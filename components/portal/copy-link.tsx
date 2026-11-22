"use client";

import { useState } from "react";

export function CopyLink({ url, onCopy }: { url: string; onCopy?: () => Promise<void> }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input readOnly value={url} aria-label="Client link" className="h-10 min-w-0 flex-1 rounded-[8px] border border-seedrix-darkest/15 bg-seedrix-darkest/[0.03] px-2 text-xs" />
      <button
        type="button"
        className="h-10 rounded-[8px] border border-seedrix-darkest/15 px-3 text-sm font-bold text-seedrix-darkest hover:border-seedrix-green"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            /* clipboard blocked: the field can still be copied by hand */
          }
          setDone(true);
          await onCopy?.();
        }}
      >
        {done ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
