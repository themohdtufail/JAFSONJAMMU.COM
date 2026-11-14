/** What customers are told, in one place. SMS content is `vars` for a registered template (the text here is for the log and for staff to compare); email is plain text plus simple HTML. */
export type Template = "ORDER_CONFIRMED" | "ORDER_DISPATCHED" | "ORDER_READY_FOR_PICKUP" | "ORDER_DELIVERED" | "ORDER_CANCELLED" | "REFUND_STARTED";
export interface Ctx { number: string; name: string; trackUrl: string; totalRupees: string; pickupCode?: string | null }
export const STATUS_TEMPLATE: Record<string, Template> = { CONFIRMED: "ORDER_CONFIRMED", DISPATCHED: "ORDER_DISPATCHED", READY_FOR_PICKUP: "ORDER_READY_FOR_PICKUP", DELIVERED: "ORDER_DELIVERED", COLLECTED: "ORDER_DELIVERED", CANCELLED: "ORDER_CANCELLED" };

const first = (n: string) => (n.split(/\s+/)[0] || "there").slice(0, 30);
const L: Record<Template, (c: Ctx) => { subject: string; lines: string[]; sms: string }> = {
  ORDER_CONFIRMED: (c) => ({ subject: `Order ${c.number} confirmed`, lines: [`Hi ${first(c.name)}, thank you for shopping with Jafson Jammu.`, `Your order ${c.number} (total ${c.totalRupees}) is confirmed and we're getting it ready.`], sms: `Jafson: order ${c.number} confirmed, total ${c.totalRupees}. Track: ${c.trackUrl}` }),
  ORDER_DISPATCHED: (c) => ({ subject: `Order ${c.number} is on its way`, lines: [`Hi ${first(c.name)}, your order ${c.number} has been dispatched.`, "You can follow it from the link below."], sms: `Jafson: order ${c.number} is on its way. Track: ${c.trackUrl}` }),
  ORDER_READY_FOR_PICKUP: (c) => ({ subject: `Order ${c.number} is ready for pickup`, lines: [`Hi ${first(c.name)}, your order ${c.number} is ready at our showroom.`, `Show this pickup code at the counter: ${c.pickupCode ?? ""}`], sms: `Jafson: order ${c.number} is ready for pickup. Code ${c.pickupCode ?? ""}. ${c.trackUrl}` }),
  ORDER_DELIVERED: (c) => ({ subject: `Order ${c.number} delivered`, lines: [`Hi ${first(c.name)}, your order ${c.number} is complete. We hope you love it.`, "If something isn't right, you can return or exchange it within 7 days from the link below."], sms: `Jafson: order ${c.number} delivered. Returns within 7 days: ${c.trackUrl}` }),
  ORDER_CANCELLED: (c) => ({ subject: `Order ${c.number} cancelled`, lines: [`Hi ${first(c.name)}, your order ${c.number} has been cancelled.`, "If you paid online, the refund goes back to your original payment method."], sms: `Jafson: order ${c.number} was cancelled. Any online payment is refunded to the original method.` }),
  REFUND_STARTED: (c) => ({ subject: `Refund started for order ${c.number}`, lines: [`Hi ${first(c.name)}, we have started a refund for order ${c.number}.`, "Banks usually take 5 to 7 working days to show it."], sms: `Jafson: refund started for order ${c.number}. Banks take 5-7 working days.` }),
};
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

export function render(t: Template, c: Ctx) {
  const x = L[t](c);
  const text = [...x.lines, "", `Order details: ${c.trackUrl}`, "", "Jafson Jammu, managed by Chameron Industries Private Limited"].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1d;max-width:520px">${x.lines.map((l) => `<p>${esc(l)}</p>`).join("")}<p><a href="${esc(c.trackUrl)}" style="display:inline-block;background:#F1521D;color:#1d1d1d;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">View your order</a></p><p style="color:#777;font-size:12px">Jafson Jammu, managed by Chameron Industries Private Limited</p></div>`;
  return { subject: x.subject, text, html, sms: x.sms, vars: { name: first(c.name), order: c.number, link: c.trackUrl, total: c.totalRupees, code: c.pickupCode ?? "" } as Record<string, string> };
}
