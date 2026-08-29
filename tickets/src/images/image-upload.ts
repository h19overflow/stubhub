import { createHash, randomUUID } from "node:crypto";
import { createReadStream, mkdirSync } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { HttpError } from "../http/error-handler.js";

type ImageInspection = {
  extension: "jpg" | "png" | "webp";
  mime: "image/jpeg" | "image/png" | "image/webp";
};

const defaultUploadDirectory = fileURLToPath(new URL("../../data/uploads/", import.meta.url));
const uploadDirectory = resolve(process.env.TICKETS_UPLOAD_DIR ?? defaultUploadDirectory);
const stagingDirectory = join(uploadDirectory, ".staging");
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const riffSignature = Buffer.from("RIFF");
const webpSignature = Buffer.from("WEBP");

mkdirSync(uploadDirectory, { recursive: true });
mkdirSync(stagingDirectory, { recursive: true });

const ticketImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, stagingDirectory),
    filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 7 },
});

async function inspectImage(path: string): Promise<ImageInspection> {
  const file = await open(path, "r");
  try {
    const signature = Buffer.alloc(12);
    const { bytesRead } = await file.read(signature, 0, signature.length, 0);

    if (
      bytesRead >= 3 &&
      signature[0] === 0xff &&
      signature[1] === 0xd8 &&
      signature[2] === 0xff
    ) {
      return { extension: "jpg", mime: "image/jpeg" };
    }

    if (bytesRead >= 8 && signature.subarray(0, 8).equals(pngSignature)) {
      return { extension: "png", mime: "image/png" };
    }

    if (
      bytesRead >= 12 &&
      signature.subarray(0, 4).equals(riffSignature) &&
      signature.subarray(8, 12).equals(webpSignature)
    ) {
      return { extension: "webp", mime: "image/webp" };
    }
  } finally {
    await file.close();
  }

  throw new HttpError(415, "Image must be JPEG, PNG, or WebP", "unsupported_image");
}

async function fingerprintCreateRequest(data: unknown, path: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(data));
  hash.update("\0");

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function finalizeImage(
  path: string,
  ticketId: string,
  extension: ImageInspection["extension"],
): Promise<string> {
  const finalPath = join(uploadDirectory, `${ticketId}.${extension}`);
  await rename(path, finalPath);
  return finalPath;
}

async function removeImage(path: string): Promise<void> {
  await rm(path, { force: true });
}

export {
  finalizeImage,
  fingerprintCreateRequest,
  inspectImage,
  removeImage,
  ticketImageUpload,
  uploadDirectory,
};
