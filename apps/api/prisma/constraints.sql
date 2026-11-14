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

-- Phase 1 integrity rules
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_total_adds_up') THEN
    -- NOT VALID: new and changed rows are checked; rows that already exist are not rewritten or rejected.
    ALTER TABLE "Order" ADD CONSTRAINT order_total_adds_up CHECK ("totalPaise" = "subtotalPaise" + "shippingPaise" + "codFeePaise") NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit log is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_log_immutable ON "AuditLog";
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

-- Order lines are editable only while the order is still awaiting payment (spec 3.10 #5).
CREATE OR REPLACE FUNCTION freeze_order_items() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM "Order" WHERE id = OLD."orderId";
  IF st IS NOT NULL AND st <> 'PENDING_PAYMENT' THEN RAISE EXCEPTION 'order lines are frozen once the order is confirmed'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS order_items_frozen ON "OrderItem";
CREATE TRIGGER order_items_frozen BEFORE UPDATE OR DELETE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION freeze_order_items();

-- A pickup order cannot become COLLECTED without a stored confirmation (spec 3.10 #10).
CREATE OR REPLACE FUNCTION require_pickup_confirmation() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'COLLECTED' AND OLD.status IS DISTINCT FROM 'COLLECTED'
     AND NOT EXISTS (SELECT 1 FROM "PickupConfirmation" WHERE "orderId" = NEW.id) THEN
    RAISE EXCEPTION 'a pickup confirmation is required before an order is collected';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS orders_need_pickup_confirmation ON "Order";
CREATE TRIGGER orders_need_pickup_confirmation BEFORE UPDATE OF status ON "Order" FOR EACH ROW EXECUTE FUNCTION require_pickup_confirmation();
