import { z } from "zod";

export const createSettlementSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  notes: z.string().max(500).optional(),
});
