import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
  finalizeImage,
  fingerprintCreateRequest,
  inspectImage,
  removeImage,
} from "../images/image-upload.js";
import { createTicket as createTicketRecord } from "./ticket-repo.js";
import type { CreateTicketInput, CreateTicketResult } from "./ticket.js";

type CreateTicketFields = Omit<
  CreateTicketInput,
  | "id"
  | "ownerId"
  | "eventStartsAt"
  | "eventEndsAt"
  | "imageFilename"
  | "idempotencyKey"
  | "requestFingerprint"
> & {
  eventStartsAt: string;
  eventEndsAt?: string;
};

type CreateTicketCommand = {
  ownerId: string;
  fields: CreateTicketFields;
  imagePath: string;
  idempotencyKey: string;
};

type PreparedTicketImage = {
  path: string;
  filename: string;
  requestFingerprint: string;
};

/**
 * Validates and fingerprints the uploaded image, then moves it to final storage.
 *
 * Flow: createTicket -> calls this with fields+staging path+ticketId. Steps:
 * inspectImage (magic-byte check for jpg/png/webp) -> fingerprintCreateRequest
 * (sha256 of fields JSON + file bytes for idempotency) -> finalizeImage (rename
 * to <ticketId>.ext in uploads). Returns {path,filename,requestFingerprint}
 * for DB insert. Throws 415 on unsupported format.
 */
async function prepareTicketImage(
  fields: CreateTicketFields,
  imagePath: string,
  ticketId: string,
): Promise<PreparedTicketImage> {
  const image = await inspectImage(imagePath);
  const requestFingerprint = await fingerprintCreateRequest(fields, imagePath);
  const path = await finalizeImage(imagePath, ticketId, image.extension);
  return { path, filename: basename(path), requestFingerprint };
}

/**
 * Builds the DB CreateTicketInput from the HTTP command plus prepared image.
 *
 * Flow: maps CreateTicketFields string dates via Date.parse to ms, carries
 * ownerId/idempotencyKey, and injects image.filename + fingerprint. Keeps
 * priceCents/place/ticketInfo verbatim. Called between prepareTicketImage
 * and ticket-repo createTicket.
 */
function toCreateTicketInput(
  command: CreateTicketCommand,
  ticketId: string,
  image: PreparedTicketImage,
): CreateTicketInput {
  return {
    id: ticketId,
    ownerId: command.ownerId,
    ...command.fields,
    eventStartsAt: Date.parse(command.fields.eventStartsAt),
    eventEndsAt: command.fields.eventEndsAt
      ? Date.parse(command.fields.eventEndsAt)
      : null,
    imageFilename: image.filename,
    idempotencyKey: command.idempotencyKey,
    requestFingerprint: image.requestFingerprint,
  };
}

/**
 * Orchestrates ticket creation with image cleanup on failure/replay.
 *
 * Flow: POST /tickets (multipart) -> route calls this with ownerId+fields+
 * staging path+idempotencyKey. Generates randomUUID ticketId, prepares image,
 * calls ticket-repo createTicket (idempotent on owner_id+idempotency_key).
 * On replay/conflict removes the newly finalized image; on throw also removes
 * staging/final image. Returns {created|replayed|conflict}.
 */
async function createTicket(
  command: CreateTicketCommand,
): Promise<CreateTicketResult> {
  let imagePath = command.imagePath;
  try {
    const ticketId = randomUUID();
    const image = await prepareTicketImage(
      command.fields,
      imagePath,
      ticketId,
    );
    imagePath = image.path;

    const result = createTicketRecord(
      toCreateTicketInput(command, ticketId, image),
    );
    if (result.outcome !== "created") {
      await removeImage(imagePath);
    }
    return result;
  } catch (error) {
    await removeImage(imagePath);
    throw error;
  }
}

export { createTicket };
