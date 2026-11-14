-- Invariants beyond Prisma's reach. Idempotent; applied by `pnpm db:setup`.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_never_negative') THEN
    ALTER TABLE "InventoryBalance" ADD CONSTRAINT inventory_balances_never_negative
      CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand" AND "safetyStock" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_qty_positive') THEN
    ALTER TABLE "InventoryReservation" ADD CONSTRAINT reservation_qty_positive CHECK ("quantity" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_item_qty_positive') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT order_item_qty_positive CHECK ("quantity" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'money_nonneg') THEN
    ALTER TABLE "Order" ADD CONSTRAINT money_nonneg CHECK ("subtotalPaise" >= 0 AND "totalPaise" >= 0 AND "shippingPaise" >= 0);
  END IF;
END $$;

-- Completed stock movements are immutable (spec 3.10 #8).
CREATE OR REPLACE FUNCTION forbid_movement_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'inventory movements are append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS inventory_movements_immutable ON "InventoryMovement";
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION forbid_movement_change();

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 100001;
CREATE SEQUENCE IF NOT EXISTS return_ref_seq START 5001;
CREATE SEQUENCE IF NOT EXISTS product_sku_seq START 1000;

-- Issued tax documents are immutable (CGST Rules: no edits once issued; corrections go through credit notes).
CREATE OR REPLACE FUNCTION forbid_tax_doc_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'issued tax documents are immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS invoices_immutable ON "Invoice";
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION forbid_tax_doc_change();
DROP TRIGGER IF EXISTS credit_notes_immutable ON "CreditNote";
CREATE TRIGGER credit_notes_immutable BEFORE UPDATE OR DELETE ON "CreditNote" FOR EACH ROW EXECUTE FUNCTION forbid_tax_doc_change();
