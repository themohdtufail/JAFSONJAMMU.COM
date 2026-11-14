/** Shipment status rules as pure functions. */
export const SHIPMENT_STATUSES = ["BOOKED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED_TO_SELLER", "FAILED"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
const NEXT: Record<ShipmentStatus, ShipmentStatus[]> = {
  BOOKED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "RETURNED_TO_SELLER", "FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "IN_TRANSIT", "RETURNED_TO_SELLER", "FAILED"],
  DELIVERED: [], RETURNED_TO_SELLER: [], FAILED: ["IN_TRANSIT", "RETURNED_TO_SELLER"],
};
export const canMoveShipment = (from: ShipmentStatus, to: ShipmentStatus) => NEXT[from]?.includes(to) ?? false;

/** A courier integration. Live booking (AWB and label creation) needs the courier's contract credentials, so only the manual provider exists today; add an implementation of this interface per courier. */
export interface CourierProvider { code: string; name: string; book?(order: { number: string; weightGrams?: number }): Promise<{ awb: string; trackingUrl?: string }> }
export const MANUAL_CARRIERS = ["India Post", "Delhivery", "DTDC", "Blue Dart", "Ecom Express", "Xpressbees", "Local rider", "Other"] as const;

/** Tracking links must be plain https, so a typo or a hostile value can never become a script or other scheme on the order page. */
export function safeTrackingUrl(u: string | undefined | null): string | null {
  if (!u) return null; try { const x = new URL(u.trim()); return x.protocol === "https:" ? x.toString() : null; } catch { return null; }
}
