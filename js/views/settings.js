import { h, field, toast, notice } from '../ui.js';
import { getSettings, setSettings, checkStatus, CAPABILITIES } from '../engines/index.js';
import { storageEstimate, requestPersistence } from '../db.js';

// Estimations indicatives (novembre 2026) — à revérifier chez chaque fournisseur avant intégration.
const COSTS = [
  ['text', 'Claude (Anthropic) — Opus 5.5', 'Scénario complet d\'un épisode : ≈ 0,05 à 0,30 $ · Storyboard d\'une scène : ≈ 0,02 à 0,10 $', '✅ Intégré (serveur relais)'],
  ['image', 'Ex. : modèles d\'images (OpenAI, Google, Black Forest Labs, Ideogram…)', '≈ 0,02 à 0,10 $ par image', '⏳ Prévu'],
  ['video', 'Ex. : Veo, Kling, Runway, Hailuo, Grok Imagine…', '≈ 0,05 à 0,50 $ par seconde de vidéo → 3 à 30 $ par minute d\'épisode, hors essais ratés', '⏳ Prévu (le poste le plus coûteux)'],
  ['voice', 'Ex. : ElevenLabs, Azure Speech, Google TTS', '≈ 0,05 à 0,30 $ pour 1 000 caractères (≈ 1 min de dialogue)', '⏳ Prévu'],
];

export async function settingsView() {
  const s = getSettings();
  const statusBox = h('div', {});
  const est = await storageEstimate();

  async function test(force = true) {
    statusBox.replaceChildren(h('p', { class: 'muted' }, 'Vérification…'));
    const st = await checkStatus(force);
    dispatchEvent(new Event('engines-changed'));
    statusBox.replaceChildren(
      st.connected ? notice('real', 'Serveur relais connecté.') : notice('off', st.error),
      h('table', { class: 'caps' }, h('tbody', {}, Object.entries(CAPABILITIES).map(([k, c]) => h('tr', {},
        h('td', {}, c.icon, ' ', c.label),
        h('td', {}, st.capabilities?.[k] ? h('span', { class: 'badge ok' }, 'Disponible') : h('span', { class: 'badge off' }, 'Non connecté')),
        h('td', { class: 'muted small' }, st.models?.[k] || ''))))),
      st.limits?.dailyRequests ? h('p', { class: 'small muted' }, `Limite configurée sur le serveur : ${st.limits.dailyRequests} générations par jour.`) : null);
  }
  test(false);

  return h('section', { class: 'page narrow' },
    h('h1', {}, 'Paramètres'),
    h('div', { class: 'panel' },
      h('h2', {}, '🔌 Moteurs IA'),
      h('p', {}, 'Pour votre sécurité, aucune clé API n\'est saisie ni stockée dans le navigateur. Les clés sont placées sur un petit serveur relais (Cloudflare Worker, gratuit jusqu\'à 100 000 requêtes/jour) que vous déployez une seule fois. Le guide pas à pas se trouve dans ', h('code', {}, 'docs/MOTEURS-IA.md'), '.'),
      field('Adresse du serveur relais', s, 'proxyUrl', { placeholder: 'https://afrostudio-relais.votre-nom.workers.dev' }),
      field('Code d\'accès du studio', s, 'accessCode', { type: 'password', hint: 'Mot de passe que vous avez choisi lors du déploiement du relais. Il empêche des inconnus d\'utiliser vos crédits. Ce n\'est pas une clé API.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { s.proxyUrl = s.proxyUrl.trim(); setSettings(s); toast('Paramètres enregistrés', 'ok'); test(true); } }, 'Enregistrer et tester'),
        h('button', { class: 'btn ghost', onclick: () => { s.proxyUrl = ''; s.accessCode = ''; setSettings(s); dispatchEvent(new HashChangeEvent('hashchange')); test(true); } }, 'Déconnecter')),
      statusBox),
    h('div', { class: 'panel' },
      h('h2', {}, '💰 Coûts estimés des moteurs'),
      h('p', { class: 'muted small' }, 'Ordres de grandeur indicatifs, à vérifier sur les grilles tarifaires officielles avant chaque intégration. Les générations IA sont facturées par le fournisseur sur VOTRE compte.'),
      h('table', { class: 'caps' }, h('thead', {}, h('tr', {}, h('th', {}, 'Usage'), h('th', {}, 'Fournisseurs'), h('th', {}, 'Coût estimé'), h('th', {}, 'État'))),
        h('tbody', {}, COSTS.map(([k, prov, cost, st]) => h('tr', {}, h('td', {}, CAPABILITIES[k].icon, ' ', CAPABILITIES[k].label), h('td', { class: 'small' }, prov), h('td', { class: 'small' }, cost), h('td', { class: 'small' }, st)))))),
    h('div', { class: 'panel' },
      h('h2', {}, '💾 Stockage'),
      h('p', {}, 'Vos projets, personnages, images, clips et sons sont enregistrés dans ce navigateur, sur cet appareil. Ils ne sont pas synchronisés entre appareils.'),
      est ? h('p', { class: 'small' }, `Espace utilisé : ${Math.round((est.usage || 0) / 1e6)} Mo sur ${Math.round((est.quota || 0) / 1e9)} Go disponibles.`) : null,
      notice('info', 'Important : vider les données du navigateur efface vos projets. Utilisez régulièrement « 💾 Sauvegarder (fichier) » sur la page de chaque projet.'),
      h('button', { class: 'btn ghost', onclick: async () => toast((await requestPersistence()) ? 'Stockage persistant activé ✓' : 'Le navigateur n\'a pas accordé le stockage persistant', 'info') }, 'Demander un stockage persistant')));
}
