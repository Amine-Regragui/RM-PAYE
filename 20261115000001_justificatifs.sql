-- Stockage privé des justificatifs (registre de commerce en PDF/JPG/PNG ; pièces des salariés en PDF uniquement, contrôlé à l'envoi) : un dossier par société, lisible par ses membres et par l'éditeur
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificatifs', 'justificatifs', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists justif_depot on storage.objects;
create policy justif_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and (
    public.est_admin_org(((storage.foldername(name))[1])::uuid)                                                   -- registre de commerce
    or ((storage.foldername(name))[2] = 'salaries' and lower(name) like '%.pdf'
        and public.est_membre(((storage.foldername(name))[1])::uuid))                                          -- pièces des salariés : PDF uniquement
  ));
drop policy if exists justif_suppression on storage.objects;
create policy justif_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and (storage.foldername(name))[2] = 'salaries' and public.est_membre(((storage.foldername(name))[1])::uuid));
drop policy if exists justif_lecture on storage.objects;
create policy justif_lecture on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and (public.est_membre(((storage.foldername(name))[1])::uuid) or public.est_super_admin()));

-- Code privé du logiciel (moteur de calcul de paie) : lisible uniquement par les utilisateurs rattachés à une société, et par l'éditeur.
-- Après chaque construction du site, déposez web/prive/moteur.js dans ce stockage (voir README).
insert into storage.buckets (id, name, public) values ('logiciel', 'logiciel', false) on conflict (id) do nothing;
drop policy if exists logiciel_lecture on storage.objects;
create policy logiciel_lecture on storage.objects for select to authenticated
  using (bucket_id = 'logiciel' and (exists (select 1 from public.membres m where m.user_id = auth.uid()) or public.est_super_admin()));

