// Tarifs utilisés pour ESTIMER les coûts avant chaque génération (en dollars US).
// Valeurs relevées en novembre 2026 sur des sources tierces : à vérifier sur les pages
// officielles d'OpenAI et de xAI. Modifiables sans toucher au code via la variable PRICES
// (JSON) dans wrangler.toml.
export const DEFAULT_PRICES = {
  text: {
    'gpt-5.5': { input: 5, output: 30 },          // $ par million de jetons
    'gpt-5.4-mini': { input: 0.75, output: 4.5 },
    'claude-opus-5-5': { input: 4, output: 20 },
  },
  image: {
    'grok-imagine-image': { perImage: 0.02, perInputImage: 0.002 },
  },
  video: {
    'grok-imagine-video': { perSecond: { '480p': 0.05, '720p': 0.07 }, perInputImage: 0.002 },
    'grok-imagine-video-1.5': { perSecond: { '480p': 0.08, '720p': 0.14, '1080p': 0.25 }, perInputImage: 0.01 },
  },
};

// Taille typique (en jetons) des demandes de texte, raisonnement compris
const TEXT_TOKENS = {
  script: { input: 3000, output: 8000 },
  scene: { input: 3000, output: 3000 },
  character: { input: 800, output: 2000 },
  storyboard: { input: 2500, output: 5000 },
};

export function getPrices(env) {
  if (!env.PRICES) return DEFAULT_PRICES;
  try {
    const o = JSON.parse(env.PRICES);
    return { text: { ...DEFAULT_PRICES.text, ...o.text }, image: { ...DEFAULT_PRICES.image, ...o.image }, video: { ...DEFAULT_PRICES.video, ...o.video } };
  } catch { return DEFAULT_PRICES; }
}

const round = (x) => Math.round(x * 10000) / 10000;

export function estimateText(prices, model, task) {
  const p = prices.text[model];
  const t = TEXT_TOKENS[task] || TEXT_TOKENS.scene;
  if (!p) return null;
  return round((t.input * p.input + t.output * p.output) / 1e6);
}

export function actualText(prices, model, usage) {
  const p = prices.text[model];
  if (!p || !usage) return null;
  return round(((usage.input || 0) * p.input + (usage.output || 0) * p.output) / 1e6);
}

export function estimateImage(prices, model, inputImages = 0) {
  const p = prices.image[model];
  if (!p) return null;
  return round(p.perImage + inputImages * (p.perInputImage || 0));
}

export function estimateVideo(prices, model, seconds, resolution, inputImages = 0) {
  const p = prices.video[model];
  const perSecond = p?.perSecond?.[resolution];
  if (perSecond == null) return null;
  return round(seconds * perSecond + inputImages * (p.perInputImage || 0));
}
