import { z } from "zod";

const parseQueryNumber = (value: unknown): unknown =>
  typeof value === "string" && value.trim() !== "" ? Number(value) : value;

const isoTimestampSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const ticketIdSchema = z.uuid();

const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/);

const createTicketSchema = z
  .object({
    eventName: z.string().trim().min(1),
    description: z.string().trim().min(1),
    eventStartsAt: isoTimestampSchema,
    eventEndsAt: z.preprocess(
      (value) => (value === "" ? undefined : value),
      isoTimestampSchema.optional(),
    ),
    ticketInfo: z.string().trim().min(1),
    place: z.string().trim().min(1),
    priceCents: z
      .string()
      .trim()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
  })
  .strict()
  .superRefine((ticket, context) => {
    if (ticket.eventEndsAt && Date.parse(ticket.eventEndsAt) <= Date.parse(ticket.eventStartsAt)) {
      context.addIssue({
        code: "custom",
        path: ["eventEndsAt"],
        message: "eventEndsAt must be later than eventStartsAt",
      });
    }
  });

const updateTicketPriceSchema = z
  .object({
    priceCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const paginationSchema = z
  .object({
    page: z.preprocess(parseQueryNumber, z.number().int().min(1)).default(1),
    pageSize: z.preprocess(parseQueryNumber, z.number().int().min(1).max(100)).default(20),
  })
  .strict();

const listTicketsQuerySchema = paginationSchema
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    place: z.string().trim().min(1).max(200).optional(),
    startsAfter: z.iso.datetime({ offset: true }).optional(),
    startsBefore: z.iso.datetime({ offset: true }).optional(),
    minPriceCents: z.preprocess(
      parseQueryNumber,
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    ),
    maxPriceCents: z.preprocess(
      parseQueryNumber,
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    ),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.startsAfter &&
      query.startsBefore &&
      Date.parse(query.startsAfter) > Date.parse(query.startsBefore)
    ) {
      context.addIssue({
        code: "custom",
        path: ["startsAfter"],
        message: "startsAfter must not be later than startsBefore",
      });
    }

    if (
      query.minPriceCents !== undefined &&
      query.maxPriceCents !== undefined &&
      query.minPriceCents > query.maxPriceCents
    ) {
      context.addIssue({
        code: "custom",
        path: ["minPriceCents"],
        message: "minPriceCents must not exceed maxPriceCents",
      });
    }
  });

export {
  createTicketSchema,
  idempotencyKeySchema,
  updateTicketPriceSchema,
  listTicketsQuerySchema,
  paginationSchema,
  ticketIdSchema,
};
