import { create } from "zustand";
import { persist } from "zustand/middleware";

// A review link guest's edit keys (phase75): one per comment they made in
// this browser, sent with the comment and needed to edit it. Kept like the
// guest's name (guest-identity-store), so only this browser can edit them
// (decided directly).
interface GuestEditKeysState {
  keys: Record<string, string>;
  setKey: (commentId: string, key: string) => void;
}

export const useGuestEditKeysStore = create<GuestEditKeysState>()(
  persist(
    (set) => ({
      keys: {},
      setKey: (commentId, key) => set((s) => ({ keys: { ...s.keys, [commentId]: key } })),
    }),
    { name: "frank-guest-edit-keys" },
  ),
);
