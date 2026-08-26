import { useState } from "react";
import { signin } from "../../lib/api/auth/signin";
import { signup } from "../../lib/api/auth/signup";
import type { Credentials } from "../../lib/api/auth/types";

type AuthMode = "signin" | "signup";

export function useAuthCredentials() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);

  function clearFeedback() {
    setMessage("");
    setHasError(false);
  }

  async function submit(mode: AuthMode, credentials: Credentials) {
    setIsSubmitting(true);
    clearFeedback();

    try {
      if (mode === "signin") {
        const result = await signin(credentials);
        if ("codeRequired" in result) {
          setMessage("Check your email for the six-digit sign-in code.");
        } else {
          window.location.assign("/");
        }
        return;
      }

      const result = await signup(credentials);
      if (!result.verificationRequired) {
        setMessage("Account created. You can sign in now.");
        return;
      }

      setMessage(
        result.emailSent
          ? "Account created. Check your email for the verification code."
          : "Account created, but the verification email could not be sent. Request another code.",
      );
    } catch (error) {
      setHasError(true);
      setMessage(error instanceof Error ? error.message : "Identity request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return { clearFeedback, hasError, isSubmitting, message, submit };
}
