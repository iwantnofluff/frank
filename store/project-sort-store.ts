import { create } from "zustand";
import { persist } from "zustand/middleware";

// How a client's projects are ordered (direct instruction), remembered in
// this browser like the review link's guest name (guest-identity-store).
export type ProjectSort = "latest" | "name" | "added" | "deadline";

interface ProjectSortState {
  sort: ProjectSort;
  setSort: (sort: ProjectSort) => void;
}

export const useProjectSortStore = create<ProjectSortState>()(
  persist(
    (set) => ({
      sort: "latest",
      setSort: (sort) => set({ sort }),
    }),
    { name: "frank-project-sort" },
  ),
);
