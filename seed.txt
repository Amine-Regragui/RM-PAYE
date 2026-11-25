-- Données fictives de démonstration
insert into auth.users values
 ('a0000000-0000-4000-8000-000000000001','admin@demo.ma','{"nom":"Éditeur RM Paie"}','Demo@Paie2026'),
 ('a0000000-0000-4000-8000-000000000002','gerant@riad-atlas.ma','{"nom":"Karim Alaoui","telephone":"+212 6 00 00 00 01"}','Demo@Paie2026'),
 ('a0000000-0000-4000-8000-000000000003','cabinet@fiduciaire-atlas.ma','{"nom":"Salma Bennis","telephone":"+212 6 00 00 00 02"}','Demo@Paie2026'),
 ('a0000000-0000-4000-8000-000000000004','rh@baraka.ma','{"nom":"Youssef Idrissi"}','Demo@Paie2026'),
 ('a0000000-0000-4000-8000-000000000005','contact@garage-tazi.ma','{"nom":"Omar Tazi"}','Demo@Paie2026'),
 ('a0000000-0000-4000-8000-000000000006','nouveau@demo.ma','{"nom":"Nadia Berrada"}','Demo@Paie2026');

insert into profils (user_id, nom, telephone, super_admin, derniere_connexion) values
 ('a0000000-0000-4000-8000-000000000001','Éditeur RM Paie',null,true, now()),
 ('a0000000-0000-4000-8000-000000000002','Karim Alaoui','+212 6 00 00 00 01',false, now() - interval '1 day'),
 ('a0000000-0000-4000-8000-000000000003','Salma Bennis','+212 6 00 00 00 02',false, now() - interval '3 days'),
 ('a0000000-0000-4000-8000-000000000004','Youssef Idrissi',null,false, now() - interval '9 days'),
 ('a0000000-0000-4000-8000-000000000005','Omar Tazi',null,false, now() - interval '45 days'),
 ('a0000000-0000-4000-8000-000000000006','Nadia Berrada',null,false, now());

insert into organisations (id, type, formule, raison_sociale, ice, identifiant_fiscal, rc, adresse, ville, telephone, email_facturation, statut, essai_fin, cree_le) values
 ('b0000000-0000-4000-8000-000000000001','entreprise','entreprise','Riad Atlas SARL','001234567000089','12345678','98765','12 Derb Sidi Ahmed, Médina','Marrakech','+212 6 00 00 00 01','gerant@riad-atlas.ma','actif', current_date - 160, now() - interval '190 days'),
 ('b0000000-0000-4000-8000-000000000002','cabinet','cabinet','Fiduciaire Atlas','002345678000012','23456789','45678','45 boulevard Zerktouni','Casablanca','+212 6 00 00 00 02','cabinet@fiduciaire-atlas.ma','actif', current_date - 130, now() - interval '160 days'),
 ('b0000000-0000-4000-8000-000000000003','entreprise','entreprise','Boulangerie Al Baraka','003456789000034',null,null,'8 rue Patrice Lumumba','Rabat','+212 6 00 00 00 03','rh@baraka.ma','actif', current_date - 95, now() - interval '125 days'),
 ('b0000000-0000-4000-8000-000000000004','entreprise','carte','Garage Tazi','004567890000056',null,null,'Zone industrielle Sidi Brahim','Fès','+212 6 00 00 00 04','contact@garage-tazi.ma','actif', current_date - 120, now() - interval '150 days'),
 ('b0000000-0000-4000-8000-000000000005','entreprise','entreprise','Atelier Majorelle','005678901000078',null,null,null,'Marrakech','+212 6 00 00 00 05','atelier@majorelle-demo.ma','essai', current_date + 4, now() - interval '3 days'),
 ('b0000000-0000-4000-8000-000000000006','cabinet','cabinet','Cabinet Comptable Souss','006789012000090',null,null,null,'Agadir','+212 6 00 00 00 06','contact@souss-demo.ma','essai', current_date + 6, now() - interval '1 day');

insert into organisations (id, type, formule, raison_sociale, telephone, email_facturation, statut, essai_fin)
values ('b0000000-0000-4000-8000-000000000007','entreprise','entreprise','Nouvelle Société','+212 6 00 00 00 07','nouveau@demo.ma','essai', current_date + 7);

insert into organisations (id, type, formule, raison_sociale, forme_juridique, representant, ice, identifiant_fiscal, rc, cnss, adresse, ville, telephone, email_facturation, statut, essai_fin, rc_fichier, rc_fichier_nom, fiche_complete_le, notes_admin)
values ('b0000000-0000-4000-8000-000000000008','cabinet','gratuit','RM Expertise','SARL','Amine Regragui','002759353000065','00000000','112993 Marrakech','0000000','Marrakech','Marrakech','+212 6 00 00 00 00','contact@rmpaie.ma','actif', current_date, 'b0000000-0000-4000-8000-000000000008/registre-commerce.pdf', 'registre-commerce.pdf', now(), 'Compte de l’éditeur : gratuit');

insert into membres (org_id, user_id, role) values
 ('b0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-000000000001','admin'),
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','admin'),
 ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','admin'),
 ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004','admin'),
 ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','admin'),
 ('b0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000006','admin');


-- Fiches complètes (sauf la nouvelle société) avec un registre de commerce fictif
update organisations set forme_juridique = 'SARL', representant = coalesce((select p.nom from membres m join profils p on p.user_id = m.user_id where m.org_id = organisations.id limit 1), 'Gérant'),
  ice = coalesce(ice, '00' || lpad((abs(hashtext(id::text)) % 1000000000000)::text, 13, '0')), identifiant_fiscal = coalesce(identifiant_fiscal, (abs(hashtext(raison_sociale)) % 90000000 + 10000000)::text),
  rc = coalesce(rc || ' ' || ville, (abs(hashtext(raison_sociale || 'rc')) % 90000 + 10000)::text || ' ' || ville), cnss = (abs(hashtext(raison_sociale || 'cnss')) % 9000000 + 1000000)::text,
  adresse = coalesce(adresse, 'Avenue Mohammed V'), rc_fichier = id::text || '/registre-commerce.pdf', rc_fichier_nom = 'registre-commerce.pdf', fiche_complete_le = cree_le
 where id <> 'b0000000-0000-4000-8000-000000000007';
insert into demo_fichiers select id::text || '/registre-commerce.pdf', 'registre-commerce.pdf', 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMzYgPj4Kc3RyZWFtCkJUIC9GMSAxNiBUZiA2MCA3NjAgVGQgKFJlZ2lzdHJlIGRlIGNvbW1lcmNlIC0gbW9kZWxlIEopIFRqIEVUIEJUIC9GMSAxMSBUZiA2MCA3MzUgVGQgKERvY3VtZW50IGZpY3RpZiBkZSBkZW1vbnN0cmF0aW9uIC0gUk0gUGFpZSkgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA0MjggMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0OTgKJSVFT0YK' from organisations where rc_fichier is not null;

-- Consommation des 5 derniers mois et du mois en cours
insert into consommation (org_id, doc_cle, periode, nb_bulletins)
select o.id, 'per-historique-' || to_char(m, 'YYYY-MM'), to_char(m, 'YYYY-MM'), o.n + (extract(month from m)::int % 3)
  from (values ('b0000000-0000-4000-8000-000000000001'::uuid, 7), ('b0000000-0000-4000-8000-000000000002'::uuid, 64),
               ('b0000000-0000-4000-8000-000000000003'::uuid, 23), ('b0000000-0000-4000-8000-000000000004'::uuid, 3)) o(id, n),
       generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date) - interval '1 month', interval '1 month') m;
insert into consommation (org_id, doc_cle, periode, nb_bulletins)
values ('b0000000-0000-4000-8000-000000000005', 'per-historique-' || to_char(current_date, 'YYYY-MM'), to_char(current_date, 'YYYY-MM'), 4);

-- Historique : chaque mois validé a été payé par carte au moment de la validation
do $$
declare c record; v_t jsonb; v_calc jsonb; v_ht numeric; v_id uuid; v_f uuid;
begin
  select valeur into v_t from public.parametres where cle = 'tarifs';
  for c in select k.*, o.formule from public.consommation k join public.organisations o on o.id = k.org_id
            where o.statut = 'actif' and k.periode < to_char(current_date, 'YYYY-MM') order by k.periode, o.raison_sociale loop
    v_calc := public.calcul_montant(c.formule, c.nb_bulletins, v_t); v_ht := (v_calc->>'ht')::numeric;
    insert into public.commandes (org_id, periode, doc_cle, nb_bulletins, nb_total, lignes, total_ht, taux_tva, total_tva, total_ttc)
    values (c.org_id, c.periode, c.doc_cle, c.nb_bulletins, c.nb_bulletins,
            jsonb_build_array(jsonb_build_object('libelle', 'Bulletins de paie ' || c.periode || ' — ' || c.nb_bulletins || ' au total dans le mois', 'quantite', c.nb_bulletins, 'montant', v_ht)),
            v_ht, 20, round(v_ht * 0.2, 2), v_ht + round(v_ht * 0.2, 2)) returning id into v_id;
    v_f := public.payer_commande(v_id, v_ht + round(v_ht * 0.2, 2), 'CMD-' || substr(v_id::text, 1, 8), 'T' || substr(md5(v_id::text), 1, 8), '{"carte":"4000 00** **** 0002"}');
    update public.factures set date_emission = (to_date(c.periode || '-28', 'YYYY-MM-DD')), echeance = (to_date(c.periode || '-28', 'YYYY-MM-DD')) where id = v_f;
    update public.paiements set confirme_le = to_date(c.periode || '-28', 'YYYY-MM-DD'), cree_le = to_date(c.periode || '-28', 'YYYY-MM-DD') where facture_id = v_f;
    update public.commandes set payee_le = to_date(c.periode || '-28', 'YYYY-MM-DD') where id = v_id;
  end loop;
end $$;


update public.parametres set valeur = valeur || '{"whatsapp":"+212 6 00 00 00 00","email":"contact@rmpaie.ma","offre":"Offre de lancement : 3 mois offerts sur l’abonnement annuel souscrit avant le 31 mars 2027."}'::jsonb where cle = 'tarifs';
update public.parametres set valeur = '{"raison":"RM Expertise","adresse":"Marrakech","ice":"002759353000065","if":"","rc":"112993","tp":"45106705","rib":"","banque":"","email":"contact@rmpaie.ma","telephone":""}'::jsonb where cle = 'emetteur';

-- Registre des essais gratuits : les comptes de démonstration ont déjà eu le leur
insert into public.essais (email, ice, org_id)
select lower(u.email), o.ice, o.id from auth.users u join public.membres m on m.user_id = u.id and m.role = 'admin' join public.organisations o on o.id = m.org_id
on conflict (email) do nothing;

-- Audience de démonstration (30 derniers jours, chiffres fictifs)
insert into public.audience_jour (jour, page, source, appareil, vues, visites)
select current_date - g, p.page, s.source, a.app, (5 + (g * 7 + length(p.page) * 3 + length(s.source)) % 23) * p.poids * s.poids, (2 + (g * 5 + length(s.source)) % 9) * s.poids * (case when p.page = '/' then 1 else 0 end)
from generate_series(0, 29) g
cross join (values ('/', 3), ('/reglementation/', 1), ('/reglementation/cotisations-cnss-amo-taux', 2), ('/reglementation/smig-smag-salaire-minimum', 2), ('/cgu', 1)) p(page, poids)
cross join (values ('direct', 2), ('google.com', 3), ('facebook.com', 1), ('linkedin.com', 1)) s(source, poids)
cross join (values ('mobile'), ('ordinateur')) a(app)
on conflict do nothing;
