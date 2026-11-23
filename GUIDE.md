# Déployer HomeTown sur vos iPhone

Ce dossier contient l'app prête à mettre en ligne :

| Fichier | Rôle |
|---|---|
| `index.html` | l'app elle-même |
| `store.js` | la connexion à la base : compte (e-mail et mot de passe), synchronisation entre téléphones, envoi différé hors ligne, sauvegardes |
| `config.js` | **les deux réglages à remplir** (adresse et clé de votre projet Supabase) |
| `sw.js`, `manifest.webmanifest`, `icons/` | ce qui rend l'app installable sur l'écran d'accueil et utilisable sans réseau |
| `supabase/001_schema.sql` et `001b_droits.sql` | la création de la base et ses droits d'accès, à exécuter une fois dans Supabase, dans cet ordre |

Tant que `config.js` n'est pas rempli, l'app tourne en **mode essai local** : tout reste dans le navigateur, rien n'est partagé.

---

## 1. Préparer Supabase (une fois)

1. Dans votre projet Supabase, ouvrez **SQL Editor → New query**.
2. Copiez tout le contenu de `supabase/001_schema.sql`, collez-le, puis cliquez sur **Run**. Le message « Success. No rows returned » est normal.
3. Faites de même avec `supabase/001b_droits.sql`, dans une nouvelle requête.
4. Ouvrez **Authentication → Sign In / Providers → Email** et vérifiez que **Confirm email** est **désactivé**. La connexion se fait par e-mail et mot de passe, sans aucun e-mail envoyé.
5. Ouvrez **Project Settings → API Keys**, puis notez l'**URL du projet** et la clé **publishable** (ou « anon public »).
6. Plus tard, une fois vos deux comptes créés, vous pourrez désactiver **Allow new users to sign up** (Authentication → Sign In / Providers) : plus personne ne pourra créer de compte.

## 2. Remplir `config.js`

Ouvrez `config.js` et remplacez les deux valeurs `VOTRE_…` :

```js
window.HOMETOWN_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi…'
};
```

N'y mettez jamais la clé `service_role`, ni le mot de passe de la base.

## 3. Mettre l'app en ligne avec GitHub Pages

1. Sur github.com, cliquez sur **+ → New repository**, nommez-le `hometown`, choisissez **Public**, puis cliquez sur **Create repository**. Le plan gratuit de GitHub Pages exige un dépôt public. Le dépôt ne contient que le code : vos données restent dans Supabase, protégées par les règles d'accès.
2. Cliquez sur **uploading an existing file**, puis glissez **tout le contenu** du dossier `deploy` (fichiers et sous-dossiers `icons` et `supabase`). Cliquez ensuite sur **Commit changes**.
3. Ouvrez **Settings → Pages**. Dans « Build and deployment », choisissez **Deploy from a branch**, puis la branche **main** et le dossier **/ (root)**, et cliquez sur **Save**.
4. Après une à deux minutes, l'app est disponible à l'adresse `https://VOTRE-PSEUDO.github.io/hometown/`.

## 4. Installer l'app sur chaque iPhone

1. Ouvrez l'adresse dans **Safari**. Chrome ne permet pas l'installation sur iPhone.
2. Appuyez sur **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Ouvrez **HomeTown depuis son icône**, et non depuis Safari : sur iPhone, les deux ne partagent pas la session.
4. La première fois, appuyez sur **Première fois ? Créer mon compte**, puis entrez votre e-mail et choisissez un mot de passe. L'iPhone propose de l'enregistrer dans le trousseau. Les fois suivantes, il suffit de **Se connecter**, mais l'app reste normalement connectée.

**Première personne :**
1. Choisissez **Créer notre maison**, puis votre profil.
2. Notez le **code d'invitation** qui s'affiche. Il reste disponible dans le menu de l'avatar.

**Deuxième personne :**
1. Installez l'app, connectez-vous et choisissez **J'ai un code d'invitation**.
2. Entrez le code, puis choisissez votre profil.

Vous partez de zéro, et chaque tâche cochée apparaît en direct sur l'autre téléphone.

## 5. Au quotidien

- **Sans réseau**, l'app fonctionne quand même. Ce que vous cochez est envoyé dès que le réseau revient. Le menu de l'avatar indique « synchronisé » ou « N actions en attente d'envoi ».
- Le menu de l'avatar sert à trois choses :
  - **qui fait le ménage** : si l'un coche une tâche pour l'autre, il choisit son nom avant de cocher ;
  - **le code d'invitation** ;
  - **les sauvegardes**.
- **Sauvegarde mensuelle :**
  1. Ouvrez le menu, puis **Exporter une sauvegarde**.
  2. Choisissez **Enregistrer dans Fichiers**, puis votre dossier iCloud partagé `HomeTown`.
- **Restaurer une sauvegarde :** ouvrez le menu, puis **Importer une sauvegarde**. Rien n'est effacé : seules les actions absentes sont ajoutées, donc importer deux fois le même fichier ne crée pas de doublon.
- **Supabase gratuit met le projet en pause** après 7 jours sans aucune utilisation (par exemple pendant des vacances). Pour le relancer : supabase.com, puis votre projet, puis **Restore project**. Aucune donnée n'est perdue.
- **Mot de passe oublié :** l'app n'envoie pas d'e-mail, donc la réinitialisation se fait depuis Supabase.
  1. Ouvrez **Authentication → Users** et supprimez le compte concerné. Vos données ne sont pas touchées.
  2. Dans l'app, choisissez **Créer mon compte** avec la même adresse.
  3. Entrez le code d'invitation de la maison, puis reprenez votre profil.

## 6. Publier une nouvelle version (v1.1, v2.0…)

Vos données vivent dans la base, pas dans l'app : mettre l'app à jour ne les touche pas.

1. **Faites une sauvegarde** (Exporter), sur l'un des deux téléphones.
2. Dans les nouveaux fichiers, vérifiez que le numéro de version a bien changé dans `sw.js` (`VERSION`) et dans `index.html` (`APP_VERSION`). C'est ce changement qui déclenche la mise à jour.
3. **Si la base doit évoluer**, un fichier `supabase/002_….sql` sera fourni. Règles :
   - on ajoute des tables ou des colonnes, mais on ne supprime ni ne renomme rien ;
   - le fichier se termine par la mise à jour du numéro de schéma : `update app_meta set v='2' where k='schema_version';` ;
   - on exécute le fichier dans Supabase **avant** de publier l'app.
4. Pour une grosse version comme la v2.0, **testez d'abord sur une copie** :
   - créez un second projet Supabase (« hometown-test ») et un second dépôt GitHub (« hometown-test ») ;
   - importez-y votre sauvegarde et vérifiez que tout va bien ;
   - publiez ensuite sur le vrai dépôt.
5. Déposez les nouveaux fichiers dans le dépôt `hometown` (**Add file → Upload files**, en remplaçant les anciens).
6. À l'ouverture suivante, chaque iPhone affiche **« Une nouvelle version de HomeTown est prête »**. Un appui sur **Mettre à jour** suffit.

Une ancienne version de l'app peut tomber sur une base plus récente, par exemple sur un téléphone pas encore mis à jour. Dans ce cas, elle ne modifie rien et demande de rouvrir l'app.

## En cas de souci

| Ce que vous voyez | Que faire |
|---|---|
| « Pas de connexion internet » alors que le réseau marche | Vérifiez l'URL dans `config.js` (elle se termine par `.supabase.co`), ou relancez le projet s'il est en pause |
| « E-mail ou mot de passe incorrect » | Vérifiez l'adresse ; en cas d'oubli, voyez « Mot de passe oublié » plus haut |
| « Supabase demande une confirmation par e-mail » | Désactivez **Confirm email** (étape 1.4) |
| « Permission denied » ou maison introuvable après la connexion | Exécutez `001b_droits.sql` (étape 1.3) |
| L'app ne se met pas à jour | Fermez-la complètement (glisser vers le haut) puis rouvrez-la ; vérifiez que `VERSION` a changé dans `sw.js` |
| Mode essai local alors que vous voulez partager | `config.js` contient encore `VOTRE_…` |
