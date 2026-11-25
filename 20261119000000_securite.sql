-- =====================================================================
-- RM Paie — sécurité et exploitation (19/11/2026)
--   1. Double authentification : une fois activée, aucune donnée n'est accessible sans le code (niveau aal2)
--   2. Journal des erreurs (navigateur, serveur) et alertes
--   3. Résiliation : 90 jours de lecture et d'export, puis suppression définitive
-- =====================================================================

-- ---------- 1. Double authentification ----------
-- Vrai si l'utilisateur n'a pas activé la double authentification, ou s'il a saisi son code dans cette session.
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

-- Les fonctions d'accès exigent désormais le second facteur quand il est activé :
-- toutes les règles RLS et les fonctions serveur qui s'appuient sur elles en héritent.
create or replace function public.est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select super_admin from public.profils where user_id = auth.uid()), false) and public.mfa_ok();
$$;
create or replace function public.est_membre(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where org_id = p_org and user_id = auth.uid()) and public.mfa_ok();
$$;
create or replace function public.est_admin_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where org_id = p_org and user_id = auth.uid() and role = 'admin') and public.mfa_ok();
$$;

-- Le point d'entrée de l'application refuse une session dont le second facteur n'a pas été saisi
create or replace function public.mfa_etat() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'active', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    'niveau', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'ok', public.mfa_ok());
$$;
grant execute on function public.mfa_etat() to authenticated;

-- Membres de l'organisation, avec l'état de leur double authentification (vu par l'administrateur)
create or replace function public.mfa_membres(p_org uuid) returns table(user_id uuid, active boolean)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified')
  from public.membres m where m.org_id = p_org and public.est_admin_org(p_org);
$$;

-- ---------- 2. Journal des erreurs ----------
create table if not exists public.erreurs (
  id bigint generated always as identity primary key,
  empreinte text not null unique,                 -- regroupe les occurrences d'une même erreur
  source text not null default 'navigateur' check (source in ('navigateur','serveur','base')),
  message text not null,
  pile text, url text, agent text, version text,
  user_id uuid, org_id uuid,
  nb int not null default 1,
  premier_le timestamptz not null default now(),
  dernier_le timestamptz not null default now(),
  statut text not null default 'nouvelle' check (statut in ('nouvelle','vue','resolue')),
  alerte_le timestamptz
);
create index if not exists erreurs_dernier on public.erreurs(dernier_le desc);
alter table public.erreurs enable row level security;
drop policy if exists erreurs_lecture on public.erreurs;
create policy erreurs_lecture on public.erreurs for select using (public.est_super_admin());

-- Enregistre une erreur (appelée par le navigateur, connecté ou non). Limitée pour éviter les abus.
create or replace function public.journal_erreur(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_msg text; v_pile text; v_src text; v_emp text; v_org uuid;
begin
  if (select count(*) from erreurs where dernier_le > now() - interval '1 minute') > 60 then return; end if;
  v_src := case when p->>'source' in ('navigateur','serveur','base') then p->>'source' else 'navigateur' end;
  if v_src <> 'navigateur' and auth.role() <> 'service_role' then v_src := 'navigateur'; end if;
  v_msg := left(coalesce(nullif(trim(p->>'message'), ''), 'Erreur sans message'), 500);
  v_pile := left(p->>'pile', 4000);
  v_emp := md5(v_src || '|' || v_msg || '|' || coalesce(split_part(v_pile, E'\n', 2), ''));
  begin v_org := nullif(p->>'org_id', '')::uuid; exception when others then v_org := null; end;
  if v_org is not null and not exists (select 1 from membres where org_id = v_org and user_id = auth.uid()) then v_org := null; end if;
  insert into erreurs (empreinte, source, message, pile, url, agent, version, user_id, org_id)
  values (v_emp, v_src, v_msg, v_pile, left(p->>'url', 300), left(p->>'agent', 300), left(p->>'version', 40), auth.uid(), v_org)
  on conflict (empreinte) do update set nb = erreurs.nb + 1, dernier_le = now(), url = excluded.url, agent = excluded.agent,
    user_id = coalesce(excluded.user_id, erreurs.user_id), org_id = coalesce(excluded.org_id, erreurs.org_id),
    statut = case when erreurs.statut = 'resolue' then 'nouvelle' else erreurs.statut end,
    alerte_le = case when erreurs.statut = 'resolue' then null else erreurs.alerte_le end;
end $$;
grant execute on function public.journal_erreur(jsonb) to anon, authenticated;

create or replace function public.admin_erreurs(p_statut text default null) returns setof public.erreurs
language sql stable security definer set search_path = public as $$
  select * from erreurs where public.est_super_admin() and (p_statut is null or statut = p_statut) order by dernier_le desc limit 300;
$$;
create or replace function public.admin_erreur_statut(p_id bigint, p_statut text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_super_admin() then raise exception 'réservé au super-administrateur'; end if;
  if p_statut not in ('nouvelle','vue','resolue') then raise exception 'statut inconnu'; end if;
  update erreurs set statut = p_statut where id = p_id;
end $$;
-- Purge des erreurs résolues anciennes (appelée par la tâche quotidienne)
create or replace function public.nettoyer_erreurs() returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin delete from erreurs where statut = 'resolue' and dernier_le < now() - interval '90 days'; get diagnostics v = row_count; return v; end $$;
revoke execute on function public.nettoyer_erreurs() from public, anon, authenticated;

-- ---------- 3. Résiliation : 90 jours puis suppression ----------
alter table public.organisations add column if not exists suppression_prevue date;
alter table public.organisations add column if not exists rappel_suppression_le timestamptz;

create or replace function public.resilier(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin_org(p_org) then raise exception 'réservé à l''administrateur du compte'; end if;
  update organisations set statut = 'resilie', resilie_le = now(), suppression_prevue = current_date + 90, rappel_suppression_le = null where id = p_org;
  insert into journal (org_id, action, details) values (p_org, 'resiliation', jsonb_build_object('suppression_prevue', current_date + 90));
end $$;

-- Annulation de la résiliation tant que les données existent : le compte redevient actif (paiement à l'usage)
create or replace function public.annuler_resiliation(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin_org(p_org) then raise exception 'réservé à l''administrateur du compte'; end if;
  update organisations set statut = 'actif', resilie_le = null, suppression_prevue = null, rappel_suppression_le = null where id = p_org and statut = 'resilie';
  insert into journal (org_id, action) values (p_org, 'annulation_resiliation');
end $$;

-- Comptes dont les données doivent être supprimées aujourd'hui (pour la tâche quotidienne, clé de service)
create or replace function public.comptes_a_supprimer() returns table(id uuid, raison_sociale text)
language sql stable security definer set search_path = public as $$
  select id, raison_sociale from organisations where statut = 'resilie' and suppression_prevue is not null and suppression_prevue <= current_date;
$$;
-- Suppression définitive des données d'un compte résilié (les fichiers sont effacés avant par la tâche, via l'API de stockage).
-- Les factures et paiements sont conservés 10 ans (obligation comptable) : ils sont détachés du compte, pas supprimés.
create or replace function public.supprimer_compte(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from organisations where id = p_org and statut = 'resilie' and suppression_prevue <= current_date) then raise exception 'compte non supprimable'; end if;
  insert into journal (org_id, action, details) select p_org, 'suppression_donnees', jsonb_build_object('raison_sociale', raison_sociale, 'numero_client', numero_client) from organisations where id = p_org;
  delete from documents where org_id = p_org;
  delete from espaces where org_id = p_org;
  delete from invitations where org_id = p_org;
  delete from membres where org_id = p_org;
  update organisations set ice = null, identifiant_fiscal = null, rc = null, adresse = null, ville = null, telephone = null, email_facturation = null,
         representant = null, cnss = null, rc_fichier = null, rc_fichier_nom = null, notes_admin = null,
         raison_sociale = '[données supprimées] ' || numero_client where id = p_org;
end $$;
revoke execute on function public.comptes_a_supprimer() from public, anon, authenticated;
revoke execute on function public.supprimer_compte(uuid) from public, anon, authenticated;

-- Une organisation résiliée reste lisible (consultation et export) mais n'est plus modifiable : déjà assuré par org_ecriture_ouverte().

-- Planification (pg_cron + pg_net), à exécuter une fois — voir README :
-- select cron.schedule('rmpaie-erreurs', '7 * * * *', $$ select net.http_post(url := 'https://VOTRE-PROJET.supabase.co/functions/v1/notifications',
--   body := '{"tache":"erreurs"}'::jsonb, headers := '{"Content-Type":"application/json","x-cron-secret":"..."}'::jsonb) $$);
