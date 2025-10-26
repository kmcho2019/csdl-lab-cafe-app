import { z } from "zod";

export const kioskCheckoutSchema = z.object({
  userId: z.string().min(1),
  cart: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
});
