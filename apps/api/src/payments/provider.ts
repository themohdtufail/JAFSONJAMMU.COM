import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../common/http";
import { cfg } from "../common/config";

export interface ProviderOrder { id: string }
export interface ProviderRefund { id: string; status: string }
export interface PaymentProvider {
  readonly name: "RAZORPAY" | "MOCK";
  createOrder(i: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder>;
  /** Razorpay: HMAC-SHA256(order_id + "|" + payment_id) with the key secret, as returned to the browser after payment. */
  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhook(raw: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<ProviderRefund>;
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b ?? ""); return x.length === y.length && timingSafeEqual(x, y); };
const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

export class RazorpayProvider implements PaymentProvider {
  readonly name = "RAZORPAY" as const;
  private get key() { return cfg().razorpayKeyId; }
  private get secret() { return cfg().razorpayKeySecret; }

  private async call<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${cfg().razorpayBase}${path}`, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${this.key}:${this.secret}`).toString("base64")}` },
        body: JSON.stringify(body),
      });
    } catch { throw new AppError("PAYMENT_PROVIDER_UNREACHABLE", "The payment provider didn't respond. Please try again.", 502); }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new AppError("PAYMENT_PROVIDER_ERROR", json?.error?.description ?? "The payment provider rejected the request.", 502, { providerCode: json?.error?.code });
    return json as T;
  }

  async createOrder(i: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
    const o = await this.call<{ id: string; amount: number }>("/v1/orders", { amount: i.amountPaise, currency: "INR", receipt: i.receipt, notes: i.notes });
    if (o.amount !== i.amountPaise) throw new AppError("PAYMENT_PROVIDER_ERROR", "Provider order amount mismatch", 502);
    return { id: o.id };
  }
  verifyCheckout(orderId: string, paymentId: string, signature: string) { return !!this.secret && safeEq(hmac(this.secret, `${orderId}|${paymentId}`), signature); }
  verifyWebhook(raw: string, signature: string) { const s = cfg().razorpayWebhookSecret; return !!s && safeEq(hmac(s, raw), signature); }
  async refund(paymentId: string, amountPaise: number, notes: Record<string, string>) {
    const r = await this.call<{ id: string; status: string }>(`/v1/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, speed: "normal", notes });
    return { id: r.id, status: r.status };
  }
}

/** Development stand-in. Same contract, no network. Enabled only with PAYMENTS_PROVIDER=mock (or PAYMENTS_MOCK=1). */
export class MockProvider implements PaymentProvider {
  readonly name = "MOCK" as const;
  async createOrder(i: { receipt: string }) { return { id: `mock_${i.receipt}_${Math.random().toString(36).slice(2, 10)}` }; }
  verifyCheckout() { return false; }
  verifyWebhook(raw: string, signature: string) { const s = cfg().webhookSecret; return !!s && safeEq(hmac(s, raw), signature); }
  async refund() { return { id: `mock_rfnd_${Math.random().toString(36).slice(2, 12)}`, status: "processed" }; }
}

export function getProvider(): PaymentProvider {
  const c = cfg();
  if (c.paymentsProvider === "mock") return new MockProvider();
  if (!c.razorpayKeyId || !c.razorpayKeySecret) throw new AppError("PAYMENTS_NOT_CONFIGURED", "Online payments aren't set up yet. Choose cash on delivery or try again later.", 503);
  return new RazorpayProvider();
}
