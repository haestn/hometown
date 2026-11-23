-- HomeTown — droits d'accès des comptes connectés (complément de 001_schema.sql).
-- Sur les projets Supabase récents, les tables créées par script ne sont plus ouvertes automatiquement :
-- ces lignes donnent aux comptes connectés le droit d'utiliser les tables. Les règles d'accès (RLS) de 001_schema.sql
-- limitent toujours chaque compte aux données de sa propre maison. Les visiteurs non connectés (anon) n'ont aucun accès.
-- À exécuter une fois : SQL Editor → New query → coller → Run. Sans danger si on le relance.

grant usage on schema public to authenticated;
grant select on public.app_meta to authenticated;
grant select, update on public.households to authenticated;
grant select on public.members to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert on public.events to authenticated;
grant select, insert, update on public.rewards to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
