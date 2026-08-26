import type { SyntheticEvent } from "react";
import { useState } from "react";
import { Button } from "../../components/primitives/Button";
import { TextField } from "../../components/primitives/TextField";
import { useAuthCredentials } from "../../hooks/auth/useAuthCredentials";
import styles from "./AuthForm.module.css";

// The form can be in exactly one of these two modes.
type AuthMode = "signin" | "signup";
// `Partial` means either field may have an error, but neither error is always required.
type FieldErrors = Partial<Record<"email" | "password", string>>;

// A React component is a function that returns a tree of elements.
export function AuthForm() {
  // State is the component's memory. Updating any of these values causes React to render again.
  const [errors, setErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<AuthMode>("signin");
  const { clearFeedback, hasError, isSubmitting, message, submit } = useAuthCredentials();

  // Switching modes updates the visible copy and clears feedback left by the previous mode.
  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrors({});
    clearFeedback();
  }

  // React calls this function when the user submits the <form> near the bottom of the component.
  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    clearFeedback();
    // FormData reads values from controls by their `name` attributes.
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    // Build a fresh error object for this submission instead of changing the existing state object.
    const nextErrors: FieldErrors = {};

    // These checks only provide immediate UI feedback. The auth service will remain authoritative.
    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (password.length < 8 || password.length > 256) {
      nextErrors.password = "Use between 8 and 256 characters.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    await submit(mode, { email, password });
  }

  // This derived boolean keeps the JSX conditions short and readable.
  const isSignin = mode === "signin";

  /*
   * Visualize the returned hierarchy like this:
   *
   * section.shell
   * `-- div.card
   *     |-- div.modePicker
   *     |   |-- button "Sign in"
   *     |   `-- button "Create account"
   *     |-- p.eyebrow
   *     |-- h1
   *     |-- p.intro
   *     `-- form
   *         |-- TextField (renders a label, input shell, input, and optional message)
   *         |-- TextField (renders the password controls)
   *         |-- Button (renders a real <button type="submit">)
   *         `-- p.status
   *
   * JSX indentation mirrors parent/child HTML nesting. Elements farther right are children.
   */
  // Layer 1: the outer section groups the complete authentication experience.
  return (
    <section aria-labelledby="auth-heading" className={styles.shell}>
      {/* Layer 2: the card controls the inner surface, spacing, and entrance animation. */}
      <div className={styles.card}>
        {/* Layer 3A: this control group switches the same form between sign-in and sign-up modes. */}
        <div className={styles.modePicker} role="group" aria-label="Authentication mode">
          <button
            aria-pressed={isSignin}
            disabled={isSubmitting}
            onClick={() => selectMode("signin")}
            type="button"
          >
            Sign in
          </button>
          <button
            aria-pressed={!isSignin}
            disabled={isSubmitting}
            onClick={() => selectMode("signup")}
            type="button"
          >
            Create account
          </button>
        </div>

        {/* Layer 3B: these sibling text elements describe the currently selected mode. */}
        <p className={styles.eyebrow}>{isSignin ? "Welcome back" : "Join the marketplace"}</p>
        <h1 id="auth-heading">{isSignin ? "Access your tickets." : "Create your account."}</h1>
        <p className={styles.intro}>
          {isSignin
            ? "Use the email connected to your marketplace account."
            : "One account can list, edit, and purchase tickets."}
        </p>

        {/* Layer 3C: the form groups every control submitted together. */}
        <form className={styles.form} noValidate onSubmit={handleSubmit}>
          {/* Props configure one reusable TextField; inside it, those props become label/input attributes. */}
          <TextField
            autoComplete="email"
            error={errors.email}
            id="email"
            label="Email address"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
          {/* A second instance reuses the same hierarchy with password-specific props. */}
          <TextField
            autoComplete={isSignin ? "current-password" : "new-password"}
            error={errors.password}
            hint="8 to 256 characters"
            id="password"
            label="Password"
            maxLength={256}
            minLength={8}
            name="password"
            required
            type="password"
          />
          {/* `type="submit"` connects this button to the form's `onSubmit={handleSubmit}` handler. */}
          <Button disabled={isSubmitting} fullWidth type="submit">
            {isSubmitting
              ? isSignin
                ? "Signing in..."
                : "Creating account..."
              : isSignin
                ? "Continue to sign in"
                : "Create account"}
          </Button>
          {/* `aria-live` announces new status text without moving keyboard focus. */}
          <p
            aria-live="polite"
            className={`${styles.status} ${hasError ? styles.error : ""}`}
            role={hasError ? "alert" : undefined}
          >
            {message}
          </p>
        </form>
      </div>
    </section>
  );
}
