/**
 * Runtime checks for the response fields this library actually reads.
 *
 * Trakteer responses carry many fields we never touch, so the schemas stay
 * narrow instead of mirroring the full shapes in `types.ts`.
 */

import * as v from "valibot";

const status = v.optional(v.picklist(["success", "error"]));

/** Public API envelope: `{status, message, result}`. */
export const envelopeSchema = v.object({
  message: v.optional(v.string()),
  result: v.optional(v.unknown()),
  status,
});

/** `/quantity-given` and `/current-balance` put their value in `result`. */
export const countEnvelopeSchema = v.object({
  message: v.optional(v.string()),
  result: v.union([v.string(), v.number()]),
  status,
});

/** Fields from `UserSummary` used by payment creation. */
export const userSummarySchema = v.object({
  active_unit: v.object({
    data: v.object({
      id: v.string(),
      price: v.string(),
    }),
  }),
});

/** Fields from `PaymentTotal` that callers rely on. */
export const paymentTotalSchema = v.object({
  payment_method: v.string(),
  price: v.number(),
  total_price: v.number(),
});

/** Gateway responses carry either a checkout URL or an order id. */
export const checkoutResponseSchema = v.object({
  checkout_url: v.optional(v.string()),
  order_id: v.optional(v.string()),
});

/** Validates `value`, returning it unchanged so callers keep their types. */
export function expect<T>(schema: v.GenericSchema, value: unknown, context: string): T {
  const result = v.safeParse(schema, value);
  if (!result.success) {
    throw new Error(`Unexpected ${context} response: ${v.summarize(result.issues)}`);
  }
  return value as T;
}
