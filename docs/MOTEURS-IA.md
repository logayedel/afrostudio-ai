# Connecter les moteurs IA (serveur relais)

Les clés API ne doivent **jamais** être placées dans le site (tout le monde pourrait les lire).
Elles sont stockées comme « secrets » dans un petit serveur relais gratuit sur Cloudflare.

## Ce qui est branché aujourd'hui

| Capacité | Fournisseur | État |
|---|---|---|
| Texte (scénario, scène, fiche personnage, storyboard) | Claude (Anthropic), modèle `claude-opus-5-5` | ✅ prêt |
| Images | à choisir | ⏳ |
| Vidéo | à choisir | ⏳ |
| Voix | à choisir (ex. ElevenLabs) | ⏳ |

## Déploiement (≈ 15 minutes, une seule fois)

Prérequis : un compte Cloudflare (gratuit), une clé API Anthropic (https://console.anthropic.com), Node.js installé.

```bash
cd server
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put STUDIO_ACCESS_CODE
npx wrangler deploy
```

- `STUDIO_ACCESS_CODE` : un mot de passe de votre choix, qui empêche des inconnus de consommer vos crédits.
- La commande `deploy` affiche une adresse du type `https://afrostudio-relais.<votre-compte>.workers.dev`.
- Dans l'application : **Paramètres → Adresse du serveur relais** + **Code d'accès**, puis « Enregistrer et tester ».

Optionnel — plafond quotidien de générations :

```bash
npx wrangler kv namespace create USAGE
```

Copiez l'identifiant affiché dans `wrangler.toml` (section `kv_namespaces`), puis redéployez. Réglez `DAILY_LIMIT`.

## Coûts (ordres de grandeur, novembre 2026 — à vérifier avant intégration)

| Usage | Estimation |
|---|---|
| Texte — Claude Opus 5.5 (4 $ / 20 $ par million de jetons entrée/sortie) | ≈ 0,05–0,30 $ par scénario d'épisode ; ≈ 0,02–0,10 $ par scène storyboardée |
| Images | ≈ 0,02–0,10 $ par image |
| Vidéo IA | ≈ 0,05–0,50 $ par seconde → 3–30 $ par minute d'épisode, essais ratés non compris |
| Voix IA | ≈ 0,05–0,30 $ pour 1 000 caractères |
| Cloudflare Workers | gratuit jusqu'à 100 000 requêtes/jour |
| GitHub Pages | gratuit |

Pour réduire le coût du texte, on peut passer `TEXT_EFFORT` à `low` ou changer `TEXT_MODEL` dans `wrangler.toml`
(choix qui peut réduire la qualité : à tester sur quelques épisodes).

## Ajouter un moteur (pour un développeur)

1. Ajouter la clé comme secret Wrangler.
2. Déclarer la capacité dans `capabilities()` (`server/src/worker.js`).
3. Ajouter une route (ex. `/api/image`) qui appelle le fournisseur.
4. Côté interface, les boutons « ✨ » correspondants s'activent quand `/api/health` annonce la capacité.

La génération vidéo est asynchrone chez la plupart des fournisseurs (plusieurs minutes) : prévoir une route
« lancer » + une route « état », et stocker le résultat (Cloudflare R2) avant import dans le projet.
