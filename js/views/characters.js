import { h, field, toast, confirmBox, pickFile, copyText, notice, badge } from '../ui.js';
import { listCharacters, getCharacter, newCharacter, saveCharacter, deleteCharacter, autosave, listProjects, saveProject } from '../store.js';
import { putBlob, blobURL } from '../db.js';
import { identitySheet, characterReferencePrompt } from '../prompts.js';
import { can, generate } from '../engines/index.js';
import { speak, voicesFor } from '../audio.js';

export async function charactersView() {
  const chars = await listCharacters();
  return h('section', { class: 'page' },
    h('div', { class: 'hero' },
      h('div', {}, h('h1', {}, 'Bibliothèque de personnages'),
        h('p', { class: 'muted' }, 'Vos personnages sont réutilisables dans tous vos projets et épisodes. Leur fiche d\'identité visuelle garantit la cohérence d\'une scène à l\'autre.')),
      h('button', { class: 'btn primary', onclick: async () => { const c = newCharacter({ name: 'Nouveau personnage' }); await saveCharacter(c); location.hash = `#/personnages/${c.id}`; } }, '+ Créer un personnage')),
    chars.length ? h('div', { class: 'grid cards' }, chars.map((c) => characterCard(c))) : h('p', { class: 'empty' }, 'Aucun personnage pour l\'instant.'));
}

export function characterCard(c, extra = null) {
  const img = h('div', { class: 'avatar' }, (c.name || '?').slice(0, 1));
  if (c.refImages?.[0]) blobURL(c.refImages[0]).then((u) => { if (u) img.replaceChildren(h('img', { src: u, alt: c.name })); });
  return h('div', { class: 'card char' },
    h('a', { class: 'card-link', href: `#/personnages/${c.id}` }, img,
      h('h3', {}, c.name || 'Sans nom'), h('p', { class: 'muted small' }, c.role || ''),
      h('p', { class: 'small clamp' }, c.appearance || c.description || 'Apparence à définir')),
    extra);
}

export async function characterEditorView({ characterId }) {
  const c = await getCharacter(characterId);
  if (!c) throw new Error('Personnage introuvable');
  const save = () => autosave('character', c);
  const textAI = await can('text');
  const imageAI = await can('image');

  const sheetBox = h('pre', { class: 'sheet' });
  const promptBox = h('pre', { class: 'sheet' });
  const refresh = () => { sheetBox.textContent = identitySheet(c); promptBox.textContent = characterReferencePrompt(c, null); };
  const onChange = () => { save(); refresh(); };
  refresh();

  // Références visuelles (images importées)
  const gallery = h('div', { class: 'gallery' });
  const drawGallery = async () => {
    gallery.replaceChildren(...await Promise.all(c.refImages.map(async (id, i) => h('figure', {},
      h('img', { src: await blobURL(id), alt: `Référence ${i + 1}` }),
      h('figcaption', {}, i === 0 ? badge('Image principale', 'ok') : h('button', { class: 'link', onclick: () => { c.refImages.unshift(...c.refImages.splice(i, 1)); save(); drawGallery(); } }, 'Définir principale'),
        h('button', { class: 'link danger', onclick: async () => { c.refImages.splice(i, 1); save(); drawGallery(); } }, 'Retirer'))))),
    h('button', { class: 'card new small', onclick: async () => {
      const f = await pickFile('image/*'); if (!f) return;
      c.refImages.push(await putBlob(f, f.name)); save(); drawGallery();
    } }, h('span', { class: 'plus' }, '+'), 'Importer une image'));
  };
  drawGallery();

  async function enrich() {
    if (!c.description.trim()) return toast('Écrivez d\'abord une courte description du personnage.', 'error');
    btnAI.disabled = true; btnAI.textContent = 'Génération en cours…';
    try {
      const r = await generate('character', { description: c.description, name: c.name, role: c.role });
      for (const k of ['name', 'kind', 'age', 'appearance', 'outfit', 'colors', 'personality', 'catchphrase']) if (r[k]) c[k] = r[k];
      if (r.voiceTone) c.voice.tone = r.voiceTone;
      await saveCharacter(c); toast('Fiche complétée par l\'IA ✓', 'ok');
      dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { toast(e.message, 'error'); }
    finally { btnAI.disabled = false; btnAI.textContent = '✨ Compléter la fiche avec l\'IA'; }
  }
  const btnAI = h('button', { class: 'btn primary', disabled: !textAI, onclick: enrich, title: textAI ? '' : 'Connectez un moteur de texte dans Paramètres' }, '✨ Compléter la fiche avec l\'IA');

  // Voix
  const voiceSelect = h('select', { onchange: () => { c.voice.browserVoice = voiceSelect.value; save(); } });
  const fillVoices = () => {
    const vs = voicesFor(c.voice.lang);
    voiceSelect.replaceChildren(h('option', { value: '' }, 'Automatique'), ...vs.map((v) => h('option', { value: v.name, selected: v.name === c.voice.browserVoice }, `${v.name} (${v.lang})`)));
  };
  fillVoices();
  speechSynthesis?.addEventListener?.('voiceschanged', fillVoices);

  // Projets
  const projects = await listProjects();

  return h('section', { class: 'page' },
    h('a', { class: 'back', href: '#/personnages' }, '← Bibliothèque'),
    h('div', { class: 'hero' }, h('h1', {}, c.name || 'Personnage'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: async () => { const copy = { ...structuredClone(c), id: newCharacter().id, name: c.name + ' (copie)', createdAt: Date.now() }; await saveCharacter(copy); location.hash = `#/personnages/${copy.id}`; } }, 'Dupliquer'),
        h('button', { class: 'btn danger ghost', onclick: async () => {
          if (!await confirmBox(`Supprimer ${c.name} de la bibliothèque ? Il sera retiré des distributions de vos projets.`, 'Supprimer')) return;
          for (const p of projects) if (p.cast.includes(c.id)) { p.cast = p.cast.filter((x) => x !== c.id); await saveProject(p); }
          await deleteCharacter(c.id); location.hash = '#/personnages';
        } }, 'Supprimer'))),
    h('div', { class: 'cols' },
      h('div', { class: 'col' },
        h('div', { class: 'panel' }, h('h2', {}, '1. Description'),
          field('Décrivez votre personnage en quelques phrases', c, 'description', { type: 'textarea', rows: 4, onChange, placeholder: 'Ex. : Awa, 10 ans, petite fille curieuse de Bamako qui rêve de devenir astronaute…' }),
          h('div', { class: 'row' }, btnAI), textAI ? null : notice('off', 'Aucun moteur de texte connecté : remplissez la fiche à la main, ou connectez un moteur dans Paramètres.')),
        h('div', { class: 'panel' }, h('h2', {}, '2. Identité'),
          h('div', { class: 'two' },
            field('Nom', c, 'name', { onChange }),
            field('Rôle', c, 'role', { onChange, options: ['Personnage principal', 'Personnage secondaire', 'Rival', 'Méchant', 'Narrateur', 'Figurant'] }),
            field('Type (humain, animal, objet…)', c, 'kind', { onChange }),
            field('Âge', c, 'age', { onChange })),
          field('Apparence physique (visage, corps, cheveux, signes distinctifs)', c, 'appearance', { type: 'textarea', rows: 3, onChange }),
          field('Vêtements et accessoires', c, 'outfit', { type: 'textarea', rows: 2, onChange }),
          field('Couleurs dominantes', c, 'colors', { onChange }),
          field('Personnalité', c, 'personality', { type: 'textarea', rows: 2, onChange }),
          field('Expression fétiche', c, 'catchphrase', { onChange })),
        h('div', { class: 'panel' }, h('h2', {}, '3. Voix'),
          h('div', { class: 'two' },
            field('Langue', c.voice, 'lang', { onChange: () => { save(); fillVoices(); }, options: [['fr-FR', 'Français'], ['en-US', 'Anglais'], ['wo-SN', 'Wolof'], ['sw-KE', 'Swahili'], ['ha-NG', 'Haoussa'], ['yo-NG', 'Yoruba'], ['ln-CD', 'Lingala'], ['ar-SA', 'Arabe'], ['pt-PT', 'Portugais'], ['es-ES', 'Espagnol']] }),
            field('Accent souhaité', c.voice, 'accent', { onChange }),
            field('Genre de voix', c.voice, 'gender', { onChange, options: ['féminin', 'masculin', 'neutre', 'enfant'] }),
            field('Timbre / ton', c.voice, 'tone', { onChange })),
          h('div', { class: 'two' },
            field('Hauteur (aperçu)', c.voice, 'pitch', { type: 'number', min: 0.5, max: 2, step: 0.1, onChange }),
            field('Débit (aperçu)', c.voice, 'rate', { type: 'number', min: 0.5, max: 2, step: 0.05, onChange })),
          h('label', { class: 'field' }, h('span', {}, 'Voix du navigateur pour l\'aperçu'), voiceSelect),
          h('button', { class: 'btn ghost', onclick: () => speak(c.catchphrase || `Bonjour, je suis ${c.name}.`, c.voice) }, '🔊 Écouter un aperçu'),
          notice('real', 'L\'aperçu utilise les voix de synthèse installées dans votre navigateur (gratuit, hors-ligne). Les voix IA réalistes et les accents précis viendront avec un moteur de voix (ex. ElevenLabs) via le serveur relais.'))),
      h('div', { class: 'col' },
        h('div', { class: 'panel' }, h('h2', {}, '4. Références visuelles'),
          h('p', { class: 'muted small' }, 'Importez des images du personnage (créées avec l\'outil de votre choix). La première sert de référence principale pour toutes les scènes.'),
          gallery,
          imageAI ? notice('info', 'Moteur d\'images détecté : la génération directe sera ajoutée à l\'étape suivante.') : notice('off', 'Aucun moteur d\'images connecté : la génération automatique de références n\'est pas encore disponible. Copiez le prompt ci-dessous dans votre outil d\'images, puis importez le résultat.')),
        h('div', { class: 'panel' }, h('h2', {}, 'Fiche d\'identité visuelle'),
          h('p', { class: 'muted small' }, 'Ce texte est inséré automatiquement, mot pour mot, dans chaque plan où le personnage apparaît.'),
          sheetBox,
          h('h3', {}, 'Prompt de planche de référence'), promptBox,
          h('button', { class: 'btn ghost', onclick: () => copyText(promptBox.textContent) }, 'Copier le prompt')),
        h('div', { class: 'panel' }, h('h2', {}, 'Utilisé dans'),
          h('div', { class: 'row wrap' }, projects.filter((p) => p.cast.includes(c.id)).map((p) => h('a', { class: 'badge', href: `#/projet/${p.id}` }, p.title)), projects.some((p) => p.cast.includes(c.id)) ? null : h('span', { class: 'muted small' }, 'Aucun projet pour l\'instant'))))));
}
