import { describe, expect, it } from "vitest";
import { canMoveShipment, safeTrackingUrl } from "./shipments";

describe("shipments", () => {
  it("moves forward, allows exceptions, and stops at terminal states", () => {
    expect(canMoveShipment("BOOKED", "IN_TRANSIT")).toBe(true); expect(canMoveShipment("IN_TRANSIT", "DELIVERED")).toBe(true); expect(canMoveShipment("FAILED", "IN_TRANSIT")).toBe(true);
    expect(canMoveShipment("DELIVERED", "IN_TRANSIT")).toBe(false); expect(canMoveShipment("RETURNED_TO_SELLER", "BOOKED")).toBe(false); expect(canMoveShipment("IN_TRANSIT", "BOOKED")).toBe(false);
  });
  it("accepts only https tracking links", () => {
    expect(safeTrackingUrl("https://example.com/track?id=1")).toContain("https://example.com/track");
    expect(safeTrackingUrl("javascript:alert(1)")).toBeNull(); expect(safeTrackingUrl("http://example.com")).toBeNull(); expect(safeTrackingUrl("not a url")).toBeNull(); expect(safeTrackingUrl("")).toBeNull();
  });
});
