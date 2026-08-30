import { z } from "zod";

const reportRequestSchema = z
  .object({
    orderId: z.uuid(),
    reportedUserId: z.uuid(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

const resolutionRequestSchema = z
  .object({
    decision: z.enum(["uphold", "clear"]),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/);

export {
  idempotencyKeySchema,
  reportRequestSchema,
  resolutionRequestSchema,
};
