-- Migration 024: Admin role system
-- Adds is_admin() helper and admin bypass RLS policies

-- Helper function: check if current user has admin role in app_metadata
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- ============================================================
-- Admin bypass RLS policies
-- These are additive — Supabase ORs them with existing policies
-- ============================================================

-- advertisers: full CRUD
CREATE POLICY "admin_full_access_advertisers"
  ON advertisers FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- campaigns: full CRUD
CREATE POLICY "admin_full_access_campaigns"
  ON campaigns FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- creatives: full CRUD
CREATE POLICY "admin_full_access_creatives"
  ON creatives FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- bids: full CRUD
CREATE POLICY "admin_full_access_bids"
  ON bids FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- impressions: read only
CREATE POLICY "admin_read_impressions"
  ON impressions FOR SELECT
  USING (is_admin());

-- conversions: read only
CREATE POLICY "admin_read_conversions"
  ON conversions FOR SELECT
  USING (is_admin());

-- ad_fraud_events: full CRUD (need to mark resolved)
CREATE POLICY "admin_full_access_ad_fraud_events"
  ON ad_fraud_events FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- advertiser_transactions: read + insert (for adjustments)
CREATE POLICY "admin_read_advertiser_transactions"
  ON advertiser_transactions FOR SELECT
  USING (is_admin());

CREATE POLICY "admin_insert_advertiser_transactions"
  ON advertiser_transactions FOR INSERT
  WITH CHECK (is_admin());

-- supply_forecasts: full CRUD
CREATE POLICY "admin_full_access_supply_forecasts"
  ON supply_forecasts FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- floor_prices: full CRUD
CREATE POLICY "admin_full_access_floor_prices"
  ON floor_prices FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- profiles: read + update
CREATE POLICY "admin_read_profiles"
  ON profiles FOR SELECT
  USING (is_admin());

CREATE POLICY "admin_update_profiles"
  ON profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- follows: read
CREATE POLICY "admin_read_follows"
  ON follows FOR SELECT
  USING (is_admin());

-- alerts: read + update
CREATE POLICY "admin_read_alerts"
  ON alerts FOR SELECT
  USING (is_admin());

CREATE POLICY "admin_update_alerts"
  ON alerts FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- wagers: read + update
CREATE POLICY "admin_read_wagers"
  ON wagers FOR SELECT
  USING (is_admin());

CREATE POLICY "admin_update_wagers"
  ON wagers FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- connections: read + update
CREATE POLICY "admin_read_connections"
  ON connections FOR SELECT
  USING (is_admin());

CREATE POLICY "admin_update_connections"
  ON connections FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- Set initial admin user (replace with actual admin email)
-- ============================================================
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
WHERE email = 'dtm@getnorma.app';
