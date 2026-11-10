import { cfg } from "../common/config";

export type FulfilmentType = "COURIER" | "LOCAL" | "PICKUP";
export type PaymentMethod = "UPI" | "CARD" | "COD";
export interface PriceLine { unitPricePaise: number; quantity: number; gstRateBps: number }
export interface Serviceability { courier: boolean; local: boolean; pickup: true; codAllowed: boolean; localFeePaise: number }

/** GST included in an inclusive price: gross - gross / (1 + rate). */
export const inclusiveTax = (grossPaise: number, rateBps: number) => grossPaise - Math.round((grossPaise * 10000) / (10000 + rateBps));

export function shippingFor(type: FulfilmentType, subtotalPaise: number, s: Serviceability): number {
  const c = cfg();
  if (type === "PICKUP") return 0;
  if (type === "LOCAL") return subtotalPaise >= c.localFreeAbovePaise ? 0 : s.localFeePaise;
  return subtotalPaise >= c.freeShippingPaise ? 0 : c.courierFeePaise;
}

export function computeTotals(lines: PriceLine[], type: FulfilmentType, method: PaymentMethod, s: Serviceability) {
  const c = cfg();
  const lineTotals = lines.map((l) => l.unitPricePaise * l.quantity);
  const subtotalPaise = lineTotals.reduce((a, b) => a + b, 0);
  const taxPaise = lines.reduce((a, l, i) => a + inclusiveTax(lineTotals[i]!, l.gstRateBps), 0);
  const shippingPaise = shippingFor(type, subtotalPaise, s);
  const codFeePaise = method === "COD" ? c.codFeePaise : 0;
  return { subtotalPaise, taxPaise, shippingPaise, codFeePaise, totalPaise: subtotalPaise + shippingPaise + codFeePaise };
}

export function assertOptions(type: FulfilmentType, method: PaymentMethod, subtotalPaise: number, s: Serviceability): string | null {
  if (type === "COURIER" && !s.courier) return "PINCODE_NOT_SERVICEABLE";
  if (type === "LOCAL" && !s.local) return "LOCAL_DELIVERY_UNAVAILABLE";
  if (method === "COD") {
    if (!s.codAllowed) return "COD_NOT_AVAILABLE_FOR_PINCODE";
    if (subtotalPaise > cfg().codMaxPaise) return "COD_ORDER_VALUE_TOO_HIGH";
  }
  return null;
}
