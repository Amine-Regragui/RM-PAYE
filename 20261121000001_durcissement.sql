-- =====================================================================
-- RM Paie — durcissement de sécurité (audit du 21/11/2026)
--   1. Moindre privilège sur les fonctions : un visiteur non connecté n'exécute que le strict nécessaire
--   2. La numérotation des factures n'est plus appelable de l'extérieur
--   3. Quotas anti-abus (envois d'e-mails, invitations)
--   4. Journal des connexions sensibles
-- =====================================================================

-- ---------- 1 et 2. Moindre privilège ----------
-- Par défaut PostgreSQL (et Supabase) autorisent tout le monde à exécuter chaque fonction du schéma public.
-- On retire ce droit aux visiteurs anonymes, sauf pour une courte liste, et on empêche qu'une future fonction soit ouverte par oubli.
do $$
declare f record;
  ouvertes text[] := array['compter_visite','essai_disponible','lire_espace','journal_erreur',
                           'est_membre','est_admin_org','est_super_admin','mfa_ok','org_ecriture_ouverte'];   -- les 5 dernières sont évaluées par les règles RLS
  internes text[] := array['prochain_numero','calcul_montant','tarif_validation','supprimer_compte','comptes_a_supprimer','nettoyer_erreurs','nettoyer_audience'];
begin
  for f in select p.oid, p.proname, p.oid::regprocedure as sig, has_function_privilege('authenticated', p.oid, 'execute') as auth_ok
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname = any(internes) then execute format('revoke all on function %s from authenticated', f.sig);
    elsif f.auth_ok then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if f.proname = any(ouvertes) then execute format('grant execute on function %s to anon', f.sig); end if;
    begin execute format('grant execute on function %s to service_role', f.sig); exception when undefined_object then null; end;
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- prochain_numero : sans cette restriction, n'importe qui pouvait « brûler » des numéros et créer des trous dans la numérotation légale des factures.

-- ---------- 3. Quotas anti-abus ----------
-- Vrai si l'organisation peut encore envoyer p_nb messages aujourd'hui (plafond : 1 000 bulletins par 24 h)
create or replace function public.quota_envois(p_org uuid, p_nb int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select sum((details->>'envoyes')::int) from journal where org_id = p_org and action = 'envoi_bulletins' and cree_le > now() - interval '24 hours'), 0) + greatest(p_nb, 0) <= 1000;
$$;
-- Vrai si l'organisation peut encore inviter (plafond : 20 invitations par 24 h)
create or replace function public.quota_invitations(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from invitations where org_id = p_org and cree_le > now() - interval '24 hours') < 20;
$$;
revoke all on function public.quota_envois(uuid, int) from public, anon, authenticated;
revoke all on function public.quota_invitations(uuid) from public, anon, authenticated;
do $$ begin grant execute on function public.quota_envois(uuid, int) to service_role; grant execute on function public.quota_invitations(uuid) to service_role; exception when undefined_object then null; end $$;

-- ---------- 4. Journal des connexions ----------
-- Enregistre une connexion réussie (appelée par le logiciel après l'entrée) : utile pour repérer un accès anormal.
create or replace function public.journal_connexion(p_agent text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from journal where user_id = auth.uid() and action = 'connexion' and cree_le > now() - interval '10 minutes') then return; end if;
  insert into journal (org_id, user_id, action, details)
  values ((select org_id from membres where user_id = auth.uid() order by ajoute_le limit 1), auth.uid(), 'connexion',
          jsonb_build_object('agent', left(p_agent, 200), 'double_auth', coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'));
end $$;
revoke all on function public.journal_connexion(text) from public, anon;
grant execute on function public.journal_connexion(text) to authenticated;

-- Dernières connexions de l'utilisateur lui-même (affichées dans l'onglet Sécurité)
create or replace function public.mes_connexions() returns table(cree_le timestamptz, agent text, double_auth boolean)
language sql stable security definer set search_path = public as $$
  select j.cree_le, j.details->>'agent', (j.details->>'double_auth')::boolean from journal j where j.user_id = auth.uid() and j.action = 'connexion' order by j.cree_le desc limit 10;
$$;
revoke all on function public.mes_connexions() from public, anon;
grant execute on function public.mes_connexions() to authenticated;

-- Conservation du journal : 3 ans (les écritures comptables restent dans factures et paiements)
create or replace function public.nettoyer_journal() returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin delete from journal where cree_le < now() - interval '3 years'; get diagnostics v = row_count; return v; end $$;
revoke all on function public.nettoyer_journal() from public, anon, authenticated;
