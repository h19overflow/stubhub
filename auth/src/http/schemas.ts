import { z } from "zod";

const email = z.string().trim().toLowerCase().max(320).pipe(z.email());

export /**
 * Zod schema for email+password signup/signin (email normalized, password 8-72 chars).
 *
 * Flow: signup/signin routes parse body through this before user-repo calls.
 */
const credentialsSchema = z.object({
  email,
  password: z.string().min(8).max(256),
});

export const emailSchema = z.object({ email });
export const adminElevationSchema = z.object({ email }).strict();

export const userIdSchema = z.uuid();

export const emailCodeSchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/),
});
