-- User preferences: favorite teams, players, notification settings
-- Separate from profiles to avoid bloating the auth-linked table

CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_teams JSONB DEFAULT '[]'::jsonb,
  favorite_players JSONB DEFAULT '[]'::jsonb,
  notification_settings JSONB DEFAULT '{
    "quiet_hours_start": null,
    "quiet_hours_end": null,
    "max_alerts_per_game": 5,
    "max_alerts_per_hour": 10,
    "channels": {"push": true, "in_app": true}
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-create preferences row when profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile_preferences()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_preferences
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_profile_preferences();
