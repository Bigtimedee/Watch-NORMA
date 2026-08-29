// Pure helpers for ingest-email-wagers. Kept in a separate file so unit tests
// can import them without triggering the top-level Deno.serve in index.ts.

/** Build the row inserted into `alerts` when an email-forwarded wager is
 *  imported. Exported for unit testing so the payload's column names are
 *  pinned against the alerts schema — the previous version used `message` /
 *  `status`, which the schema does not have (audit item E / 2026-08-23 H-9). */
export function buildEmailWagerAlertPayload(
  userId: string,
  wagersCreated: number,
  sportsbook: string,
): Record<string, unknown> {
  const bookName = sportsbook.charAt(0).toUpperCase() + sportsbook.slice(1);
  const plural = wagersCreated !== 1 ? "s" : "";
  const headline = `${wagersCreated} bet${plural} imported from ${bookName}`;
  return {
    user_id:    userId,
    alert_type: "email_wager_import",
    title:      headline,
    body:       `We imported your ${bookName} confirmation${plural}. Check your wager history to review.`,
    read:       false,
    explanation: {
      headline,
      bullets:  ["Imported from forwarded bet confirmation email", "Review in your Wagers tab"],
    },
  };
}
