-- Enregistre le tracé OpenStreetMap d'une rue encore sans tracé (admin ou équipe du secteur).
create function public.definir_trace(p_rue uuid, p_trace jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secteur uuid;
begin
  if jsonb_typeof(p_trace) <> 'array' or length(p_trace::text) > 200000 then
    raise exception 'tracé invalide' using errcode = '22023';
  end if;
  select secteur_id into v_secteur from public.rues where id = p_rue;
  if v_secteur is null or not public.peut_noter(v_secteur) then
    raise exception 'interdit' using errcode = '42501';
  end if;
  update public.rues set trace = p_trace where id = p_rue and trace is null;
end;
$$;
revoke execute on function public.definir_trace(uuid, jsonb) from public, anon;
