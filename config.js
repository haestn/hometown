// HomeTown — réglages de connexion à Supabase.
// Remplacez les deux valeurs par celles de votre projet (Supabase → Project Settings → API).
// La clé « anon public » est faite pour être publique : la sécurité repose sur les règles d'accès de la base.
// Ne mettez JAMAIS ici la clé « service_role ».
// Tant que les valeurs restent « VOTRE_… », l'app fonctionne en mode essai local (données dans ce navigateur seulement).
// v1.3 : vapidPublicKey = la clé PUBLIQUE des notifications (page outils/cles-notifications.html). Jamais la clé privée.
window.HOMETOWN_CONFIG = {
  supabaseUrl: 'https://znokbirhaksfmascvhlh.supabase.co',
  supabaseAnonKey: 'sb_publishable_p-KOD2WE58oO-rd7Hb8HzA_5gp0Te75',
  vapidPublicKey: 'BGSSKaOVlasQQLMgH7DXQ1jbfc9oyp2La4f8n-qi7lczy4kvuuLSxjiNXr5K--NejStA4vdN2VbkJIAlWiFAhMA'
};
