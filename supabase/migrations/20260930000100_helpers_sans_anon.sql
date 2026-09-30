-- Les fonctions d'aide aux règles RLS ne sont utiles qu'aux utilisateurs connectés.
revoke execute on function public.est_admin(), public.mon_equipe(), public.peut_lire(), public.peut_noter(uuid) from public, anon;
