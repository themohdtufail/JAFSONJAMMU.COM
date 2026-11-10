import { z } from "zod";

/** Bill OS -> JAFSON Commerce event contract, schema_version 1 (spec §4.3). */
const line = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

const base = {
  event_id: z.string().uuid(),
  source_system: z.literal("BILL_OS"),
  source_transaction_id: z.string().min(1),
  location_id: z.string().min(1),
  occurred_at: z.string().datetime(),
  schema_version: z.literal(1),
};

const lines = z.object({ lines: z.array(line).min(1) });

export const billOsEventSchema = z.discriminatedUnion("event_type", [
  z.object({ ...base, event_type: z.literal("SALE_COMPLETED"), event_payload: lines }),
  z.object({ ...base, event_type: z.literal("SALE_CANCELLED"), event_payload: lines }),
  z.object({ ...base, event_type: z.literal("SALE_RETURNED"), event_payload: lines }),
  z.object({ ...base, event_type: z.literal("STOCK_RECEIVED"), event_payload: lines }),
  z.object({
    ...base,
    event_type: z.literal("STOCK_ADJUSTED"),
    event_payload: z.object({
      reason: z.string().min(1),
      lines: z.array(z.object({ sku: z.string().min(1), quantity_delta: z.number().int().refine((n) => n !== 0) })).min(1),
    }),
  }),
]);

export type BillOsEvent = z.infer<typeof billOsEventSchema>;
