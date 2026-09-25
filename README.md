# Agenda de vie

Appli Android perso : emploi du temps guidé, rappels, rattrapage, bilan chiffré.

## Installer sur le téléphone
1. Sur le téléphone, ouvre la page **Releases** de ce dépôt et télécharge `AgendaDeVie.apk`.
2. Ouvre le fichier. Android demande d'autoriser l'installation depuis le navigateur : accepte.
3. Lance l'appli et **autorise les notifications**.
4. Paramètres Android → Applis → Agenda de vie → Batterie → **Sans restriction** (sinon certains téléphones coupent les rappels).

## Mettre à jour
Chaque modification envoyée sur `main` construit une nouvelle version (onglet Actions, environ 5 min).
Télécharge le nouvel APK et installe-le par-dessus : les données sont conservées.

## Structure
- `src/` : code de l'appli (données, logique, notifications, écrans)
- `www/` : appli web construite
- `ci/` : ajustements Android et clé de signature fixe
- `.github/workflows/build.yml` : construction automatique de l'APK
