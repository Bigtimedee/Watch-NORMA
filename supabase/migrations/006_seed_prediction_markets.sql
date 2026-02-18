INSERT INTO streaming_providers (key, name, provider_type, ios_scheme, web_url, active)
VALUES
  ('kalshi', 'Kalshi', 'sportsbook', 'kalshi://', 'https://kalshi.com', true),
  ('polymarket', 'Polymarket', 'sportsbook', NULL, 'https://polymarket.com', true)
ON CONFLICT (key) DO NOTHING;
