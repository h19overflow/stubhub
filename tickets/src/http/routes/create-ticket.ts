import { requireAuth } from "@stubhub/common";
import { Router, type Request, type Response } from "express";
import {
  removeImage,
  ticketImageUpload,
} from "../../images/image-upload.js";
import {
  createTicket as createTicketForUser,
} from "../../tickets/create-ticket.js";
import {
  createTicketSchema,
  idempotencyKeySchema,
} from "../../tickets/schemas.js";
import type { CreateTicketResult } from "../../tickets/ticket.js";
import { HttpError } from "../error-handler.js";

const router = Router();

function parseCreateTicketRequest(request: Request) {
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.get("Idempotency-Key"),
  );
  if (!idempotencyKey.success) {
    throw new HttpError(
      400,
      "Valid Idempotency-Key is required",
      "invalid_idempotency_key",
    );
  }

  const fields = createTicketSchema.safeParse(request.body);
  const imagePath = request.file?.path;
  if (!fields.success || !imagePath) {
    throw new HttpError(
      400,
      "Valid ticket fields and image are required",
      "invalid_ticket",
    );
  }

  return {
    fields: fields.data,
    imagePath,
    idempotencyKey: idempotencyKey.data,
  };
}

function sendCreateTicketResponse(
  response: Response,
  result: CreateTicketResult,
): void {
  if (result.outcome === "created") {
    response.status(201).json({
      outcome: "created",
      ticket: result.ticket,
    });
    return;
  }

  if (result.outcome === "replayed") {
    response.status(200).json({
      outcome: "replayed",
      ticket: result.ticket,
    });
    return;
  }

  throw new HttpError(
    409,
    "Idempotency key was already used for different ticket data",
    "idempotency_conflict",
  );
}

async function handleCreateTicket(
  request: Request,
  response: Response,
): Promise<void> {
  let unclaimedImagePath = request.file?.path;
  try {
    const command = parseCreateTicketRequest(request);
    unclaimedImagePath = undefined;
    const result = await createTicketForUser({
      ownerId: response.locals.user.id,
      ...command,
    });
    sendCreateTicketResponse(response, result);
  } catch (error) {
    if (unclaimedImagePath) {
      await removeImage(unclaimedImagePath);
    }
    throw error;
  }
}

router.post(
  "/tickets",
  requireAuth,
  ticketImageUpload.single("image"),
  handleCreateTicket,
);

export { router as createTicket };
