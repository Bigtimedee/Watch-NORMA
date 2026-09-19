/**
 * Guards the checked-in RLS migration for sportsbook_restrictions,
 * partners, and partner_referral_codes. Reads the live SQL file.
 */

import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");
const MIGRATION =
  "supabase/migrations/20260919203000_rls_public_reference_tables.sql";

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("RLS public reference tables migration", () => {
  const sql = readRepo(MIGRATION);

  it("enables RLS on all three tables (relrowsecurity expected true)", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.sportsbook_restrictions ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(/ALTER TABLE public\.partners ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /ALTER TABLE public\.partner_referral_codes ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toContain("relrowsecurity");
  });

  it("is idempotent (DROP POLICY IF EXISTS before CREATE)", () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "sportsbook_restrictions_select"',
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "partner_referral_codes_select"',
    );
    expect(sql).toContain('DROP POLICY IF EXISTS "partners_select"');
  });

  it("grants sportsbook_restrictions SELECT to anon+authenticated and revokes writes", () => {
    expect(sql).toContain('CREATE POLICY "sportsbook_restrictions_select"');
    expect(sql).toMatch(
      /ON public\.sportsbook_restrictions[\s\S]*FOR SELECT[\s\S]*TO anon, authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.sportsbook_restrictions FROM anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE public\.sportsbook_restrictions TO anon, authenticated/,
    );
  });

  it("leaves partners with no client policies and revokes ALL from anon/authenticated", () => {
    expect(sql).not.toMatch(
      /CREATE POLICY "[^"]+"\s+ON public\.partners/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.partners FROM anon, authenticated/,
    );
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.partners TO service_role/);
  });

  it("grants partner_referral_codes SELECT and revokes client writes", () => {
    expect(sql).toContain('CREATE POLICY "partner_referral_codes_select"');
    expect(sql).toMatch(
      /ON public\.partner_referral_codes[\s\S]*FOR SELECT[\s\S]*TO anon, authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.partner_referral_codes FROM anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE public\.partner_referral_codes TO anon, authenticated/,
    );
  });

  it("does not FORCE RLS (service_role must keep BYPASSRLS)", () => {
    expect(sql).not.toMatch(
      /ALTER TABLE[\s\S]{0,80}FORCE ROW LEVEL SECURITY/,
    );
  });
});

describe("admin partners uses service role after RLS lock", () => {
  const page = readRepo("web/src/app/admin/partners/page.tsx");
  const actions = readRepo("web/src/app/admin/partners/actions.ts");

  it("page and createPartner use createSupabaseAdmin after requireAdmin", () => {
    expect(page).toContain("createSupabaseAdmin");
    expect(page).toContain("await requireAdmin()");
    expect(page).toMatch(/const supabase = createSupabaseAdmin\(\)/);
    expect(actions).toContain("createSupabaseAdmin");
    expect(actions).toContain("await requireAdmin()");
    expect(actions).toMatch(/const supabase = createSupabaseAdmin\(\)/);
  });
});
