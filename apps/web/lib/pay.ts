import { api, ApiError } from "./api";

export interface PaySession { provider: "RAZORPAY" | "MOCK"; paymentRef: string; amountPaise: number; currency: string; orderNumber: string; expiresAt: string | null; keyId?: string; prefill?: { name: string; contact: string } }
export type PayOutcome = "paid" | "dismissed" | "failed";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, cb: (r: unknown) => void): void } } }

let script: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.Razorpay) return Promise.resolve();
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { script = null; reject(new ApiError("NETWORK", "We couldn't load the payment window. Check your connection and try again.", 0)); };
    document.head.appendChild(s);
  });
  return script;
}

export const paySession = (orderNumber: string, phone?: string) => api<PaySession>("/payments/session", { method: "POST", body: { orderNumber, phone } });

/**
 * Opens Razorpay Checkout for an order. "paid" means our server verified Razorpay's signature;
 * "failed" means the payment may still be confirmed by Razorpay's webhook, so callers show the order page, not an error page.
 */
export async function payWithRazorpay(s: PaySession, phone: string): Promise<PayOutcome> {
  await loadCheckout();
  return new Promise<PayOutcome>((resolve) => {
    let handling = false;
    const rz = new window.Razorpay!({
      key: s.keyId, amount: s.amountPaise, currency: s.currency, order_id: s.paymentRef, name: "Jafson Jammu", description: `Order ${s.orderNumber}`,
      prefill: s.prefill, theme: { color: "#f1521d" }, retry: { enabled: true },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        handling = true;
        try { await api("/payments/verify", { method: "POST", body: { orderNumber: s.orderNumber, phone, ...r } }); resolve("paid"); } catch { resolve("failed"); }
      },
      modal: { ondismiss: () => { if (!handling) resolve("dismissed"); } },
    });
    rz.open();
  });
}
