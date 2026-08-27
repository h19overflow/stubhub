import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const configuredUploadDirectory = process.env.TICKETS_UPLOAD_DIR;
if (!configuredUploadDirectory) throw new Error("TICKETS_UPLOAD_DIR is required for Tickets tests");
const uploadDirectory = resolve(configuredUploadDirectory);
const stagingDirectory = join(uploadDirectory, ".staging");

function resetUploads(): void {
  rmSync(uploadDirectory, { recursive: true, force: true });
  mkdirSync(stagingDirectory, { recursive: true });
}

function cleanupUploads(): void {
  rmSync(uploadDirectory, { recursive: true, force: true });
}

function storedImages(): string[] {
  return readdirSync(uploadDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function stagedUploads(): string[] {
  return readdirSync(stagingDirectory).sort();
}

export { cleanupUploads, resetUploads, stagedUploads, storedImages };
