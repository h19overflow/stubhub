import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import Image from "next/image";
import type { SyntheticEvent } from "react";
import { useRef, useState } from "react";
import { Button } from "../../components/primitives/Button";
import { TextField } from "../../components/primitives/TextField";
import { useAuthCredentials } from "../../hooks/auth/useAuthCredentials";
import styles from "./AuthForm.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type AuthMode = "signin" | "signup";
type FieldErrors = Partial<Record<"email" | "password", string>>;

export function AuthForm() {
  const authSection = useRef<HTMLElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<AuthMode>("signin");
  const { clearFeedback, hasError, isSubmitting, message, submit } = useAuthCredentials();

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          "[data-headline-word]",
          { opacity: 0, y: 18 },
          {
            clearProps: "opacity,transform",
            duration: 0.62,
            opacity: 1,
            stagger: 0.055,
            y: 0,
          },
        )
        .fromTo(
          "[data-headline-image]",
          { opacity: 0, scale: 0.92, y: 10 },
          {
            clearProps: "opacity,transform",
            duration: 0.72,
            opacity: 1,
            scale: 1,
            y: 0,
          },
          0.12,
        )
        .fromTo(
          "[data-auth-panel]",
          { opacity: 0, scale: 0.985, y: 26 },
          {
            clearProps: "opacity,transform",
            duration: 0.8,
            opacity: 1,
            scale: 1,
            stagger: 0.1,
            y: 0,
          },
          0.22,
        )
        .fromTo(
          "[data-trust-item]",
          { opacity: 0, y: 12 },
          {
            clearProps: "opacity,transform",
            duration: 0.58,
            opacity: 1,
            stagger: 0.07,
            y: 0,
          },
          0.46,
        );

      gsap.fromTo(
        "[data-media-scroll]",
        { opacity: 1, scale: 1 },
        {
          ease: "none",
          opacity: 0.78,
          scale: 0.965,
          scrollTrigger: {
            end: "bottom top",
            scrub: 0.7,
            start: "top 25%",
            trigger: "[data-media-shell]",
          },
        },
      );
    },
    { scope: authSection },
  );

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrors({});
    clearFeedback();
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    clearFeedback();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const nextErrors: FieldErrors = {};

    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (password.length < 8 || password.length > 256) {
      nextErrors.password = "Use between 8 and 256 characters.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    await submit(mode, { email, password });
  }

  const isSignin = mode === "signin";

  return (
    <section aria-labelledby="auth-page-heading" className={styles.shell} ref={authSection}>
      <h1
        aria-label="One account. Every side of the market."
        className={styles.headline}
        id="auth-page-heading"
      >
        <span className={styles.headlineLine}>
          <span data-headline-word>One</span>{" "}
          <span data-headline-word>account.</span>{" "}
          <span aria-hidden="true" className={styles.concertPill} data-headline-image>
            <Image
              alt=""
              fill
              sizes="(max-width: 640px) 96px, (max-width: 900px) 128px, 200px"
              src="/images/night-signal/auth-concert/auth-concert.png"
            />
          </span>{" "}
          <span data-headline-word>Every</span>{" "}
          <span data-headline-word>side</span>
        </span>
        <span className={styles.headlineLine}>
          <span data-headline-word>of</span>{" "}
          <span data-headline-word>the</span>{" "}
          <span data-headline-word>market.</span>
        </span>
      </h1>

      <div className={styles.authGrid}>
        <div className={styles.formPanel} data-auth-panel>
          <div aria-label="Authentication mode" className={styles.modePicker} role="group">
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

          <div className={styles.formCopy}>
            <h2 id="auth-heading">{isSignin ? "Access your tickets." : "Create your account."}</h2>
            <p>
              {isSignin
                ? "Use the email connected to your marketplace account."
                : "One account can list, edit, and purchase tickets."}
            </p>
          </div>

          <form
            aria-busy={isSubmitting}
            aria-labelledby="auth-heading"
            className={styles.form}
            noValidate
            onSubmit={handleSubmit}
          >
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

            <div className={styles.submitGroup}>
              <Button className={styles.submitButton} disabled={isSubmitting} fullWidth type="submit">
                {isSubmitting
                  ? isSignin
                    ? "Signing in..."
                    : "Creating account..."
                  : isSignin
                    ? "Continue to sign in"
                    : "Create account"}
              </Button>

              <div className={styles.feedback}>
                <p
                  aria-hidden={Boolean(message)}
                  className={`${styles.securityNote} ${message ? styles.feedbackHidden : ""}`}
                >
                  Sensitive sign-ins may require an email code.
                </p>
                <p
                  aria-live="polite"
                  className={`${styles.status} ${hasError ? styles.error : ""}`}
                  role={hasError ? "alert" : undefined}
                >
                  {message}
                </p>
              </div>
            </div>
          </form>
        </div>

        <div className={styles.mediaShell} data-auth-panel data-media-shell>
          <span aria-hidden="true" className={styles.stackPanel} />
          <span aria-hidden="true" className={styles.stackPanel} />
          <span aria-hidden="true" className={styles.stackPanel} />

          <figure className={styles.mediaPanel} data-media-scroll>
            <Image
              alt="Concertgoers watching a brightly lit stage"
              className={styles.mediaImage}
              fill
              preload
              sizes="(max-width: 900px) calc(100vw - 48px), 58vw"
              src="/images/night-signal/auth-concert/auth-concert.png"
            />
            <div aria-hidden="true" className={styles.mediaShade} />
            <figcaption className={styles.testimonial}>
              <blockquote>
                <p>“From discovery to doors open, everything I need, in one place.”</p>
                <footer>
                  — <cite>Jordan M.</cite>
                </footer>
              </blockquote>
            </figcaption>
          </figure>
        </div>
      </div>

      <ul aria-label="Account benefits" className={styles.trustGrid}>
        <li data-trust-item>Buy and sell with one identity</li>
        <li data-trust-item>Track every reservation and order</li>
        <li data-trust-item>Email verification when it matters</li>
      </ul>
    </section>
  );
}
