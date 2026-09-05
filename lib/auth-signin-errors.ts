/**
 * Sign-in error → recovery CTA mapping.
 *
 * Guardrail: never leave an email identity without a usable password path
 * in product UX. Supabase Auth returns the same generic
 * "Invalid login credentials" for a wrong password AND for an email
 * identity whose `encrypted_password` is empty.
 *
 * Historical case (production NORMA-app, 2026-09): users who signed up
 * with Apple (or later linked Apple) could have an email identity and
 * no usable password. Email/password sign-in then dead-ended on a toast.
 * Prefer Sign in with Apple as the primary recovery path on iOS; always
 * offer Forgot password / magic link as a second path.
 *
 * Do not put real passwords in this module or its tests.
 * A future CI auth health-check may read GitHub Actions secret
 * `OWNER_AUTH_PASSWORD` — document only; this file never reads it.
 */

export const SIGN_IN_APPLE_CTA_LABEL = "Sign in with Apple";
export const FORGOT_PASSWORD_CTA_LABEL = "Forgot password";
export const MAGIC_LINK_CTA_LABEL = "Email me a login link";

export const INVALID_CREDENTIALS_APPLE_MESSAGE =
  "That email and password did not work. If you previously used Sign in with Apple, tap Sign in with Apple — Apple-linked accounts have historically had no usable password, and this used to be a dead end.";

export const INVALID_CREDENTIALS_EMAIL_MESSAGE =
  "That email and password did not work. Reset your password or email yourself a login link. Some accounts were created with Sign in with Apple and never had a usable password.";

export type SignInRecoveryAction = "apple" | "forgot_password" | "none";

export type SignInErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "generic";

export type SignInErrorGuidance = {
  kind: SignInErrorKind;
  title: string;
  message: string;
  primaryAction: SignInRecoveryAction;
  appleCtaLabel: string;
  forgotPasswordCtaLabel: string;
  magicLinkCtaLabel: string;
};

function extractErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

export function isInvalidCredentialsMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("invalid email or password") ||
    normalized.includes("wrong password") ||
    normalized.includes("invalid_grant")
  );
}

/**
 * Same surface as invalid credentials: product code cannot tell a typo
 * from a missing `encrypted_password` on an Apple-linked email identity.
 */
export function looksLikeMissingPasswordPath(message: string): boolean {
  return isInvalidCredentialsMessage(message);
}

export function mapSignInError(
  error: unknown,
  options: { appleAvailable?: boolean } = {}
): SignInErrorGuidance {
  const message = extractErrorMessage(error);
  const appleAvailable = options.appleAvailable === true;
  const labels = {
    appleCtaLabel: SIGN_IN_APPLE_CTA_LABEL,
    forgotPasswordCtaLabel: FORGOT_PASSWORD_CTA_LABEL,
    magicLinkCtaLabel: MAGIC_LINK_CTA_LABEL,
  };

  if (isInvalidCredentialsMessage(message) || looksLikeMissingPasswordPath(message)) {
    return {
      kind: "invalid_credentials",
      title: "Couldn't sign in with that password",
      message: appleAvailable
        ? INVALID_CREDENTIALS_APPLE_MESSAGE
        : INVALID_CREDENTIALS_EMAIL_MESSAGE,
      primaryAction: appleAvailable ? "apple" : "forgot_password",
      ...labels,
    };
  }

  if (/email not confirmed/i.test(message)) {
    return {
      kind: "email_not_confirmed",
      title: "Confirm your email",
      message: appleAvailable
        ? "This email is not confirmed yet. Check your inbox, or use Sign in with Apple if that is how you created the account."
        : "This email is not confirmed yet. Check your inbox for a confirmation link, or use Forgot password to get a new one.",
      primaryAction: appleAvailable ? "apple" : "forgot_password",
      ...labels,
    };
  }

  return {
    kind: "generic",
    title: "Sign In Error",
    message: message || "Something went wrong. Try again.",
    primaryAction: "none",
    ...labels,
  };
}
