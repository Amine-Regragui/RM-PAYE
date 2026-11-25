-- =====================================================================
-- RM Paie — mesure d'audience hébergée au Maroc, sans cookie et sans donnée personnelle
-- Chaque page vue incrémente un compteur journalier (page, source, type d'appareil).
-- Aucune adresse IP, aucun identifiant de visiteur, aucun cookie : rien ne permet de suivre une personne.
-- =====================================================================

create table if not exists public.audience_jour (
  jour date not null default current_date,
  page text not null,
  source text not null default 'direct',
  appareil text not null default 'ordinateur' check (appareil in ('mobile','tablette','ordinateur')),
  vues int not null default 0,
  visites int not null default 0,          -- premières pages d'une session de navigation
  primary key (jour, page, source, appareil)
);
alter table public.audience_jour enable row level security;
drop policy if exists audience_lecture on public.audience_jour;
create policy audience_lecture on public.audience_jour for select using (public.est_super_admin());

create or replace function public.compter_visite(p_page text, p_source text default null, p_appareil text default null, p_nouvelle boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_page text; v_src text; v_app text;
begin
  -- Garde-fou contre le remplissage abusif : au plus 2 000 combinaisons par jour
  if (select count(*) from audience_jour where jour = current_date) > 2000 then return; end if;
  v_page := left(coalesce(nullif(regexp_replace(lower(coalesce(p_page, '/')), '[^a-z0-9/._-]', '', 'g'), ''), '/'), 120);
  v_src := left(coalesce(nullif(regexp_replace(lower(coalesce(p_source, '')), '[^a-z0-9._-]', '', 'g'), ''), 'direct'), 60);
  v_app := case when p_appareil in ('mobile','tablette','ordinateur') then p_appareil else 'ordinateur' end;
  insert into audience_jour (jour, page, source, appareil, vues, visites) values (current_date, v_page, v_src, v_app, 1, case when p_nouvelle then 1 else 0 end)
  on conflict (jour, page, source, appareil) do update set vues = audience_jour.vues + 1, visites = audience_jour.visites + case when p_nouvelle then 1 else 0 end;
end $$;
grant execute on function public.compter_visite(text, text, text, boolean) to anon, authenticated;

-- Synthèse pour le super-administrateur (n derniers jours), avec les inscriptions pour mesurer la conversion
create or replace function public.admin_audience(p_jours int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := current_date - greatest(1, least(p_jours, 365)) + 1; r jsonb;
begin
  if not public.est_super_admin() then raise exception 'réservé au super-administrateur'; end if;
  select jsonb_build_object(
    'du', d, 'au', current_date,
    'vues', coalesce((select sum(vues) from audience_jour where jour >= d), 0),
    'visites', coalesce((select sum(visites) from audience_jour where jour >= d), 0),
    'inscriptions', (select count(*) from organisations where cree_le >= d),
    'par_jour', coalesce((select jsonb_agg(x order by x->>'jour') from (select jsonb_build_object('jour', jour, 'vues', sum(vues), 'visites', sum(visites)) x from audience_jour where jour >= d group by jour) t), '[]'),
    'pages', coalesce((select jsonb_agg(x) from (select jsonb_build_object('page', page, 'vues', sum(vues)) x from audience_jour where jour >= d group by page order by sum(vues) desc limit 15) t), '[]'),
    'sources', coalesce((select jsonb_agg(x) from (select jsonb_build_object('source', source, 'visites', sum(visites)) x from audience_jour where jour >= d group by source order by sum(visites) desc limit 10) t), '[]'),
    'appareils', coalesce((select jsonb_agg(x) from (select jsonb_build_object('appareil', appareil, 'visites', sum(visites)) x from audience_jour where jour >= d group by appareil order by sum(visites) desc) t), '[]')
  ) into r;
  return r;
end $$;

-- Conservation : 25 mois, puis suppression (appelée par la tâche quotidienne)
create or replace function public.nettoyer_audience() returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin delete from audience_jour where jour < current_date - interval '25 months'; get diagnostics v = row_count; return v; end $$;
revoke execute on function public.nettoyer_audience() from public, anon, authenticated;
