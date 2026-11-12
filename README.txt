ASTRÉLYS V0.5 — fiches holographiques + constellations + messagerie privée Supabase

1. Sauvegarder les données V0.4 depuis l’onglet Journal (export JSON).
2. Envoyer le CONTENU de ce dossier dans le dépôt GitHub Pages, en remplaçant les fichiers existants.
3. Les fiches et l’inventaire fonctionnent immédiatement en local sur chaque appareil.
4. Pour les vrais messages, créer un projet sur supabase.com et exécuter supabase-setup.sql dans SQL Editor.
5. Dans Supabase > Project Settings > API Keys, copier Project URL et publishable key (ou anon public key) dans config.js.
6. Configurer Auth > Providers > Email, garder la confirmation d'email activée, limiter les inscriptions selon le besoin.
7. Se créer un compte MJ puis attribuer son rôle manuellement via la commande SQL en bas du fichier.
8. Les joueurs créent leur compte avec leur email. Leur nom affiché vient de l'inscription.
9. Les messages se rafraîchissent environ toutes les 7 secondes lorsque l'onglet est actif.
10. Ne PAS mettre de clé service_role, secret, mots de passe ou spoilers dans GitHub public.

Les PV, caractéristiques, inventaire et notes sont encore locaux. La messagerie privée n'est active qu'après configuration Supabase. Le contenu des messages n'est pas chiffré de bout en bout. Discord reste utilisé pour les communications vocales.
