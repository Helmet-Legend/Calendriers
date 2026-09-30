-- Somme finale remise par l'équipe en fin de tournée (facultative).
alter table public.equipes
  add column finale_especes numeric(10, 2) check (finale_especes >= 0),
  add column finale_cheques numeric(10, 2) check (finale_cheques >= 0),
  add column finale_a timestamptz;

-- Déclarée par l'équipe elle-même ou par un admin ; deux valeurs nulles l'effacent.
create function public.declarer_somme_finale(p_equipe uuid, p_especes numeric, p_cheques numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.est_admin() or public.mon_equipe() = p_equipe) then
    raise exception 'interdit' using errcode = '42501';
  end if;
  update public.equipes set
    finale_especes = case when p_especes is null then null else greatest(p_especes, 0) end,
    finale_cheques = case when p_cheques is null then null else greatest(p_cheques, 0) end,
    finale_a = case when p_especes is null and p_cheques is null then null else now() end
  where id = p_equipe;
end;
$$;
revoke execute on function public.declarer_somme_finale(uuid, numeric, numeric) from public, anon;
