import { create } from "zustand";
import { persist } from "zustand/middleware";

// "Lightweight session capture" for the public review page (spec section
// 26) — a name and email, not an account. Persisted to localStorage so a
// visitor isn't asked again after a reload within the same browser.
interface GuestIdentityState {
  name: string | null;
  email: string | null;
  setIdentity: (name: string, email: string) => void;
}

export const useGuestIdentityStore = create<GuestIdentityState>()(
  persist(
    (set) => ({
      name: null,
      email: null,
      setIdentity: (name, email) => set({ name, email }),
    }),
    { name: "frank-guest-identity" },
  ),
);
