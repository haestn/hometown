-- HomeTown — opération ponctuelle (novembre 2026) : remettre à zéro les points et le niveau d'Antoine.
-- Ce n'est PAS une évolution de la base : à exécuter une seule fois, dans Supabase → SQL Editor.
--
-- Ce qui change : chaque tâche cochée par Antoine vaut désormais 0 point.
-- Ce qui ne change pas : la liste des tâches cochées et leurs dates. Les tâches gardent donc
-- leur « dernière fois » et leur échéance, et le calendrier garde les jours actifs.
-- Les points de Céline ne sont pas touchés.

-- 1. Vérifier avant : nombre de tâches cochées et points actuels d'Antoine
select count(*) as taches_cochees, sum(points) as points
from public.events where member = 'ant';

-- 2. Remise à zéro
update public.events set points = 0 where member = 'ant';

-- 3. Vérifier après : la colonne points doit afficher 0
select count(*) as taches_cochees, sum(points) as points
from public.events where member = 'ant';

-- 4. Facultatif : si vous aviez déjà échangé des points contre une récompense pendant vos essais,
--    la cagnotte deviendrait négative. Pour effacer ces récompenses de test, retirez les deux tirets
--    au début de la ligne suivante, puis exécutez-la seule.
-- delete from public.rewards;
