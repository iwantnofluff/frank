import { create } from "zustand";

// "Preview as: Agency / Client" in the topbar. This is a prototype-only
// convenience for seeing both personas without two logins — in the live
// product each user's role decides their view, this doesn't. See the
// modeswitch note in frank-prototype.html.
export type PreviewMode = "agency" | "client";

interface UIState {
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
}

export const useUIStore = create<UIState>((set) => ({
  previewMode: "agency",
  setPreviewMode: (mode) => set({ previewMode: mode }),
}));
