import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Which saved view each project's table has open (direct instruction: back
// from a post, the table is on the view it was on, not Main Table). Kept
// for this browser tab only, like the page's own history; null is Main
// Table.
interface ProjectViewState {
  byProject: Record<string, string | null>;
  remember: (projectId: string, viewId: string | null) => void;
}

export const useProjectViewStore = create<ProjectViewState>()(
  persist(
    (set) => ({
      byProject: {},
      remember: (projectId, viewId) => set((s) => ({ byProject: { ...s.byProject, [projectId]: viewId } })),
    }),
    { name: "frank-project-view", storage: createJSONStorage(() => sessionStorage) },
  ),
);
