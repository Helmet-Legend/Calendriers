-- Tracé OpenStreetMap de la rue : liste de lignes [[[lng, lat], ...], ...].
-- null = pas encore cherché ; [] = introuvable.
alter table public.rues add column trace jsonb check (trace is null or jsonb_typeof(trace) = 'array');
