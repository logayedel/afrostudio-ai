# Architecture d'AfroStudio AI

## Principes

1. **Simple à déployer** : site statique sans compilation, servi par GitHub Pages. Modifier un fichier puis pousser suffit.
2. **Aucune clé API dans le navigateur** : toutes les clés vivent dans un serveur relais (`server/`, Cloudflare Worker).
3. **Honnêteté** : chaque fonctionnalité affiche si elle est réelle, en démonstration (brouillon automatique) ou non connectée.
4. **Évolutif** : moteurs IA derrière une interface unique (`/api/health`, `/api/generate`) ; on ajoute un fournisseur sans toucher à l'interface.

## Schéma

```
Navigateur (GitHub Pages)                        Cloudflare Worker (relais)          Fournisseurs IA
┌───────────────────────────────┐   HTTPS      ┌──────────────────────────┐       ┌──────────────┐
│ Interface (js/views)          │ ───────────▶ │ code d'accès, CORS,      │ ────▶ │ Claude (texte)│
│ Données : IndexedDB (js/db)   │  sans clé    │ quota quotidien,          │       │ image / vidéo │
│ Montage : ffmpeg.wasm (local) │ ◀─────────── │ clés API secrètes         │ ◀──── │ voix (à venir)│
└───────────────────────────────┘              └──────────────────────────┘       └──────────────┘
```

## Données (js/store.js)

- **Personnage** (bibliothèque globale) : nom, rôle, type, âge, apparence, tenue, couleurs, personnalité, voix, images de référence.
- **Projet** : titre, type (série/film), format (9:16 / 16:9), style, distribution (ids de personnages), décors récurrents, saisons.
- **Épisode** : idée (pitch, ton, public, durée, morale), scènes, musique, réglages d'export.
- **Scène** : décor, moment, résumé, personnages, répliques, plans, verrou.
- **Plan** : cadrage, caméra, description, action, durée, personnages, image de référence, clip vidéo.
- Fichiers (images, clips, sons) : stockés séparément dans IndexedDB (`blobs`) et référencés par identifiant.

Cohérence visuelle : `js/prompts.js` construit la « fiche d'identité » de chaque personnage et décor, recopiée mot
pour mot dans chaque prompt de plan. C'est la base sur laquelle s'ajouteront les références d'images pour les moteurs.

## Limites connues de la V1

- Données locales à un navigateur/appareil (sauvegarde par fichier). Prochaine étape : comptes + stockage cloud (ex. Supabase ou Cloudflare R2/D1).
- Export MP4 dans le navigateur : adapté aux épisodes courts (< 3–5 min) ; au-delà, prévoir un rendu serveur.
- Pas encore de génération d'images, de vidéos ni de voix IA.

## Feuille de route proposée

1. Déployer le relais et valider la génération de texte (scénario, storyboard).
2. Moteur d'images : planches de personnages et images de plans, avec images de référence pour la cohérence.
3. Moteur de voix : voix par personnage, multilingue, avec placement automatique au montage.
4. Moteur vidéo : génération image → vidéo par plan, file d'attente et suivi des coûts.
5. Comptes utilisateurs, stockage cloud, collaboration, puis offre commerciale (crédits, abonnements).
