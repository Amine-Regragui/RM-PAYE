-- =====================================================================
-- RM Paie — version commerciale (Supabase / PostgreSQL)
-- Comptes clients, abonnements, consommation, factures, paiements,
-- back-office. Sécurité par Row Level Security (RLS).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Paramètres de la plateforme (tarifs, émetteur des factures) ----------
create table if not exists public.parametres (
  cle text primary key,
  valeur jsonb not null,
  maj_le timestamptz not null default now()
);

insert into public.parametres (cle, valeur) values
('tarifs', '{"t1":25,"t2":22,"t3":18,"t4":15,"minimum":99,"cabinet":15,"cabinetMin":490,"carte":39,"essai":7,"moisOfferts":2,"tva":20,"delaiPaiement":15,"delaiSuspension":30,"offre":"","whatsapp":"","email":""}'),
('emetteur', '{"raison":"RM Expertise","adresse":"Marrakech","ice":"002759353000065","if":"","rc":"112993","tp":"45106705","rib":"","banque":"","email":"","telephone":""}')
on conflict (cle) do nothing;

-- ---------- Profils (un par utilisateur Supabase Auth) ----------
create table if not exists public.profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nom text,
  telephone text,
  super_admin boolean not null default false,
  derniere_connexion timestamptz,
  cree_le timestamptz not null default now()
);

-- ---------- Organisations (entreprises et cabinets clients) ----------
create sequence if not exists public.seq_numero_client start 1;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  numero_client text unique not null default ('RMP-' || lpad(nextval('public.seq_numero_client')::text, 6, '0')),
  type text not null default 'entreprise' check (type in ('entreprise','cabinet')),
  formule text not null default 'entreprise' check (formule in ('entreprise','cabinet','carte','gratuit')),
  raison_sociale text not null,
  ice text, identifiant_fiscal text, rc text,
  adresse text, ville text,
  telephone text, email_facturation text,
  forme_juridique text, representant text, cnss text,
  rc_fichier text, rc_fichier_nom text,          -- registre de commerce déposé (stockage « justificatifs »)
  fiche_complete_le timestamptz,                  -- tant que la fiche n'est pas complète, la paie reste fermée
  statut text not null default 'essai' check (statut in ('essai','actif','suspendu','resilie')),
  essai_fin date not null default (current_date + 7),
  resilie_le timestamptz,
  notes_admin text,
  cree_le timestamptz not null default now(),
  cree_par uuid references auth.users(id) on delete set null
);

create table if not exists public.membres (
  org_id uuid references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'collaborateur' check (role in ('admin','collaborateur')),
  ajoute_le timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists membres_user on public.membres(user_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  role text not null default 'collaborateur' check (role in ('admin','collaborateur')),
  invite_par uuid references auth.users(id) on delete set null,
  cree_le timestamptz not null default now(),
  acceptee_le timestamptz,
  unique (org_id, email)
);

-- ---------- Données de paie (documents JSON du logiciel) ----------
create table if not exists public.documents (
  org_id uuid not null references public.organisations(id) on delete cascade,
  cle text not null,
  data jsonb not null,
  maj_le timestamptz not null default now(),
  maj_par uuid default auth.uid(),
  primary key (org_id, cle)
);

-- Espaces clients chiffrés (clients des cabinets)
create table if not exists public.espaces (
  id text primary key,
  org_id uuid not null references public.organisations(id) on delete cascade,
  data jsonb not null,
  maj_le timestamptz not null default now()
);

-- ---------- Consommation (bulletins validés par mois) ----------
create table if not exists public.consommation (
  org_id uuid not null references public.organisations(id) on delete cascade,
  doc_cle text not null,
  periode text not null,                 -- 'AAAA-MM'
  nb_bulletins int not null default 0,
  valide_le timestamptz not null default now(),
  primary key (org_id, doc_cle)
);
create index if not exists consommation_periode on public.consommation(org_id, periode);

-- ---------- Factures et paiements ----------
create table if not exists public.compteurs (
  prefixe text not null,
  annee int not null,
  dernier int not null default 0,
  primary key (prefixe, annee)
);

create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete restrict,
  numero text unique not null,
  type text not null default 'facture' check (type in ('facture','avoir')),
  facture_origine uuid references public.factures(id),
  periode text,
  date_emission date not null default current_date,
  echeance date not null,
  client jsonb not null,                 -- copie figée des coordonnées du client
  emetteur jsonb not null,               -- copie figée des coordonnées de l'émetteur
  lignes jsonb not null,                 -- [{libelle, quantite, prix_unitaire, montant}]
  total_ht numeric(12,2) not null,
  taux_tva numeric(5,2) not null default 20,
  total_tva numeric(12,2) not null,
  total_ttc numeric(12,2) not null,
  statut text not null default 'emise' check (statut in ('emise','payee','annulee')),
  payee_le timestamptz,
  cree_le timestamptz not null default now()
);
alter table public.factures add column if not exists mode text not null default 'mensuel' check (mode in ('mensuel','prepaye'));
create unique index if not exists factures_org_periode on public.factures(org_id, periode) where type = 'facture' and statut <> 'annulee' and mode = 'mensuel';

create table if not exists public.paiements (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete restrict,
  org_id uuid not null references public.organisations(id) on delete restrict,
  montant numeric(12,2) not null,
  moyen text not null check (moyen in ('carte','virement','cheque','especes')),
  statut text not null default 'en_attente' check (statut in ('en_attente','reussi','echoue')),
  reference text,                        -- n° de commande CMI (oid) ou référence du virement
  transaction text,                      -- n° de transaction / autorisation CMI
  details jsonb,
  cree_le timestamptz not null default now(),
  confirme_le timestamptz
);
create unique index if not exists paiements_reference on public.paiements(reference) where reference is not null;

create table if not exists public.journal (
  id bigint generated always as identity primary key,
  org_id uuid,
  user_id uuid default auth.uid(),
  action text not null,
  details jsonb,
  cree_le timestamptz not null default now()
);

-- =====================================================================
-- Fonctions d'accès
-- =====================================================================
create or replace function public.est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select super_admin from public.profils where user_id = auth.uid()), false);
$$;

create or replace function public.est_membre(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.est_admin_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where org_id = p_org and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.org_ecriture_ouverte(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organisations where id = p_org and statut in ('essai','actif') and fiche_complete_le is not null);
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.parametres enable row level security;
alter table public.profils enable row level security;
alter table public.organisations enable row level security;
alter table public.membres enable row level security;
alter table public.invitations enable row level security;
alter table public.documents enable row level security;
alter table public.espaces enable row level security;
alter table public.consommation enable row level security;
alter table public.compteurs enable row level security;
alter table public.factures enable row level security;
alter table public.paiements enable row level security;
alter table public.journal enable row level security;

-- parametres : tarifs publics, émetteur visible des connectés, écriture super-admin
drop policy if exists parametres_lecture on public.parametres;
create policy parametres_lecture on public.parametres for select using (cle = 'tarifs' or auth.uid() is not null);
drop policy if exists parametres_ecriture on public.parametres;
create policy parametres_ecriture on public.parametres for all using (public.est_super_admin()) with check (public.est_super_admin());

-- profils
drop policy if exists profils_soi on public.profils;
create policy profils_soi on public.profils for select using (user_id = auth.uid() or public.est_super_admin());
drop policy if exists profils_maj on public.profils;
create policy profils_maj on public.profils for update using (user_id = auth.uid()) with check (user_id = auth.uid() and super_admin = (select p.super_admin from public.profils p where p.user_id = auth.uid()));

-- organisations : lecture membres, modification des coordonnées par l'admin (pas le statut)
drop policy if exists org_lecture on public.organisations;
create policy org_lecture on public.organisations for select using (public.est_membre(id) or public.est_super_admin());
drop policy if exists org_admin_sa on public.organisations;
create policy org_admin_sa on public.organisations for update using (public.est_super_admin()) with check (true);

-- membres
drop policy if exists membres_lecture on public.membres;
create policy membres_lecture on public.membres for select using (public.est_membre(org_id) or public.est_super_admin());
drop policy if exists membres_suppr on public.membres;
create policy membres_suppr on public.membres for delete using ((public.est_admin_org(org_id) and user_id <> auth.uid()) or public.est_super_admin());

-- invitations
drop policy if exists invitations_lecture on public.invitations;
create policy invitations_lecture on public.invitations for select using (public.est_admin_org(org_id) or public.est_super_admin());
drop policy if exists invitations_suppr on public.invitations;
create policy invitations_suppr on public.invitations for delete using (public.est_admin_org(org_id));

-- documents : membres ; écriture seulement si le compte est en essai ou actif
drop policy if exists documents_lecture on public.documents;
create policy documents_lecture on public.documents for select using (public.est_membre(org_id) or public.est_super_admin());
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert with check (public.est_membre(org_id) and public.org_ecriture_ouverte(org_id));
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update using (public.est_membre(org_id) and public.org_ecriture_ouverte(org_id)) with check (public.est_membre(org_id));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete using (public.est_membre(org_id) and public.org_ecriture_ouverte(org_id));

-- espaces : écrits par les membres du cabinet ; lus uniquement via la fonction lire_espace()
drop policy if exists espaces_membres on public.espaces;
create policy espaces_membres on public.espaces for all using (public.est_membre(org_id)) with check (public.est_membre(org_id));

-- consommation, factures, paiements : lecture membres admin ; écriture uniquement par fonctions serveur
drop policy if exists conso_lecture on public.consommation;
create policy conso_lecture on public.consommation for select using (public.est_membre(org_id) or public.est_super_admin());
drop policy if exists factures_lecture on public.factures;
create policy factures_lecture on public.factures for select using (public.est_admin_org(org_id) or public.est_super_admin());
drop policy if exists paiements_lecture on public.paiements;
create policy paiements_lecture on public.paiements for select using (public.est_admin_org(org_id) or public.est_super_admin());
drop policy if exists journal_lecture on public.journal;
create policy journal_lecture on public.journal for select using (public.est_super_admin());

-- =====================================================================
-- Comptes : création d'organisation, invitations, profil
-- =====================================================================
-- Registre des essais gratuits : un seul essai par adresse e-mail (et par ICE), même après résiliation ou suppression du compte
create table if not exists public.essais (
  email text primary key,            -- en minuscules
  ice text,
  org_id uuid references public.organisations(id) on delete set null,
  debut date not null default current_date
);
create index if not exists essais_ice on public.essais(ice) where ice is not null;
alter table public.essais enable row level security;   -- aucune lecture directe : seules les fonctions ci-dessous y accèdent

-- Vérifié avant l'inscription (page publique) : l'essai gratuit est-il encore possible pour cette adresse ?
create or replace function public.essai_disponible(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from essais where email = lower(trim(p_email)))
$$;
grant execute on function public.essai_disponible(text) to anon, authenticated;

create or replace function public.entrer() returns jsonb
language plpgsql security definer set search_path = public as $$
-- Appelée à chaque connexion : crée le profil, accepte les invitations en attente,
-- crée l'organisation au premier passage d'un inscrit, renvoie le contexte.
declare
  v_uid uuid := auth.uid();
  v_user auth.users%rowtype;
  v_meta jsonb;
  v_deja boolean;
  v_org uuid;
  v_inv record;
  v_tarifs jsonb;
begin
  if v_uid is null then raise exception 'non connecté'; end if;
  select * into v_user from auth.users where id = v_uid;
  v_meta := coalesce(v_user.raw_user_meta_data, '{}'::jsonb);
  insert into profils (user_id, nom, telephone, derniere_connexion) values (v_uid, v_meta->>'nom', v_meta->>'telephone', now())
    on conflict (user_id) do update set derniere_connexion = now();

  for v_inv in select * from invitations where lower(email) = lower(v_user.email) and acceptee_le is null loop
    insert into membres (org_id, user_id, role) values (v_inv.org_id, v_uid, v_inv.role) on conflict do nothing;
    update invitations set acceptee_le = now() where id = v_inv.id;
    insert into journal (org_id, action, details) values (v_inv.org_id, 'invitation_acceptee', jsonb_build_object('email', v_user.email));
  end loop;

  if not exists (select 1 from membres where user_id = v_uid) and coalesce(v_meta->>'raison_sociale', '') <> '' then
    select valeur into v_tarifs from parametres where cle = 'tarifs';
    -- Essai déjà utilisé avec cette adresse e-mail ou cet ICE : le compte est créé sans période gratuite
    v_deja := exists (select 1 from essais where email = lower(v_user.email))
           or (coalesce(v_meta->>'ice', '') <> '' and exists (select 1 from essais where ice = v_meta->>'ice'));
    insert into organisations (type, formule, raison_sociale, ice, telephone, email_facturation, cree_par, statut, essai_fin)
      values (case when v_meta->>'type' = 'cabinet' then 'cabinet' else 'entreprise' end,
              case when v_meta->>'type' = 'cabinet' then 'cabinet' else 'entreprise' end,
              v_meta->>'raison_sociale', v_meta->>'ice', v_meta->>'telephone', v_user.email, v_uid,
              case when v_deja then 'actif' else 'essai' end,
              case when v_deja then current_date - 1 else current_date + coalesce((v_tarifs->>'essai')::int, 7) end)
      returning id into v_org;
    if v_deja then
      insert into journal (org_id, action, details) values (v_org, 'essai_refuse', jsonb_build_object('email', v_user.email));
    else
      insert into essais (email, ice, org_id) values (lower(v_user.email), nullif(v_meta->>'ice', ''), v_org) on conflict (email) do nothing;
    end if;
    insert into membres (org_id, user_id, role) values (v_org, v_uid, 'admin');
    insert into journal (org_id, action) values (v_org, 'inscription');
  end if;

  return jsonb_build_object(
    'user_id', v_uid, 'email', v_user.email,
    'super_admin', (select super_admin from profils where user_id = v_uid),
    'organisations', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'raison_sociale', o.raison_sociale, 'numero_client', o.numero_client,
        'type', o.type, 'formule', o.formule, 'statut', o.statut, 'essai_fin', o.essai_fin, 'role', m.role, 'fiche_complete', o.fiche_complete_le is not null) order by o.raison_sociale)
      from membres m join organisations o on o.id = m.org_id where m.user_id = v_uid), '[]'::jsonb));
end $$;

-- Fiche société : obligatoire et complète (avec le registre de commerce) avant d'accéder à la paie
create or replace function public.completer_fiche(p_org uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_manque text[] := '{}'; v_fic text; k text;
begin
  if not public.est_admin_org(p_org) then raise exception 'réservé à l''administrateur du compte'; end if;
  foreach k in array array['raison_sociale','forme_juridique','ice','identifiant_fiscal','rc','cnss','representant','adresse','ville','telephone','email_facturation'] loop
    if coalesce(trim(p->>k), '') = '' then v_manque := v_manque || k; end if;
  end loop;
  if array_length(v_manque, 1) > 0 then raise exception 'champs obligatoires manquants : %', array_to_string(v_manque, ', '); end if;
  if (p->>'ice') !~ '^\d{15}$' then raise exception 'l''ICE doit comporter 15 chiffres'; end if;
  if (p->>'email_facturation') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'adresse e-mail invalide'; end if;
  if regexp_replace(p->>'telephone', '\D', '', 'g') !~ '^\d{9,13}$' then raise exception 'numéro de téléphone invalide'; end if;
  select coalesce(nullif(p->>'rc_fichier', ''), rc_fichier) into v_fic from organisations where id = p_org;
  if v_fic is null then raise exception 'joignez le registre de commerce (modèle J ou extrait de moins de 3 mois)'; end if;
  if v_fic not like p_org::text || '/%' then raise exception 'pièce jointe invalide'; end if;
  update organisations set
    raison_sociale = trim(p->>'raison_sociale'), forme_juridique = trim(p->>'forme_juridique'), ice = trim(p->>'ice'),
    identifiant_fiscal = trim(p->>'identifiant_fiscal'), rc = trim(p->>'rc'), cnss = trim(p->>'cnss'), representant = trim(p->>'representant'),
    adresse = trim(p->>'adresse'), ville = trim(p->>'ville'), telephone = trim(p->>'telephone'), email_facturation = lower(trim(p->>'email_facturation')),
    rc_fichier = v_fic, rc_fichier_nom = coalesce(nullif(p->>'rc_fichier_nom', ''), rc_fichier_nom),
    fiche_complete_le = coalesce(fiche_complete_le, now())
  where id = p_org;
  -- Même société déjà passée par un essai (ICE identique, autre compte) : fin immédiate de la période gratuite
  if exists (select 1 from essais e where e.ice = trim(p->>'ice') and e.org_id is distinct from p_org) then
    update organisations set essai_fin = least(essai_fin, current_date - 1), statut = case when statut = 'essai' then 'actif' else statut end
     where id = p_org and statut = 'essai';
  else
    update essais set ice = trim(p->>'ice') where org_id = p_org and ice is null;
  end if;
  insert into journal (org_id, action) values (p_org, 'fiche_societe');
end $$;

create or replace function public.maj_coordonnees(p_org uuid, p jsonb) returns void
language sql security definer set search_path = public as $$ select public.completer_fiche(p_org, p) $$;

create or replace function public.inviter(p_org uuid, p_email text, p_role text default 'collaborateur') returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.est_admin_org(p_org) then raise exception 'réservé à l''administrateur du compte'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'adresse e-mail invalide'; end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is not null then
    insert into membres (org_id, user_id, role) values (p_org, v_uid, p_role) on conflict (org_id, user_id) do update set role = excluded.role;
  else
    insert into invitations (org_id, email, role, invite_par) values (p_org, lower(p_email), p_role, auth.uid())
      on conflict (org_id, email) do update set role = excluded.role, acceptee_le = null;
  end if;
  insert into journal (org_id, action, details) values (p_org, 'invitation', jsonb_build_object('email', p_email, 'role', p_role));
end $$;

create or replace function public.membres_org(p_org uuid) returns table(user_id uuid, email text, nom text, role text, derniere_connexion timestamptz, invitation boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, p.nom, m.role, p.derniere_connexion, false
    from membres m join auth.users u on u.id = m.user_id left join profils p on p.user_id = m.user_id
   where m.org_id = p_org and (public.est_membre(p_org) or public.est_super_admin())
  union all
  select null, i.email, null, i.role, null, true from invitations i
   where i.org_id = p_org and i.acceptee_le is null and (public.est_admin_org(p_org) or public.est_super_admin())
$$;

create or replace function public.resilier(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin_org(p_org) then raise exception 'réservé à l''administrateur du compte'; end if;
  update organisations set statut = 'resilie', resilie_le = now() where id = p_org;
  insert into journal (org_id, action) values (p_org, 'resiliation');
end $$;

-- Lecture d'un espace client chiffré par son identifiant (accessible sans compte)
create or replace function public.lire_espace(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data from espaces where id = p_id;
$$;

-- =====================================================================
-- Consommation : comptage automatique des bulletins validés
-- =====================================================================
create or replace function public.compter_bulletins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from consommation where org_id = old.org_id and doc_cle = old.cle;
    return old;
  end if;
  if new.cle like 'per-%' then
    if coalesce((new.data->>'validated')::boolean, false) and jsonb_typeof(new.data->'bulletins') = 'object' then
      insert into consommation (org_id, doc_cle, periode, nb_bulletins, valide_le)
        values (new.org_id, new.cle, new.data->>'period', (select count(*) from jsonb_object_keys(new.data->'bulletins')), now())
        on conflict (org_id, doc_cle) do update set nb_bulletins = excluded.nb_bulletins, periode = excluded.periode, valide_le = now();
    else
      delete from consommation where org_id = new.org_id and doc_cle = new.cle;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists documents_conso on public.documents;
create trigger documents_conso after insert or update or delete on public.documents
  for each row execute function public.compter_bulletins();

-- =====================================================================
-- Facturation
-- =====================================================================
create or replace function public.prochain_numero(p_prefixe text, p_annee int) returns text
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into compteurs (prefixe, annee, dernier) values (p_prefixe, p_annee, 1)
    on conflict (prefixe, annee) do update set dernier = compteurs.dernier + 1
    returning dernier into v;
  return p_prefixe || p_annee || '-' || lpad(v::text, 5, '0');
end $$;

create or replace function public.calcul_montant(p_formule text, p_nb int, p_tarifs jsonb) returns jsonb
language plpgsql immutable as $$
declare pu numeric; ht numeric; mini numeric := 0; lib text;
begin
  if p_formule = 'cabinet' then
    pu := (p_tarifs->>'cabinet')::numeric; mini := (p_tarifs->>'cabinetMin')::numeric; lib := 'Formule Cabinet — salariés payés';
  elsif p_formule = 'carte' then
    pu := (p_tarifs->>'carte')::numeric; mini := 0; lib := 'Formule À la carte — bulletins validés';
  else
    pu := case when p_nb <= 20 then (p_tarifs->>'t1')::numeric when p_nb <= 50 then (p_tarifs->>'t2')::numeric
               when p_nb <= 200 then (p_tarifs->>'t3')::numeric else (p_tarifs->>'t4')::numeric end;
    mini := (p_tarifs->>'minimum')::numeric; lib := 'Formule Entreprise — salariés payés';
  end if;
  ht := round(p_nb * pu, 2);
  if ht < mini then
    return jsonb_build_object('ht', mini, 'lignes', jsonb_build_array(
      jsonb_build_object('libelle', lib, 'quantite', p_nb, 'prix_unitaire', pu, 'montant', ht),
      jsonb_build_object('libelle', 'Complément au minimum mensuel', 'quantite', 1, 'prix_unitaire', mini - ht, 'montant', mini - ht)));
  end if;
  return jsonb_build_object('ht', ht, 'lignes', jsonb_build_array(jsonb_build_object('libelle', lib, 'quantite', p_nb, 'prix_unitaire', pu, 'montant', ht)));
end $$;

-- Émet les factures d'un mois (par défaut le mois précédent). Idempotente.
create or replace function public.generer_factures(p_periode text default to_char(current_date - interval '1 month', 'YYYY-MM'))
returns int language plpgsql security definer set search_path = public as $$
declare
  v_tarifs jsonb; v_emetteur jsonb; v_org record; v_nb int; v_calc jsonb; v_ht numeric; v_tva numeric; v_taux numeric;
  v_debut date := to_date(p_periode || '-01', 'YYYY-MM-DD');
  v_fin date := (to_date(p_periode || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  v_count int := 0;
begin
  if auth.uid() is not null and not public.est_super_admin() then raise exception 'réservé au super-administrateur'; end if;
  select valeur into v_tarifs from parametres where cle = 'tarifs';
  select valeur into v_emetteur from parametres where cle = 'emetteur';
  v_taux := coalesce((v_tarifs->>'tva')::numeric, 20);

  -- fin des essais
  update organisations set statut = 'actif' where statut = 'essai' and essai_fin < current_date;

  for v_org in select * from organisations
     where statut in ('actif','suspendu') and formule <> 'gratuit'
       and false  -- facturation mensuelle désactivée : chaque validation est payée par carte (voir commandes)
       and essai_fin <= v_fin                      -- l'essai s'est terminé pendant ou avant la période
       and cree_le::date <= v_fin
       and not exists (select 1 from factures f where f.org_id = organisations.id and f.periode = p_periode and f.type = 'facture' and f.statut <> 'annulee')
  loop
    select coalesce(sum(nb_bulletins), 0) into v_nb from consommation where org_id = v_org.id and periode = p_periode;
    if v_org.formule = 'carte' and v_nb = 0 then continue; end if;
    v_calc := public.calcul_montant(v_org.formule, v_nb, v_tarifs);
    v_ht := (v_calc->>'ht')::numeric; v_tva := round(v_ht * v_taux / 100, 2);
    insert into factures (org_id, numero, periode, date_emission, echeance, client, emetteur, lignes, total_ht, taux_tva, total_tva, total_ttc)
    values (v_org.id, public.prochain_numero('F', extract(year from current_date)::int), p_periode, current_date,
            current_date + coalesce((v_tarifs->>'delaiPaiement')::int, 15),
            jsonb_build_object('numero_client', v_org.numero_client, 'raison_sociale', v_org.raison_sociale, 'ice', v_org.ice,
              'identifiant_fiscal', v_org.identifiant_fiscal, 'rc', v_org.rc, 'adresse', v_org.adresse, 'ville', v_org.ville, 'email', v_org.email_facturation),
            v_emetteur,
            (select jsonb_agg(l || jsonb_build_object('libelle', (l->>'libelle') || ' — ' || p_periode)) from jsonb_array_elements(v_calc->'lignes') l),
            v_ht, v_taux, v_tva, v_ht + v_tva);
    v_count := v_count + 1;
  end loop;
  insert into journal (action, details) values ('facturation', jsonb_build_object('periode', p_periode, 'factures', v_count));
  return v_count;
end $$;

-- Passe en « suspendu » les comptes dont une facture reste impayée au-delà du délai.
create or replace function public.maj_statuts() returns int
language plpgsql security definer set search_path = public as $$
declare v_delai int; v_n int;
begin
  select coalesce((valeur->>'delaiSuspension')::int, 30) into v_delai from parametres where cle = 'tarifs';
  update organisations set statut = 'actif' where statut = 'essai' and essai_fin < current_date;
  update organisations o set statut = 'suspendu'
   where o.statut = 'actif' and exists (select 1 from factures f where f.org_id = o.id and f.type = 'facture' and f.statut = 'emise'
                                          and f.date_emission + v_delai < current_date);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Enregistre un paiement confirmé (appelée par le rappel CMI ou par le super-admin pour un virement)
create or replace function public.enregistrer_paiement(p_facture uuid, p_montant numeric, p_moyen text, p_reference text, p_transaction text default null, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_f factures%rowtype;
begin
  if auth.uid() is not null and not public.est_super_admin() then raise exception 'réservé au super-administrateur'; end if;
  select * into v_f from factures where id = p_facture for update;
  if not found then raise exception 'facture introuvable'; end if;
  if v_f.statut = 'annulee' then raise exception 'facture annulée'; end if;
  if round(p_montant, 2) <> round(v_f.total_ttc, 2) then raise exception 'montant différent du total de la facture'; end if;
  insert into paiements (facture_id, org_id, montant, moyen, statut, reference, transaction, details, confirme_le)
    values (p_facture, v_f.org_id, p_montant, p_moyen, 'reussi', p_reference, p_transaction, p_details, now())
    on conflict (reference) where reference is not null do update set statut = 'reussi', transaction = excluded.transaction, details = excluded.details, confirme_le = now();
  update factures set statut = 'payee', payee_le = now() where id = p_facture and statut = 'emise';
  update organisations set statut = 'actif' where id = v_f.org_id and statut = 'suspendu'
    and not exists (select 1 from factures f2 where f2.org_id = v_f.org_id and f2.statut = 'emise' and f2.type = 'facture' and f2.id <> p_facture);
  insert into journal (org_id, action, details) values (v_f.org_id, 'paiement', jsonb_build_object('facture', v_f.numero, 'montant', p_montant, 'moyen', p_moyen));
end $$;

-- Annule une facture par un avoir (super-admin)
create or replace function public.emettre_avoir(p_facture uuid, p_motif text) returns text
language plpgsql security definer set search_path = public as $$
declare v_f factures%rowtype; v_num text;
begin
  if not public.est_super_admin() then raise exception 'réservé au super-administrateur'; end if;
  select * into v_f from factures where id = p_facture for update;
  if v_f.statut <> 'emise' then raise exception 'seule une facture non payée peut être annulée par avoir'; end if;
  v_num := public.prochain_numero('A', extract(year from current_date)::int);
  insert into factures (org_id, numero, type, facture_origine, periode, echeance, client, emetteur, lignes, total_ht, taux_tva, total_tva, total_ttc, statut)
    values (v_f.org_id, v_num, 'avoir', v_f.id, null, current_date, v_f.client, v_f.emetteur,
            jsonb_build_array(jsonb_build_object('libelle', 'Avoir sur facture ' || v_f.numero || ' — ' || coalesce(p_motif, ''), 'quantite', 1, 'prix_unitaire', -v_f.total_ht, 'montant', -v_f.total_ht)),
            -v_f.total_ht, v_f.taux_tva, -v_f.total_tva, -v_f.total_ttc, 'payee');
  update factures set statut = 'annulee' where id = p_facture;
  insert into journal (org_id, action, details) values (v_f.org_id, 'avoir', jsonb_build_object('facture', v_f.numero, 'avoir', v_num, 'motif', p_motif));
  return v_num;
end $$;

-- Actions du super-admin sur un compte
create or replace function public.admin_maj_org(p_org uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_super_admin() then raise exception 'réservé au super-administrateur'; end if;
  update organisations set
    statut = coalesce(p->>'statut', statut),
    formule = coalesce(p->>'formule', formule),
    essai_fin = coalesce((p->>'essai_fin')::date, essai_fin),
    notes_admin = coalesce(p->>'notes_admin', notes_admin)
  where id = p_org;
  insert into journal (org_id, action, details) values (p_org, 'admin_maj', p);
end $$;

-- =====================================================================
-- Tableau de bord du back-office
-- =====================================================================
create or replace function public.admin_kpis() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_tarifs jsonb; v_mois text := to_char(current_date, 'YYYY-MM');
begin
  if not public.est_super_admin() then raise exception 'réservé au super-administrateur'; end if;
  select valeur into v_tarifs from parametres where cle = 'tarifs';
  select jsonb_build_object(
    'clients', (select jsonb_object_agg(statut, n) from (select statut, count(*) n from organisations group by statut) s),
    'par_formule', (select jsonb_object_agg(formule, n) from (select formule, count(*) n from organisations where statut in ('essai','actif') group by formule) s),
    'essais_fin_7j', (select count(*) from organisations where statut = 'essai' and essai_fin between current_date and current_date + 3),
    'mrr_ht', (select coalesce(sum(total_ht), 0) from factures where type = 'facture' and statut <> 'annulee'
                 and periode = to_char(current_date - interval '1 month', 'YYYY-MM')),
    'encaisse_mois', (select coalesce(sum(montant), 0) from paiements where statut = 'reussi' and to_char(confirme_le, 'YYYY-MM') = v_mois),
    'impayes', (select jsonb_build_object('nombre', count(*), 'montant', coalesce(sum(total_ttc), 0)) from factures where statut = 'emise' and type = 'facture'),
    'impayes_echus', (select count(*) from factures where statut = 'emise' and type = 'facture' and echeance < current_date),
    'bulletins_mois', (select coalesce(sum(nb_bulletins), 0) from consommation where periode = v_mois),
    'historique', (select coalesce(jsonb_agg(x order by x->>'mois'), '[]'::jsonb) from (
        select jsonb_build_object('mois', m.mois,
          'bulletins', (select coalesce(sum(nb_bulletins), 0) from consommation c where c.periode = m.mois),
          'inscriptions', (select count(*) from organisations o where to_char(o.cree_le, 'YYYY-MM') = m.mois),
          'facture_ht', (select coalesce(sum(total_ht), 0) from factures f where f.periode = m.mois and f.type = 'facture' and f.statut <> 'annulee'),
          'encaisse', (select coalesce(sum(montant), 0) from paiements p where p.statut = 'reussi' and to_char(p.confirme_le, 'YYYY-MM') = m.mois)) x
        from (select to_char(d, 'YYYY-MM') mois from generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month') d) m) h)
  ) into r;
  return r;
end $$;

create or replace function public.admin_clients() returns table(
  id uuid, numero_client text, raison_sociale text, type text, formule text, statut text, essai_fin date, ice text, ville text,
  telephone text, email text, cree_le timestamptz, nb_utilisateurs bigint, bulletins_mois bigint, bulletins_total bigint,
  derniere_connexion timestamptz, impaye numeric, ca_total numeric, fiche_complete boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.numero_client, o.raison_sociale, o.type, o.formule, o.statut, o.essai_fin, o.ice, o.ville,
         o.telephone, o.email_facturation, o.cree_le,
         (select count(*) from membres m where m.org_id = o.id),
         (select coalesce(sum(nb_bulletins), 0) from consommation c where c.org_id = o.id and c.periode = to_char(current_date, 'YYYY-MM')),
         (select coalesce(sum(nb_bulletins), 0) from consommation c where c.org_id = o.id),
         (select max(p.derniere_connexion) from membres m join profils p on p.user_id = m.user_id where m.org_id = o.id),
         (select coalesce(sum(total_ttc), 0) from factures f where f.org_id = o.id and f.statut = 'emise' and f.type = 'facture'),
         (select coalesce(sum(montant), 0) from paiements p where p.org_id = o.id and p.statut = 'reussi'),
         o.fiche_complete_le is not null
    from organisations o
   where public.est_super_admin()
   order by o.cree_le desc
$$;

-- Estimation de la prochaine facture (visible dans « Mon compte »)
create or replace function public.estimation(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_o organisations%rowtype; v_nb int; v_t jsonb;
begin
  if not (public.est_membre(p_org) or public.est_super_admin()) then raise exception 'accès refusé'; end if;
  select * into v_o from organisations where id = p_org;
  select valeur into v_t from parametres where cle = 'tarifs';
  select coalesce(sum(nb_bulletins), 0) into v_nb from consommation where org_id = p_org and periode = to_char(current_date, 'YYYY-MM');
  return jsonb_build_object('bulletins', v_nb, 'calcul', public.calcul_montant(v_o.formule, v_nb, v_t), 'tva', coalesce((v_t->>'tva')::numeric, 20));
end $$;

-- =====================================================================
-- Droits d'exécution
-- =====================================================================
revoke all on function public.generer_factures(text) from public, anon, authenticated;
revoke all on function public.maj_statuts() from public, anon, authenticated;
revoke all on function public.enregistrer_paiement(uuid, numeric, text, text, text, jsonb) from public, anon;
grant execute on function public.generer_factures(text) to authenticated;   -- la fonction vérifie elle-même le super-admin
grant execute on function public.enregistrer_paiement(uuid, numeric, text, text, text, jsonb) to authenticated;
grant execute on function public.lire_espace(text) to anon, authenticated;

-- =====================================================================
-- Paiement par carte au moment de valider les bulletins
-- Chaque validation de mois est payée avant d'être enregistrée (sauf essai et formule gratuite).
-- Le montant est calculé sur le cumul des bulletins du mois, moins ce qui a déjà été payé ce mois-là.
-- =====================================================================
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  periode text not null,
  doc_cle text not null,
  nb_bulletins int not null,          -- bulletins de ce dossier
  nb_total int not null,              -- bulletins du mois, tous dossiers confondus, après cette validation
  lignes jsonb not null,
  total_ht numeric(12,2) not null, taux_tva numeric(5,2) not null, total_tva numeric(12,2) not null, total_ttc numeric(12,2) not null,
  statut text not null default 'en_attente' check (statut in ('en_attente','payee','abandonnee')),
  reference text unique,              -- identifiant de commande transmis au CMI
  facture_id uuid references public.factures(id),
  cree_par uuid references auth.users(id) on delete set null,
  cree_le timestamptz not null default now(),
  payee_le timestamptz
);
create index if not exists commandes_org_periode on public.commandes(org_id, periode);
alter table public.commandes enable row level security;
drop policy if exists commandes_lecture on public.commandes;
create policy commandes_lecture on public.commandes for select using (public.est_membre(org_id) or public.est_super_admin());

create or replace function public.tarif_validation(p_org uuid, p_periode text, p_doc text, p_nb int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_o organisations%rowtype; v_t jsonb; v_autres int; v_total int; v_calc jsonb; v_ht numeric; v_deja numeric; v_du numeric; v_taux numeric;
begin
  select * into v_o from organisations where id = p_org;
  if not found then raise exception 'société introuvable'; end if;
  if v_o.formule = 'gratuit' then return jsonb_build_object('gratuit', true, 'a_payer_ht', 0, 'a_payer_ttc', 0); end if;
  if v_o.statut = 'essai' and v_o.essai_fin >= current_date then return jsonb_build_object('essai', true, 'essai_fin', v_o.essai_fin, 'a_payer_ht', 0, 'a_payer_ttc', 0); end if;
  select valeur into v_t from parametres where cle = 'tarifs';
  v_taux := coalesce((v_t->>'tva')::numeric, 20);
  select coalesce(sum(nb_bulletins), 0) into v_autres from consommation where org_id = p_org and periode = p_periode and doc_cle <> p_doc;
  v_total := v_autres + p_nb;
  v_calc := public.calcul_montant(v_o.formule, v_total, v_t);
  v_ht := (v_calc->>'ht')::numeric;
  select coalesce(sum(total_ht), 0) into v_deja from commandes where org_id = p_org and periode = p_periode and statut = 'payee';
  v_du := greatest(round(v_ht - v_deja, 2), 0);
  return jsonb_build_object('nb', p_nb, 'nb_total', v_total, 'total_ht', v_ht, 'deja_paye_ht', v_deja, 'a_payer_ht', v_du,
    'taux_tva', v_taux, 'a_payer_tva', round(v_du * v_taux / 100, 2), 'a_payer_ttc', v_du + round(v_du * v_taux / 100, 2),
    'lignes', v_calc->'lignes', 'formule', v_o.formule);
end $$;

-- Montant à payer avant de valider (affiché à l'utilisateur)
create or replace function public.devis_validation(p_org uuid, p_periode text, p_doc text, p_nb int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_membre(p_org) then raise exception 'accès refusé'; end if;
  return public.tarif_validation(p_org, p_periode, p_doc, p_nb);
end $$;

-- Crée la commande à régler par carte ; la facture n'est émise qu'une fois le paiement confirmé par le CMI
create or replace function public.creer_commande_validation(p_org uuid, p_periode text, p_doc text, p_nb int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_id uuid; v_ht numeric;
begin
  if not public.est_membre(p_org) then raise exception 'accès refusé'; end if;
  if not public.org_ecriture_ouverte(p_org) then raise exception 'compte fermé à l''écriture'; end if;
  if p_doc not like 'per-%' or p_periode !~ '^\d{4}-\d{2}$' or p_nb < 1 then raise exception 'demande invalide'; end if;
  v := public.tarif_validation(p_org, p_periode, p_doc, p_nb);
  v_ht := (v->>'a_payer_ht')::numeric;
  if v_ht <= 0 then raise exception 'aucun paiement nécessaire'; end if;
  update commandes set statut = 'abandonnee' where org_id = p_org and periode = p_periode and statut = 'en_attente';
  insert into commandes (org_id, periode, doc_cle, nb_bulletins, nb_total, lignes, total_ht, taux_tva, total_tva, total_ttc, cree_par)
  values (p_org, p_periode, p_doc, p_nb, (v->>'nb_total')::int,
          jsonb_build_array(jsonb_build_object('libelle', 'Bulletins de paie ' || p_periode || ' — ' || (v->>'nb_total') || ' au total dans le mois'
              || case when (v->>'deja_paye_ht')::numeric > 0 then ', déjà réglé ' || (v->>'deja_paye_ht') || ' DH HT' else '' end,
            'quantite', (v->>'nb_total')::int, 'prix_unitaire', null, 'montant', v_ht)),
          v_ht, (v->>'taux_tva')::numeric, (v->>'a_payer_tva')::numeric, (v->>'a_payer_ttc')::numeric, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Paiement confirmé (rappel signé du CMI) : facture acquittée + paiement enregistré
create or replace function public.payer_commande(p_commande uuid, p_montant numeric, p_reference text, p_transaction text default null, p_details jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_c commandes%rowtype; v_o organisations%rowtype; v_em jsonb; v_fid uuid;
begin
  if auth.uid() is not null and not public.est_super_admin() then raise exception 'réservé au serveur de paiement'; end if;
  select * into v_c from commandes where id = p_commande for update;
  if not found then raise exception 'commande introuvable'; end if;
  if v_c.statut = 'payee' then return v_c.facture_id; end if;
  if round(p_montant, 2) <> round(v_c.total_ttc, 2) then raise exception 'montant différent de la commande'; end if;
  select * into v_o from organisations where id = v_c.org_id;
  select valeur into v_em from parametres where cle = 'emetteur';
  insert into factures (org_id, numero, mode, periode, date_emission, echeance, client, emetteur, lignes, total_ht, taux_tva, total_tva, total_ttc, statut, payee_le)
  values (v_c.org_id, public.prochain_numero('F', extract(year from current_date)::int), 'prepaye', v_c.periode, current_date, current_date,
          jsonb_build_object('numero_client', v_o.numero_client, 'raison_sociale', v_o.raison_sociale, 'ice', v_o.ice, 'identifiant_fiscal', v_o.identifiant_fiscal,
            'rc', v_o.rc, 'adresse', v_o.adresse, 'ville', v_o.ville, 'email', v_o.email_facturation),
          v_em, v_c.lignes, v_c.total_ht, v_c.taux_tva, v_c.total_tva, v_c.total_ttc, 'payee', now())
  returning id into v_fid;
  insert into paiements (facture_id, org_id, montant, moyen, statut, reference, transaction, details, confirme_le)
  values (v_fid, v_c.org_id, p_montant, 'carte', 'reussi', p_reference, p_transaction, p_details, now());
  update commandes set statut = 'payee', payee_le = now(), facture_id = v_fid where id = p_commande;
  insert into journal (org_id, action, details) values (v_c.org_id, 'paiement_validation', jsonb_build_object('periode', v_c.periode, 'montant', p_montant, 'bulletins', v_c.nb_total));
  return v_fid;
end $$;

-- Garde-fou côté base : un mois ne peut pas être validé (ni recevoir plus de bulletins) sans paiement
create or replace function public.verifier_paiement_validation() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nb int; v_old int := 0; v jsonb;
begin
  if new.cle not like 'per-%' then return new; end if;
  if not coalesce((new.data->>'validated')::boolean, false) or jsonb_typeof(new.data->'bulletins') <> 'object' then return new; end if;
  select count(*) into v_nb from jsonb_object_keys(new.data->'bulletins');
  if tg_op = 'UPDATE' and coalesce((old.data->>'validated')::boolean, false) and jsonb_typeof(old.data->'bulletins') = 'object' then
    select count(*) into v_old from jsonb_object_keys(old.data->'bulletins');
  end if;
  if v_nb <= v_old then return new; end if;
  v := public.tarif_validation(new.org_id, new.data->>'period', new.cle, v_nb);
  if (v->>'a_payer_ht')::numeric > 0 then
    raise exception 'paiement requis : % DH TTC pour valider % bulletin(s)', v->>'a_payer_ttc', v_nb using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists documents_paiement on public.documents;
create trigger documents_paiement before insert or update on public.documents
  for each row execute function public.verifier_paiement_validation();

revoke all on function public.payer_commande(uuid, numeric, text, text, jsonb) from public, anon;
grant execute on function public.payer_commande(uuid, numeric, text, text, jsonb) to authenticated;   -- la fonction vérifie elle-même
revoke all on function public.tarif_validation(uuid, text, text, int) from public, anon, authenticated;

-- =====================================================================
-- Tâches planifiées (extension pg_cron, à activer dans Supabase > Database > Extensions)
-- =====================================================================
-- select cron.schedule('rmpaie-facturation', '0 4 1 * *', $$select public.generer_factures()$$);
-- select cron.schedule('rmpaie-statuts', '30 4 * * *', $$select public.maj_statuts()$$);

-- Pour te désigner super-administrateur après ta première connexion :
-- update public.profils set super_admin = true where user_id = (select id from auth.users where email = 'ton.email@exemple.ma');
