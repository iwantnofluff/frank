"use client";

import { useRouter } from "next/navigation";
import { settingsReturn } from "@/lib/settings-return";

// Settings' X, top right (direct instruction): back to the page Settings
// was opened from, or `fallback` if there's none (opened straight from a
// link).
export function SettingsClose({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  return (
    <button type="button" className="help-ib set-close" aria-label={label} title={label} onClick={() => router.push(settingsReturn(fallback))}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
