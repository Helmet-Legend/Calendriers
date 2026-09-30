-- Tournée des calendriers : schéma initial
-- Rôles :
--   * admin  : utilisateur connecté par e-mail, présent dans public.admins
--   * équipe : utilisateur anonyme (Supabase anonymous sign-in) rattaché à une
--              équipe via son lien secret (public.rejoindre_equipe)

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables

create table public.config (
  id          int primary key default 1 check (id = 1),
  titre       text not null default 'Tournée des calendriers',
  ville       text not null default '',
  centre_lng  double precision not null default 2.35,
  centre_lat  double precision not null default 46.6,
  zoom        double precision not null default 5
);
insert into public.config (id) values (1);

create table public.admins (
  email      text primary key check (email = lower(email)),
  ajoute_a   timestamptz not null default now()
);

create table public.equipes (
  id        uuid primary key default gen_random_uuid(),
  nom       text not null check (length(nom) between 1 and 60),
  membres   text not null default '',
  depart    int  not null default 0 check (depart >= 0),
  couleur   text not null default '#2B6CB0',
  cree_a    timestamptz not null default now()
);

-- Jetons séparés des équipes : les équipes peuvent lire public.equipes,
-- mais seuls les admins voient les liens d'accès.
create table public.jetons_equipe (
  equipe_id uuid primary key references public.equipes on delete cascade,
  jeton     text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
);

create table public.membres_equipe (
  user_id    uuid primary key references auth.users on delete cascade,
  equipe_id  uuid not null references public.equipes on delete cascade,
  rejoint_a  timestamptz not null default now()
);
create index on public.membres_equipe (equipe_id);

create table public.secteurs (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null check (length(nom) between 1 and 40),
  equipe_id  uuid references public.equipes on delete set null,
  -- polygone GPS : [[lng, lat], ...] (non fermé)
  contour    jsonb not null default '[]'::jsonb check (jsonb_typeof(contour) = 'array'),
  cree_a     timestamptz not null default now()
);
create index on public.secteurs (equipe_id);

create table public.rues (
  id          uuid primary key default gen_random_uuid(),
  secteur_id  uuid not null references public.secteurs on delete cascade,
  nom         text not null check (length(nom) between 1 and 100),
  ordre       double precision not null default 0,
  etat        text not null default 'afaire' check (etat in ('afaire', 'encours', 'faite', 'arepasser')),
  arret       text not null default '',
  note        text not null default '',
  vendus      int  not null default 0 check (vendus >= 0),
  especes     numeric(10, 2) not null default 0 check (especes >= 0),
  cheques     numeric(10, 2) not null default 0 check (cheques >= 0),
  repasse     boolean not null default false,
  maj_a       timestamptz
);
create index on public.rues (secteur_id);

create table public.historique (
  id          bigint generated always as identity primary key,
  rue_id      uuid not null references public.rues on delete cascade,
  auteur      uuid,
  equipe_id   uuid,
  etat        text not null,
  arret       text not null,
  note        text not null,
  vendus      int not null,
  especes     numeric(10, 2) not null,
  cheques     numeric(10, 2) not null,
  a           timestamptz not null default now()
);
create index on public.historique (rue_id, a desc);

-- ---------------------------------------------------------------- helpers

create function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from public.admins where email = lower(auth.jwt() ->> 'email'));
$$;

create function public.mon_equipe() returns uuid
language sql stable security definer set search_path = '' as $$
  select equipe_id from public.membres_equipe where user_id = auth.uid();
$$;

create function public.peut_lire() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or public.mon_equipe() is not null;
$$;

create function public.peut_noter(p_secteur uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin()
      or exists (select 1 from public.secteurs s
                 where s.id = p_secteur and s.equipe_id is not null
                   and s.equipe_id = public.mon_equipe());
$$;

-- ---------------------------------------------------------------- RPC

-- Premier compte e-mail connecté : devient admin si aucun admin n'existe.
create function public.revendiquer_admin() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(auth.jwt() ->> 'email');
begin
  if v_email is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return false;
  end if;
  lock table public.admins in exclusive mode;
  if exists (select 1 from public.admins) then
    return public.est_admin();
  end if;
  insert into public.admins (email) values (v_email);
  return true;
end;
$$;

-- Rattache l'utilisateur courant (anonyme) à l'équipe du lien.
create function public.rejoindre_equipe(p_jeton text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_equipe uuid;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select equipe_id into v_equipe from public.jetons_equipe where jeton = p_jeton;
  if v_equipe is null then return null; end if;
  insert into public.membres_equipe (user_id, equipe_id) values (auth.uid(), v_equipe)
  on conflict (user_id) do update set equipe_id = excluded.equipe_id, rejoint_a = now();
  return v_equipe;
end;
$$;

-- Une équipe (ou un admin) note l'avancement d'une rue.
create function public.noter_rue(
  p_rue uuid, p_etat text, p_arret text, p_note text,
  p_vendus int, p_especes numeric, p_cheques numeric
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secteur uuid;
begin
  select secteur_id into v_secteur from public.rues where id = p_rue;
  if v_secteur is null or not public.peut_noter(v_secteur) then
    raise exception 'interdit' using errcode = '42501';
  end if;
  update public.rues set
    etat = p_etat,
    arret = left(coalesce(p_arret, ''), 80),
    note = left(coalesce(p_note, ''), 300),
    vendus = greatest(coalesce(p_vendus, 0), 0),
    especes = greatest(coalesce(p_especes, 0), 0),
    cheques = greatest(coalesce(p_cheques, 0), 0),
    repasse = repasse or p_etat = 'arepasser',
    maj_a = now()
  where id = p_rue;
end;
$$;

-- Une équipe (ou un admin) ajoute une rue oubliée à son secteur.
create function public.ajouter_rue(p_secteur uuid, p_nom text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.peut_noter(p_secteur) then
    raise exception 'interdit' using errcode = '42501';
  end if;
  insert into public.rues (secteur_id, nom, ordre)
  values (p_secteur, left(trim(p_nom), 100),
          coalesce((select max(ordre) + 1 from public.rues where secteur_id = p_secteur), 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- triggers

create function public.creer_jeton() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.jetons_equipe (equipe_id) values (new.id);
  return new;
end;
$$;
create trigger equipes_jeton after insert on public.equipes
  for each row execute function public.creer_jeton();

create function public.tracer_rue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.etat, new.arret, new.note, new.vendus, new.especes, new.cheques)
     is distinct from (old.etat, old.arret, old.note, old.vendus, old.especes, old.cheques) then
    insert into public.historique (rue_id, auteur, equipe_id, etat, arret, note, vendus, especes, cheques)
    values (new.id, auth.uid(), public.mon_equipe(), new.etat, new.arret, new.note, new.vendus, new.especes, new.cheques);
  end if;
  return new;
end;
$$;
create trigger rues_historique after update on public.rues
  for each row execute function public.tracer_rue();

-- ---------------------------------------------------------------- RLS

alter table public.config          enable row level security;
alter table public.admins          enable row level security;
alter table public.equipes         enable row level security;
alter table public.jetons_equipe   enable row level security;
alter table public.membres_equipe  enable row level security;
alter table public.secteurs        enable row level security;
alter table public.rues            enable row level security;
alter table public.historique      enable row level security;

create policy lecture on public.config   for select to authenticated using ((select public.peut_lire()));
create policy lecture on public.equipes  for select to authenticated using ((select public.peut_lire()));
create policy lecture on public.secteurs for select to authenticated using ((select public.peut_lire()));
create policy lecture on public.rues     for select to authenticated using ((select public.peut_lire()));
create policy lecture on public.historique for select to authenticated using ((select public.peut_lire()));
create policy lecture on public.membres_equipe for select to authenticated
  using ((select public.est_admin()) or user_id = (select auth.uid()));

create policy admin_maj   on public.config   for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy admin_tout  on public.admins   for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy admin_ecrit on public.equipes  for insert to authenticated with check ((select public.est_admin()));
create policy admin_maj   on public.equipes  for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy admin_suppr on public.equipes  for delete to authenticated using ((select public.est_admin()));
create policy admin_tout  on public.jetons_equipe for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy admin_suppr on public.membres_equipe for delete to authenticated using ((select public.est_admin()));
create policy admin_ecrit on public.secteurs for insert to authenticated with check ((select public.est_admin()));
create policy admin_maj   on public.secteurs for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy admin_suppr on public.secteurs for delete to authenticated using ((select public.est_admin()));
create policy admin_ecrit on public.rues     for insert to authenticated with check ((select public.est_admin()));
create policy admin_maj   on public.rues     for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy admin_suppr on public.rues     for delete to authenticated using ((select public.est_admin()));

-- Les fonctions internes ne sont pas des points d'API.
revoke execute on function public.creer_jeton(), public.tracer_rue() from public, anon, authenticated;
revoke execute on function public.revendiquer_admin(), public.rejoindre_equipe(text),
  public.noter_rue(uuid, text, text, text, int, numeric, numeric), public.ajouter_rue(uuid, text)
  from public, anon;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- temps réel

alter publication supabase_realtime add table public.config, public.equipes, public.secteurs, public.rues;
