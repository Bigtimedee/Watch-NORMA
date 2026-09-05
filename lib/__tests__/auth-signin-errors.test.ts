import {
  INVALID_CREDENTIALS_APPLE_MESSAGE,
  INVALID_CREDENTIALS_EMAIL_MESSAGE,
  MAGIC_LINK_CTA_LABEL,
  SIGN_IN_APPLE_CTA_LABEL,
  FORGOT_PASSWORD_CTA_LABEL,
  isInvalidCredentialsMessage,
  looksLikeMissingPasswordPath,
  mapSignInError,
} from "../auth-signin-errors";

/**
 * Linked Apple users may have an empty `encrypted_password` historically.
 * Product UX must map that generic Auth error to an Apple / recovery CTA.
 *
 * Future optional CI smoke (not implemented here): GitHub Actions secret
 * name `OWNER_AUTH_PASSWORD`. Do not invent a vault file; never commit
 * real passwords.
 */

describe("isInvalidCredentialsMessage", () => {
  it("matches the generic Supabase email/password failure", () => {
    expect(isInvalidCredentialsMessage("Invalid login credentials")).toBe(true);
  });

  it("matches close variants", () => {
    expect(isInvalidCredentialsMessage("invalid credentials")).toBe(true);
    expect(isInvalidCredentialsMessage("Invalid email or password")).toBe(true);
    expect(isInvalidCredentialsMessage("Wrong password")).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isInvalidCredentialsMessage("Email rate limit exceeded")).toBe(false);
    expect(isInvalidCredentialsMessage("")).toBe(false);
  });
});

describe("looksLikeMissingPasswordPath", () => {
  it("treats invalid credentials as a missing usable password path", () => {
    // Cannot distinguish a typo from an Apple-linked empty encrypted_password.
    expect(looksLikeMissingPasswordPath("Invalid login credentials")).toBe(true);
  });
});

describe("mapSignInError — invalid credentials → Apple CTA", () => {
  it("on iOS, primary action is Sign in with Apple and copy mentions Apple", () => {
    const guidance = mapSignInError(new Error("Invalid login credentials"), {
      appleAvailable: true,
    });

    expect(guidance.kind).toBe("invalid_credentials");
    expect(guidance.primaryAction).toBe("apple");
    expect(guidance.appleCtaLabel).toBe(SIGN_IN_APPLE_CTA_LABEL);
    expect(guidance.appleCtaLabel).toBe("Sign in with Apple");
    expect(guidance.message).toBe(INVALID_CREDENTIALS_APPLE_MESSAGE);
    expect(guidance.message).toMatch(/Sign in with Apple/);
    expect(guidance.message).toMatch(/no usable password/);
    expect(guidance.forgotPasswordCtaLabel).toBe(FORGOT_PASSWORD_CTA_LABEL);
    expect(guidance.magicLinkCtaLabel).toBe(MAGIC_LINK_CTA_LABEL);
  });

  it("without Apple, primary action is forgot password", () => {
    const guidance = mapSignInError({ message: "Invalid login credentials" }, {
      appleAvailable: false,
    });

    expect(guidance.kind).toBe("invalid_credentials");
    expect(guidance.primaryAction).toBe("forgot_password");
    expect(guidance.message).toBe(INVALID_CREDENTIALS_EMAIL_MESSAGE);
    expect(guidance.message).toMatch(/login link/i);
  });

  it("maps similar invalid-credentials wording the same way", () => {
    const guidance = mapSignInError("invalid credentials", {
      appleAvailable: true,
    });
    expect(guidance.kind).toBe("invalid_credentials");
    expect(guidance.primaryAction).toBe("apple");
    expect(guidance.appleCtaLabel).toBe("Sign in with Apple");
  });
});

describe("mapSignInError — other errors", () => {
  it("keeps generic errors from forcing an Apple CTA", () => {
    const guidance = mapSignInError(new Error("Email rate limit exceeded"), {
      appleAvailable: true,
    });
    expect(guidance.kind).toBe("generic");
    expect(guidance.primaryAction).toBe("none");
    expect(guidance.message).toBe("Email rate limit exceeded");
  });

  it("offers Apple or forgot-password when email is unconfirmed", () => {
    const guidance = mapSignInError("Email not confirmed", {
      appleAvailable: true,
    });
    expect(guidance.kind).toBe("email_not_confirmed");
    expect(guidance.primaryAction).toBe("apple");
  });

  it("falls back to a generic title when the error has no message", () => {
    const guidance = mapSignInError(null);
    expect(guidance.kind).toBe("generic");
    expect(guidance.primaryAction).toBe("none");
    expect(guidance.title).toBe("Sign In Error");
  });
});
