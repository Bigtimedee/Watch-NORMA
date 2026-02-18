-- Add unique constraints for sportsdataio_id columns (required for upsert ON CONFLICT)
ALTER TABLE public.teams ADD CONSTRAINT teams_sportsdataio_id_unique UNIQUE (sportsdataio_id);
ALTER TABLE public.games ADD CONSTRAINT games_sportsdataio_id_unique UNIQUE (sportsdataio_id);
