export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details: any = {}) { super(message); }
}

const isServer = typeof window === "undefined";
const base = () => (isServer ? `${process.env.API_ORIGIN ?? "http://localhost:4000"}/v1` : "/api/v1");

export async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string | null; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base() + path, {
      method: init.method ?? "GET", cache: "no-store", signal: init.signal,
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK", "We couldn't reach the server. Check your connection and try again.", 0);
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !json?.success) throw new ApiError(json?.error?.code ?? "ERROR", json?.error?.message ?? "Something went wrong", res.status, json?.error?.details);
  return json.data as T;
}

/** Friendly copy for API error codes shown to shoppers. */
export const friendly = (e: unknown) => {
  if (!(e instanceof ApiError)) return "Something went wrong. Please try again.";
  const map: Record<string, string> = {
    INSUFFICIENT_STOCK: "Sorry, one of the items just sold out or has fewer pieces left than you chose.",
    PINCODE_NOT_SERVICEABLE: "We don't deliver to that pincode yet.", LOCAL_DELIVERY_UNAVAILABLE: "Local delivery isn't available for that pincode.",
    COD_NOT_AVAILABLE_FOR_PINCODE: "Cash on delivery isn't available for that pincode.", COD_ORDER_VALUE_TOO_HIGH: "Cash on delivery is available up to ₹20,000. Please pay online.",
    OTP_INVALID: "That code is incorrect or has expired.", OTP_THROTTLED: "Too many codes requested. Please try again in an hour.",
    NOT_FOUND: "We couldn't find that. Check the details and try again.", NOT_CANCELLABLE: "This order can no longer be cancelled.",
    NOT_ELIGIBLE: "Returns open once your order has been delivered.", RETURN_WINDOW_CLOSED: "The 7-day return window for this order has closed.",
  };
  return map[e.code] ?? e.message;
};
