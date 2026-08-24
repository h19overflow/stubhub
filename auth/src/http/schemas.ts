import { z } from "zod";

const email = z.string().trim().toLowerCase().max(320).pipe(z.email());

export const credentialsSchema = z.object({
  email,
  password: z.string().min(8).max(256),
});

export const emailSchema = z.object({ email });

export const emailCodeSchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/),
});
