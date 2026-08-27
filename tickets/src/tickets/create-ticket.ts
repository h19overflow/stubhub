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
    eventEndsAt: command.fields.eventEndsAt ? Date.parse(command.fields.eventEndsAt) : null,
    imageFilename: image.filename,
    idempotencyKey: command.idempotencyKey,
    requestFingerprint: image.requestFingerprint,
  };
}

async function createTicket(command: CreateTicketCommand): Promise<CreateTicketResult> {
  let imagePath = command.imagePath;
  try {
    const ticketId = randomUUID();
    const image = await prepareTicketImage(command.fields, imagePath, ticketId);
    imagePath = image.path;

    const result = createTicketRecord(toCreateTicketInput(command, ticketId, image));
    if (result.outcome !== "created") await removeImage(imagePath);
    return result;
  } catch (error) {
    await removeImage(imagePath);
    throw error;
  }
}

export { createTicket };
