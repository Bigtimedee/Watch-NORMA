-- Migration 023: Stripe Wallet — Pre-pay balance + transaction ledger
-- Adds stripe_customer_id and balance_cents to advertisers,
-- creates advertiser_transactions ledger,
-- updates record_auction_result() to deduct balance + log spend,
-- adds add_advertiser_funds() and check_advertiser_balance() functions.

-- ================================================================
-- 1. Add wallet columns to advertisers
-- ================================================================

ALTER TABLE public.advertisers
  ADD COLUMN stripe_customer_id TEXT UNIQUE,
  ADD COLUMN balance_cents BIGINT NOT NULL DEFAULT 0;

-- ================================================================
-- 2. Transaction ledger
-- ================================================================

CREATE TABLE public.advertiser_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'campaign_spend', 'refund', 'adjustment')),
  amount_cents BIGINT NOT NULL,  -- positive for deposits, negative for spend
  balance_after_cents BIGINT NOT NULL,
  description TEXT,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  campaign_id BIGINT REFERENCES public.campaigns(id) ON DELETE SET NULL,
  bid_id BIGINT REFERENCES public.bids(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_adv_txn_advertiser ON public.advertiser_transactions(advertiser_id);
CREATE INDEX idx_adv_txn_type ON public.advertiser_transactions(type);
CREATE INDEX idx_adv_txn_session ON public.advertiser_transactions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX idx_adv_txn_campaign ON public.advertiser_transactions(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- RLS: advertisers see only their own transactions
ALTER TABLE public.advertiser_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advertisers read own transactions" ON public.advertiser_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.advertisers a
      WHERE a.id = advertiser_transactions.advertiser_id
        AND a.auth_user_id = auth.uid()
    )
  );

-- ================================================================
-- 3. Idempotent deposit function
-- ================================================================

CREATE OR REPLACE FUNCTION public.add_advertiser_funds(
  p_advertiser_id BIGINT,
  p_amount_cents BIGINT,
  p_session_id TEXT,
  p_payment_intent_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing BIGINT;
  v_new_balance BIGINT;
BEGIN
  -- Idempotency check: skip if this session already credited
  SELECT id INTO v_existing
  FROM public.advertiser_transactions
  WHERE stripe_checkout_session_id = p_session_id
    AND type = 'deposit'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN false;  -- already processed
  END IF;

  -- Credit the balance
  UPDATE public.advertisers
  SET balance_cents = balance_cents + p_amount_cents,
      updated_at = now()
  WHERE id = p_advertiser_id
  RETURNING balance_cents INTO v_new_balance;

  -- Record the transaction
  INSERT INTO public.advertiser_transactions (
    advertiser_id, type, amount_cents, balance_after_cents,
    description, stripe_checkout_session_id, stripe_payment_intent_id
  ) VALUES (
    p_advertiser_id, 'deposit', p_amount_cents, v_new_balance,
    'Stripe Checkout deposit',
    p_session_id, p_payment_intent_id
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- 4. Balance check function
-- ================================================================

CREATE OR REPLACE FUNCTION public.check_advertiser_balance(
  p_advertiser_id BIGINT,
  p_required_cents BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT balance_cents INTO v_balance
  FROM public.advertisers
  WHERE id = p_advertiser_id;

  RETURN COALESCE(v_balance, 0) >= p_required_cents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- 5. Replace record_auction_result() to deduct balance + log spend
-- ================================================================

CREATE OR REPLACE FUNCTION public.record_auction_result(
  p_bid_id BIGINT,
  p_clearing_price INT
)
RETURNS void AS $$
DECLARE
  v_campaign_id BIGINT;
  v_advertiser_id BIGINT;
  v_new_balance BIGINT;
BEGIN
  -- Get campaign and advertiser from bid
  SELECT b.campaign_id, c.advertiser_id
  INTO v_campaign_id, v_advertiser_id
  FROM public.bids b
  JOIN public.campaigns c ON c.id = b.campaign_id
  WHERE b.id = p_bid_id;

  -- Update campaign spend atomically
  UPDATE public.campaigns
  SET spent_cents = spent_cents + p_clearing_price,
      updated_at = now()
  WHERE id = v_campaign_id;

  -- Deduct from advertiser balance
  UPDATE public.advertisers
  SET balance_cents = balance_cents - p_clearing_price,
      updated_at = now()
  WHERE id = v_advertiser_id
  RETURNING balance_cents INTO v_new_balance;

  -- Log the spend transaction
  INSERT INTO public.advertiser_transactions (
    advertiser_id, type, amount_cents, balance_after_cents,
    description, campaign_id, bid_id
  ) VALUES (
    v_advertiser_id, 'campaign_spend', -p_clearing_price, v_new_balance,
    'Auction impression',
    v_campaign_id, p_bid_id
  );

  -- Increment bid impressions
  PERFORM public.increment_bid_impressions(p_bid_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
