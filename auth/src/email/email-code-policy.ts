const emailCodesDisabled =
  process.env.DISABLE_EMAIL_CODES === "true" &&
  process.env.NODE_ENV !== "production" &&
  process.env.NODE_ENV !== "test";

export { emailCodesDisabled };
