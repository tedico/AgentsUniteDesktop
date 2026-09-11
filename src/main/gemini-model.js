import { runHeadless } from '../../vendor/agentsunite/lib/proc.js';

// Ted, 2026-09-10: the Gemini seat always defaults to the top Gemini Pro at
// high effort, chosen from `agy models` at every launch. A room's
// models.gemini overrides; this constant is used when the list is unavailable.
export const FALLBACK_GEMINI_MODEL = 'gemini-3.1-pro-high';

const PRO_HIGH = /^gemini-(\d+)\.(\d+)-pro-high$/;

// `agy models` prints one "id<TAB>label" line per model on stdout. Flash tiers,
// third-party ids, and Pro at medium or low effort are never selected.
export function pickTopGeminiModel(stdout) {
  let best = null;
  for (const line of String(stdout ?? '').split('\n')) {
    const id = line.split('\t')[0].trim();
    const m = PRO_HIGH.exec(id);
    if (!m) continue;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    if (!best || major > best.major || (major === best.major && minor > best.minor)) {
      best = { id, major, minor };
    }
  }
  return best?.id ?? null;
}

const fallback = () => ({ model: FALLBACK_GEMINI_MODEL, source: 'fallback' });

// Never throws and never blocks startup for more than timeoutMs.
export async function resolveGeminiModel({ configured, binary = 'agy', run = runHeadless, timeoutMs = 15000 } = {}) {
  if (typeof configured === 'string' && configured.trim()) return { model: configured.trim(), source: 'config' };
  let r;
  try { r = await run({ cmd: binary, args: ['models'], timeoutMs }); }
  catch { return fallback(); }
  if (!r || r.spawnError || r.timedOut || r.code !== 0) return fallback();
  const picked = pickTopGeminiModel(r.stdout);
  return picked ? { model: picked, source: 'agy models' } : fallback();
}
