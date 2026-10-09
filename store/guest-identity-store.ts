import { create } from "zustand";
import { persist } from "zustand/middleware";

// "Lightweight session capture" for the public review page (spec section
// 26) — a name and email, not an account. Persisted to localStorage so a
// visitor isn't asked again after a reload within the same browser.
//
// Kept per client (reported directly: a No Fluff link opened as someone
// from Casa Carigar, remembered from a Casa link in the same browser): a
// name given on one client's link is never assumed on another's. Stored
// under a new key, so the old one-for-every-link name is left behind.
interface Identity {
  name: string;
  email: string;
}
interface GuestIdentityState {
  byClient: Record<string, Identity>;
  setIdentity: (clientKey: string, name: string, email: string) => void;
  forget: (clientKey: string) => void;
}

export const useGuestIdentityStore = create<GuestIdentityState>()(
  persist(
    (set) => ({
      byClient: {},
      setIdentity: (clientKey, name, email) => set((s) => ({ byClient: { ...s.byClient, [clientKey]: { name, email } } })),
      forget: (clientKey) =>
        set((s) => {
          const byClient = { ...s.byClient };
          delete byClient[clientKey];
          return { byClient };
        }),
    }),
    { name: "frank-guest-identity-by-client" },
  ),
);
