import { describe, expect, it } from "vitest";
import { render, STATUS_TEMPLATE } from "./templates";

const c = { number: "JF100123", name: "Asha Verma", trackUrl: "https://jafson.example/order/JF100123?phone=9876543210", totalRupees: "₹4,634", pickupCode: "123456" };
describe("notification templates", () => {
  it("covers every customer-visible status and no internal ones", () => { expect(Object.keys(STATUS_TEMPLATE).sort()).toEqual(["CANCELLED", "COLLECTED", "CONFIRMED", "DELIVERED", "DISPATCHED", "READY_FOR_PICKUP"]); });
  it("mentions the order, uses the first name, and carries the link", () => {
    const r = render("ORDER_DISPATCHED", c); expect(r.subject).toContain("JF100123"); expect(r.text).toContain("Hi Asha,"); expect(r.text).toContain(c.trackUrl); expect(r.sms).toContain("JF100123"); expect(r.vars).toMatchObject({ name: "Asha", order: "JF100123" });
  });
  it("shows the pickup code only on the pickup message", () => { expect(render("ORDER_READY_FOR_PICKUP", c).text).toContain("123456"); expect(render("ORDER_CONFIRMED", c).text).not.toContain("123456"); });
  it("escapes customer-supplied names in HTML", () => { const h = render("ORDER_CONFIRMED", { ...c, name: '<script>alert("x")</script>' }).html; expect(h).not.toContain("<script>"); });
  it("keeps SMS short", () => { for (const t of ["ORDER_CONFIRMED", "ORDER_DISPATCHED", "ORDER_READY_FOR_PICKUP", "ORDER_DELIVERED", "ORDER_CANCELLED", "REFUND_STARTED"] as const) expect(render(t, c).sms.length).toBeLessThan(200); });
});
