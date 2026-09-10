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

/**
 * Validates the multipart create-ticket request (idempotency + fields + image).
 *
 * Flow: called by handleCreateTicket before domain. Checks Idempotency-Key
 * via idempotencyKeySchema, fields via createTicketSchema, and that multer
 * produced request.file.path. Throws HttpError 400 invalid_idempotency_key or
 * invalid_ticket so errorHandler returns JSON code.
 */
function parseCreateTicketRequest(request: Request) {
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.get("Idempotency-Key"),
  );
  if (!idempotencyKey.success) {
    throw new HttpError(
      400,
      "invalid_idempotency_key",
      "Valid Idempotency-Key is required",
    );
  }

  const fields = createTicketSchema.safeParse(request.body);
  const imagePath = request.file?.path;
  if (!fields.success || !imagePath) {
    throw new HttpError(
      400,
      "invalid_ticket",
      "Valid ticket fields and image are required",
    );
  }

  return {
    fields: fields.data,
    imagePath,
    idempotencyKey: idempotencyKey.data,
  };
}

/**
 * Maps a CreateTicketResult to the HTTP status/code.
 *
 * Flow: after domain createTicket: created→201 {outcome, ticket}, replayed→200,
 * conflict→409 idempotency_conflict. Keeps HTTP concerns out of repo (repo
 * returns outcome, this chooses status).
 */
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
    "idempotency_conflict",
    "Idempotency key was already used for different ticket data",
  );
}

/**
 * Orchestrates POST /tickets — auth + upload + idempotent ticket creation.
 *
 * Flow: requireAuth → ticketImageUpload.single(image) (5 MiB limit via multer)
 * → parseCreateTicketRequest → createTicketForUser (fingerprint+finalize image,
 * DB ON CONFLICT) → sendCreateTicketResponse. Ensures orphan staging file is
 * removed on throw/replay/conflict (unclaimedImagePath guard).
 */
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
