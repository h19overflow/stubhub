import nodemailer from "nodemailer";
import type { ChallengePurpose } from "../challenges/challenge.js";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "127.0.0.1",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
});

async function sendCode(email: string, purpose: ChallengePurpose, code: string): Promise<void> {
  const verifyingEmail = purpose === "verify_email";
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "StubHub Learning <identity@stubhub.local>",
    to: email,
    subject: verifyingEmail ? "Verify your email" : "Your sign-in code",
    text: `${verifyingEmail ? "Your email verification" : "Your sign-in"} code is ${code}. It expires in 10 minutes.`,
  });
}

export { sendCode };
