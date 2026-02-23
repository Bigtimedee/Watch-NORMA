-- NORMA Advertising — Sponsor columns on alerts
-- Migration 020: Add sponsor fields to alerts table + seen_at trigger

-- Add sponsor columns to alerts
ALTER TABLE public.alerts ADD COLUMN sponsor_bid_id BIGINT REFERENCES public.bids(id) ON DELETE SET NULL;
ALTER TABLE public.alerts ADD COLUMN sponsor_text TEXT;
ALTER TABLE public.alerts ADD COLUMN sponsor_cta_url TEXT;
ALTER TABLE public.alerts ADD COLUMN sponsor_logo_url TEXT;
ALTER TABLE public.alerts ADD COLUMN clearing_price_cents INT;

CREATE INDEX idx_alerts_sponsor_bid ON public.alerts(sponsor_bid_id) WHERE sponsor_bid_id IS NOT NULL;

-- Trigger: when alerts.read flips to true, auto-set impressions.seen_at
CREATE OR REPLACE FUNCTION public.on_alert_read()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when read changes from false to true
  IF NEW.read = true AND (OLD.read = false OR OLD.read IS NULL) THEN
    -- Update the corresponding impression's seen_at
    IF NEW.sponsor_bid_id IS NOT NULL THEN
      UPDATE public.impressions
      SET seen_at = now()
      WHERE alert_id = NEW.id
        AND seen_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_alert_read_impression_seen
  AFTER UPDATE OF read ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.on_alert_read();
