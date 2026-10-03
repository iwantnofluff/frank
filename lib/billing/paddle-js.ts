"use client";

// Paddle's checkout in the browser (phase39): Paddle.js, from Paddle's own
// CDN as Paddle requires (it isn't an npm dependency), loaded the first
// time someone opens a checkout. The client-side token is public by design.

interface PaddleEvent {
  name?: string;
}
interface PaddleJs {
  Environment: { set(env: string): void };
  Initialize(opts: { token: string; eventCallback: (e: PaddleEvent) => void }): void;
  Checkout: {
    open(opts: {
      transactionId: string;
      customer?: { email: string };
      settings?: Record<string, unknown>;
    }): void;
    close(): void;
  };
}
declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

export const PADDLE_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
// Paddle's sandbox tokens start "test_".
export const PADDLE_TEST_MODE = PADDLE_TOKEN.startsWith("test_");
export const billingConfigured = () => PADDLE_TOKEN !== "";

const listeners = new Set<(e: PaddleEvent) => void>();
let loading: Promise<PaddleJs> | null = null;

function loadPaddle(): Promise<PaddleJs> {
  if (loading) return loading;
  loading = new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      const P = window.Paddle;
      if (!P) return reject(new Error("Paddle didn't load"));
      if (PADDLE_TEST_MODE) P.Environment.set("sandbox");
      P.Initialize({ token: PADDLE_TOKEN, eventCallback: (e) => listeners.forEach((l) => l(e)) });
      resolve(P);
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't reach Paddle. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

// Opens Paddle's checkout over the page for a transaction Frank made.
// Resolves "paid" once Paddle says so (closing it, so Frank's own page says
// what happens next), or "closed" if it's closed first.
export async function openCheckout(transactionId: string, email: string | null): Promise<"paid" | "closed"> {
  const P = await loadPaddle();
  return new Promise((resolve) => {
    const listener = (e: PaddleEvent) => {
      if (e.name !== "checkout.completed" && e.name !== "checkout.closed") return;
      listeners.delete(listener);
      if (e.name === "checkout.completed") P.Checkout.close();
      resolve(e.name === "checkout.completed" ? "paid" : "closed");
    };
    listeners.add(listener);
    P.Checkout.open({
      transactionId,
      ...(email ? { customer: { email } } : {}),
      settings: { displayMode: "overlay", theme: "light", locale: "en", allowLogout: false },
    });
  });
}
