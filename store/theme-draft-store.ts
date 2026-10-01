import { create } from "zustand";
import type { Theme } from "@/lib/theme";

// Colours being edited on the Branding page but not yet saved. While set,
// AgencyTheme shows these instead of the saved theme, so edits preview
// across the whole app instantly (as in the prototype) and a background
// refetch of the saved theme can't snap them back mid-edit.
interface ThemeDraftState {
  draft: Theme | null;
  setDraft: (theme: Theme | null) => void;
}

export const useThemeDraft = create<ThemeDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
}));
