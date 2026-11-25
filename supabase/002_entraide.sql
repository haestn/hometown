-- HomeTown v1.2 : demandes d'aide entre membres du foyer.
-- À exécuter UNE seule fois dans Supabase (SQL Editor), AVANT de déposer les fichiers de la v1.2.
-- Purement additif : aucune donnée existante n'est modifiée. Déposez la v1.2 juste après : un téléphone encore en v1.1
-- affichera « Mise à jour nécessaire » jusqu'à ce qu'il récupère la nouvelle version.

-- Qui reçoit la demande, à quelle demande se rapporte une réponse, et le petit mot facultatif
alter table public.events add column if not exists to_member text;
alter table public.events add column if not exists ref uuid;
alter table public.events add column if not exists note text;
alter table public.events drop constraint if exists events_note_len;
alter table public.events add constraint events_note_len check (note is null or char_length(note) <= 80);

-- Nouveaux types d'événements : ask (demande), ask_ok (acceptée), ask_no (pas dispo), ask_x (annulée)
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('done', 'ask', 'ask_ok', 'ask_no', 'ask_x'));

-- Numéro de schéma : les téléphones encore en v1.1 demanderont de rouvrir l'app pour se mettre à jour
update public.app_meta set v = '2' where k = 'schema_version';

-- Vérification : doit afficher les 3 nouvelles colonnes
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'events' and column_name in ('to_member', 'ref', 'note');
