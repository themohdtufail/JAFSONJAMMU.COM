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

export interface MediaItem { id: string; kind: "IMAGE" | "VIDEO"; alt: string; width: number | null; height: number | null; blur: string | null; color: string | null; bytes: number; src: string; srcset: { w: number; url: string }[]; poster: string | null; storage: string; mime: string; createdAt: string }
/** Smallest stored size that is at least `w` wide: thumbnails load a few kilobytes, not the full picture. */
export const thumb = (m: { src: string; srcset: { w: number; url: string }[] }, w = 320) => (m.srcset.find((s) => s.w >= w) ?? m.srcset.at(-1))?.url ?? m.src;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** Prepares a picked file: accepts JPG, PNG, WebP and AVIF as they are, and converts others the browser can read (for example iPhone HEIC photos) to JPEG. */
export async function prepareImage(file: File): Promise<Blob> {
  if (OK_TYPES.includes(file.type)) { if (file.size > 12 * 1024 * 1024) throw new ApiError("FILE_TOO_LARGE", `${file.name} is larger than 12 MB.`, 413); return file; }
  try {
    const bmp = await createImageBitmap(file); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92)); if (blob && blob.size <= 12 * 1024 * 1024) return blob;
  } catch { /* fall through */ }
  throw new ApiError("UNSUPPORTED_IMAGE", `${file.name} can't be used. Choose a JPG, PNG, WebP or AVIF picture.`, 415);
}
export async function admUpload(file: File, alt = ""): Promise<MediaItem> {
  const blob = await prepareImage(file); let res: Response;
  try { res = await fetch(`/api/v1/admin/media/upload?alt=${encodeURIComponent(alt || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 120))}`, { method: "POST", headers: { "content-type": blob.type, ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) }, body: blob }); }
  catch { throw new ApiError("NETWORK", "Can't reach the server. Check your connection.", 0); }
  const json = await res.json().catch(() => null); if (res.status === 401) { setToken(null); location.href = "/login"; }
  if (!res.ok || !json?.success) throw new ApiError(json?.error?.code ?? "ERROR", json?.error?.message ?? "Upload failed", res.status);
  return json.data as MediaItem;
}
/** Large videos go straight from the browser to storage on a short-lived link; the server then checks they arrived. */
export async function admUploadVideo(file: File, alt: string, onProgress?: (pct: number) => void): Promise<MediaItem> {
  const p = await adm<{ key: string; uploadUrl: string }>("/admin/media/presign", { method: "POST", body: { mime: file.type, bytes: file.size } });
  await new Promise<void>((resolve, reject) => { const x = new XMLHttpRequest(); x.open("PUT", p.uploadUrl); x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100)); x.onload = () => (x.status < 300 ? resolve() : reject(new ApiError("UPLOAD_FAILED", "Storage refused the video.", x.status))); x.onerror = () => reject(new ApiError("NETWORK", "The upload was interrupted. Try again.", 0)); x.send(file); });
  return adm<MediaItem>("/admin/media/complete", { method: "POST", body: { key: p.key, alt: alt || file.name.replace(/\.[^.]+$/, "") } });
}
