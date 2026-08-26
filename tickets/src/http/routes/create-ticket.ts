import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { Router } from "express";
import {
  finalizeImage,
  fingerprintCreateRequest,
  inspectImage,
  removeImage,
  ticketImageUpload,
} from "../../images/image-upload.js";
import { createTicket as createTicketRecord } from "../../tickets/ticket-repo.js";
import { createTicketSchema, idempotencyKeySchema } from "../../tickets/schemas.js";
import { HttpError } from "../error-handler.js";
import { requireAuth } from "../require-auth.js";

const router = Router();

router.post("/tickets", requireAuth, ticketImageUpload.single("image"), async (request, response) => {
  let imagePath = request.file?.path;
  try {
    const key = idempotencyKeySchema.safeParse(request.get("Idempotency-Key"));
    const fields = createTicketSchema.safeParse(request.body);
    if (!key.success || !fields.success || !imagePath) {
      throw new HttpError(400, "Valid ticket fields, image, and Idempotency-Key are required");
    }

    const image = await inspectImage(imagePath);
    const requestFingerprint = await fingerprintCreateRequest(fields.data, imagePath);
    const id = randomUUID();
    imagePath = await finalizeImage(imagePath, id, image.extension);
    const result = createTicketRecord({
      id,
      ownerId: response.locals.user.id,
      ...fields.data,
      eventStartsAt: Date.parse(fields.data.eventStartsAt),
      eventEndsAt: fields.data.eventEndsAt ? Date.parse(fields.data.eventEndsAt) : null,
      imageFilename: basename(imagePath),
      idempotencyKey: key.data,
      requestFingerprint,
    });

    if (result.outcome === "created") {
      imagePath = undefined;
      response.status(201).json({ ticket: result.ticket });
      return;
    }

    await removeImage(imagePath);
    imagePath = undefined;
    if (result.outcome === "replayed") {
      response.status(200).json({ ticket: result.ticket });
      return;
    }
    throw new HttpError(409, "Idempotency key was already used for different ticket data");
  } catch (error) {
    if (imagePath) await removeImage(imagePath);
    throw error;
  }
});

export { router as createTicket };
