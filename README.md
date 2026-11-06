# AfroStudio AI

Studio de création de dessins animés assisté par IA, accessible depuis un navigateur.
**Idée → Scénario → Personnages → Storyboard → Animation → Audio → Montage → Export MP4**

- Application : https://logayedel.github.io/afrostudio-ai/
- Ancienne version (V0.5, conservée) : https://logayedel.github.io/afrostudio-ai/legacy/v05/

## État de la V1

| Module | État | Détail |
|---|---|---|
| Tableau de bord | ✅ Réel | Projets, séries → saisons → épisodes, court-métrage, sauvegarde/restauration en fichier |
| Studio de personnages | ✅ Réel | Bibliothèque réutilisable, fiche d'identité visuelle, images de référence importées, voix (aperçu navigateur) |
| Scénariste | ✅ Réel / ✨ IA | Édition complète, verrouillage, régénération d'une seule scène (IA), export .txt |
| Storyboard | ✅ Réel / ✨ IA | Plans éditables (cadrage, caméra, durée, action), prompts cohérents générés automatiquement |
| Animation | ⏳ Import | Import des clips produits par des services externes. **Aucune génération vidéo IA n'est connectée.** |
| Audio | ✅ Réel | Enregistrement micro, import voix/bruitages/musique, placement sur les plans. Voix IA : à venir |
| Montage & export | ✅ Réel | Timeline, prévisualisation, export MP4 H.264/AAC (9:16 ou 16:9) dans le navigateur |
| Moteurs IA | ✨ Texte | Scénario, scènes, fiches et storyboard via Claude, par un serveur relais. Image/vidéo/voix : prévus |

« ✨ IA » = nécessite le serveur relais (voir `docs/MOTEURS-IA.md`). Sans lui, un **brouillon automatique**
(modèles prédéfinis, pas d'IA) est proposé et clairement signalé dans l'interface.

## Structure

```
index.html          Application (une seule page, sans étape de compilation)
css/app.css         Styles
js/                 Code de l'application (modules JavaScript)
vendor/             Petites bibliothèques tierces (ffmpeg.wasm, MIT)
server/             Serveur relais (Cloudflare Worker) qui détient les clés API
legacy/v05/         Ancienne application V0.5 (sauvegarde)
docs/               Architecture, moteurs IA et coûts
tests/              Test du montage avec FFmpeg
```

## Tester en local

```bash
python3 -m http.server 8765
```

Puis ouvrir http://localhost:8765. Tests : `node tests/montage.test.mjs` (FFmpeg requis) et `cd server && npm install && npm test`.
