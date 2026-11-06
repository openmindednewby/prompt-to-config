import { createIntentMatcher, DEFAULT_EMBEDDING_MODEL_URL, type IntentMatcher } from '@dloizides/llm-run/intent';
import { extractFields } from './keywordTier';
import type { ConfigKey, ConfigOf, Extractors, MatchedConfig } from './types';

export interface PresetField<C> {
  readonly field: ConfigKey<C>;
  readonly examples: Readonly<Record<string, readonly string[]>>;
}

export type Embed = (text: string) => Promise<ArrayLike<number>>;

export interface EmbedTierOptions<C> {
  readonly embed: Embed;
  readonly corpus: readonly PresetField<C>[];
  readonly base: C;
  readonly extractors?: Extractors<C>;
  readonly threshold?: number;
  readonly fragment?: RegExp;
}

export interface EmbedTier<C> {
  config(prompt: string): Promise<MatchedConfig<C>>;
}

export const DEFAULT_THRESHOLD = 0.5;
export const DEFAULT_FRAGMENT = /,| with | for | on | at /i;
const LONGEST_TIMER_MS = 2_147_483_647;

function rememberVectors(embed: Embed): Embed {
  const known = new Map<string, ArrayLike<number>>();
  return async (text) => {
    const hit = known.get(text);
    if (hit !== undefined) {
      return hit;
    }
    const vector = await embed(text);
    known.set(text, vector);
    return vector;
  };
}

async function loadMatchers<C>(embed: Embed, corpus: readonly PresetField<C>[], threshold: number): Promise<IntentMatcher[]> {
  const matchers: IntentMatcher[] = [];
  for (const spec of corpus) {
    const matcher = createIntentMatcher({
      intents: Object.entries(spec.examples).map(([id, examples]) => ({ id, examples })),
      threshold,
      model: DEFAULT_EMBEDDING_MODEL_URL,
      loadRuntime: () => Promise.resolve({ embed }),
    });
    const loaded = await matcher.loadOnDemand({ deadlineMs: LONGEST_TIMER_MS });
    if (!loaded.ok) {
      throw new Error(loaded.message);
    }
    matchers.push(matcher);
  }
  return matchers;
}

async function bestOver(parts: readonly string[], matcher: IntentMatcher, threshold: number): Promise<string | undefined> {
  let best: string | undefined;
  let bestScore = threshold;
  for (const part of parts) {
    const { id, score } = await matcher.match(part);
    if (id !== null && score !== null && score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** Tier 2: a sentence-embedding match per field over the caller's preset corpus, no text generation. */
export function createEmbedTier<C extends ConfigOf<C>>(options: EmbedTierOptions<C>): EmbedTier<C> {
  const embedOnce = rememberVectors(options.embed);
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const fragment = options.fragment ?? DEFAULT_FRAGMENT;
  let matchers: Promise<IntentMatcher[]> | null = null;
  return {
    async config(prompt: string): Promise<MatchedConfig<C>> {
      matchers ??= loadMatchers(embedOnce, options.corpus, threshold);
      const loaded = await matchers;
      const parts = [prompt, ...prompt.split(fragment).map((p) => p.trim()).filter((p) => p !== '')];
      for (const part of parts) {
        await embedOnce(part);
      }
      const best: (string | undefined)[] = [];
      for (const matcher of loaded) {
        best.push(await bestOver(parts, matcher, threshold));
      }
      const hits = options.corpus.flatMap((spec, i) => (best[i] === undefined ? [] : [[spec.field, best[i]] as const]));
      const matched = hits.map(([field]) => field);
      return { ...options.base, ...Object.fromEntries(hits), ...extractFields(prompt, options.extractors), matched } as MatchedConfig<C>;
    },
  };
}
