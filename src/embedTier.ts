import { createIntentMatcher, DEFAULT_EMBEDDING_MODEL_URL, LoadFailure, type IntentMatcher, type LoadProgress } from '@dloizides/llm-run/intent';
import { extractFields } from './keywordTier';
import { TierStatus } from './TierStatus';
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
  readonly deadlineMs?: number;
  readonly onProgress?: (progress: LoadProgress) => void;
}

export interface EmbedTier<C> {
  config(prompt: string): Promise<MatchedConfig<C>>;
  tryConfig(prompt: string): Promise<MatchedConfig<C> | TierStatus>;
}

export const DEFAULT_THRESHOLD = 0.5;
export const DEFAULT_FRAGMENT = /,| with | for | on | at /i;
export const DEFAULT_EMBED_DEADLINE_MS = 8_000;

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

async function loadMatchers<C>(embed: Embed, options: EmbedTierOptions<C>, threshold: number, deadlineMs: number): Promise<IntentMatcher[] | TierStatus> {
  const matchers: IntentMatcher[] = [];
  for (const spec of options.corpus) {
    const matcher = createIntentMatcher({
      intents: Object.entries(spec.examples).map(([id, examples]) => ({ id, examples })),
      threshold,
      model: DEFAULT_EMBEDDING_MODEL_URL,
      loadRuntime: () => Promise.resolve({ embed }),
    });
    const loaded = await matcher.loadOnDemand({ deadlineMs, onProgress: options.onProgress });
    if (!loaded.ok && loaded.reason === LoadFailure.Deadline) {
      return TierStatus.TimedOut;
    }
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

function withDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T | TierStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<TierStatus>((resolve) => {
    timer = setTimeout(() => resolve(TierStatus.TimedOut), deadlineMs);
  });
  return Promise.race([work, timedOut]).finally(() => clearTimeout(timer));
}

/** Tier 2: a sentence-embedding match per field over the caller's preset corpus, no text generation. */
export function createEmbedTier<C extends ConfigOf<C>>(options: EmbedTierOptions<C>): EmbedTier<C> {
  const embedOnce = rememberVectors(options.embed);
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const fragment = options.fragment ?? DEFAULT_FRAGMENT;
  const deadlineMs = options.deadlineMs ?? DEFAULT_EMBED_DEADLINE_MS;
  let matchers: Promise<IntentMatcher[] | TierStatus> | null = null;
  const match = async (prompt: string): Promise<MatchedConfig<C> | TierStatus> => {
    matchers ??= loadMatchers(embedOnce, options, threshold, deadlineMs);
    const loaded = await matchers;
    if (typeof loaded === 'string') {
      matchers = null;
      return loaded;
    }
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
  };
  const tryConfig = (prompt: string): Promise<MatchedConfig<C> | TierStatus> => withDeadline(match(prompt), deadlineMs);
  return {
    tryConfig,
    async config(prompt: string): Promise<MatchedConfig<C>> {
      const result = await tryConfig(prompt);
      if (typeof result === 'string') {
        throw new Error(result);
      }
      return result;
    },
  };
}
