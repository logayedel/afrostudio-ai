// Génération de texte structuré (JSON) avec l'API OpenAI (Responses API + Structured Outputs).
import OpenAI from 'openai';

export class ProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export async function openaiText({ apiKey, model, effort, task, taskName, input, client }) {
  const c = client || new OpenAI({ apiKey });
  let res;
  try {
    res = await c.responses.create({
      model,
      instructions: task.system,
      input: task.prompt(input),
      reasoning: { effort },
      max_output_tokens: 16000,
      text: { format: { type: 'json_schema', name: taskName, schema: task.schema, strict: true } },
    });
  } catch (e) {
    throw mapOpenAIError(e);
  }
  if (res.status === 'incomplete') {
    throw new ProviderError(res.incomplete_details?.reason === 'max_output_tokens'
      ? 'Réponse trop longue : réduisez la durée de l\'épisode ou découpez-le.'
      : 'Réponse incomplète du moteur de texte, réessayez.', 422);
  }
  const refusal = (res.output || []).flatMap((o) => o.content || []).find((c) => c.type === 'refusal');
  if (refusal) throw new ProviderError('Le moteur a refusé cette demande. Reformulez votre idée.', 422);
  let result;
  try { result = JSON.parse(res.output_text); } catch { throw new ProviderError('Réponse illisible du moteur, réessayez.'); }
  return { result, usage: { input: res.usage?.input_tokens, output: res.usage?.output_tokens }, model: res.model || model };
}

function mapOpenAIError(e) {
  const s = e?.status;
  if (s === 401) return new ProviderError('Clé API OpenAI invalide ou expirée (à vérifier sur le serveur relais).');
  if (s === 403) return new ProviderError('Accès refusé par OpenAI pour ce modèle (compte non autorisé ou pays non pris en charge).');
  if (s === 404) return new ProviderError('Modèle OpenAI introuvable : vérifiez OPENAI_TEXT_MODEL sur le serveur relais.');
  if (s === 429) return new ProviderError(/quota|billing|insufficient/i.test(e?.message || '') ? 'Crédit OpenAI épuisé : ajoutez du crédit sur platform.openai.com.' : 'OpenAI est saturé, réessayez dans une minute.', 429);
  if (s >= 500) return new ProviderError('OpenAI rencontre un problème temporaire, réessayez plus tard.');
  if (s === 400) return new ProviderError('Demande refusée par OpenAI : ' + (e?.error?.message || e?.message || 'paramètre invalide'), 400);
  return new ProviderError('Impossible de joindre OpenAI : ' + (e?.message || e));
}
