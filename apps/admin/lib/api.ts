export class ApiError extends Error { constructor(public code: string, message: string, public status: number, public details: any = {}) { super(message); } }

const KEY = "jf-admin-token";
export const getToken = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

/** Admin API call. A 401 clears the session and sends the user to the sign-in page. */
export async function adm<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { method: init.method ?? "GET", cache: "no-store", headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch { throw new ApiError("NETWORK", "Can't reach the server. Check your connection.", 0); }
  let json: any = null; try { json = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 401 && !path.startsWith("/admin/auth/")) { setToken(null); if (typeof window !== "undefined" && location.pathname !== "/login") location.href = "/login"; }
  if (res.status === 403 && json?.error?.code === "MFA_REQUIRED" && typeof window !== "undefined" && location.pathname !== "/security") location.href = "/security";
  if (!res.ok || !json?.success) throw new ApiError(json?.error?.code ?? "ERROR", json?.error?.message ?? "Something went wrong", res.status, json?.error?.details);
  return json.data as T;
}
export const msg = (e: unknown) => (e instanceof ApiError ? (e.code === "VALIDATION_ERROR" ? Object.values<any>(e.details?.fieldErrors ?? {}).flat()[0] ?? e.message : e.message) : "Something went wrong");

export const inrp = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inr = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");
export const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
export const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const NEXT_STEP: Record<string, Record<string, string>> = {
  COURIER: { CONFIRMED: "PICKING", PICKING: "PACKED", PACKED: "DISPATCHED", DISPATCHED: "DELIVERED" },
  LOCAL: { CONFIRMED: "PICKING", PICKING: "PACKED", PACKED: "DISPATCHED", DISPATCHED: "DELIVERED" },
  PICKUP: { CONFIRMED: "READY_FOR_PICKUP", READY_FOR_PICKUP: "COLLECTED" },
};
export const STEP_LABEL: Record<string, string> = { PICKING: "Start picking", PACKED: "Mark packed", DISPATCHED: "Dispatch (deducts stock)", DELIVERED: "Mark delivered", READY_FOR_PICKUP: "Ready for pickup", COLLECTED: "Confirm collection" };

export const tone = (s: string) => (["DELIVERED", "COLLECTED", "PAID", "REFUNDED", "RECEIVED"].includes(s) ? "ok" : ["CANCELLED", "FAILED"].includes(s) ? "bad" : ["PENDING_PAYMENT", "PENDING", "COD_PENDING", "REFUND_PENDING", "REFUND_DUE", "PARTIALLY_REFUNDED", "REQUESTED"].includes(s) ? "warn" : "info");
