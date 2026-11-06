import type { ConfigKey, ConfigOf, ConfigTier, Extractors } from './types';

export type KeywordWord = string | RegExp;

export interface KeywordRule<C> {
  readonly field: ConfigKey<C>;
  readonly value: string;
  readonly words: readonly KeywordWord[];
}

export interface KeywordOptions<C> {
  readonly base: C;
  readonly rules: readonly KeywordRule<C>[];
  readonly extractors?: Extractors<C>;
}

const BEFORE_WORD = '(?:^|[^\\p{L}\\p{N}])';
const AFTER_WORD = '(?:$|[^\\p{L}\\p{N}])';
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const STATEFUL_FLAGS = /[gy]/g;

function patternFor(word: KeywordWord): RegExp {
  if (typeof word !== 'string') {
    return new RegExp(word.source, word.flags.replace(STATEFUL_FLAGS, ''));
  }
  return new RegExp(`${BEFORE_WORD}${word.trim().replace(REGEX_SPECIALS, '\\$&')}${AFTER_WORD}`, 'iu');
}

/** The text each extractor finds in the prompt, keyed by field; fields with no hit are left out. */
export function extractFields<C>(prompt: string, extractors?: Extractors<C>): Partial<C> {
  const found = (Object.entries(extractors ?? {}) as [ConfigKey<C>, RegExp | undefined][]).flatMap(([field, pattern]) => {
    const hit = pattern === undefined ? null : patternFor(pattern).exec(prompt);
    return hit === null ? [] : [[field, hit[0]]];
  });
  return Object.fromEntries(found) as Partial<C>;
}

/** Tier 3: the first matching rule per field over the base config, then the extractors. */
export function keywordConfig<C extends ConfigOf<C>>(options: KeywordOptions<C>, prompt: string): C {
  const config: C = { ...options.base };
  const filled = new Set<ConfigKey<C>>();
  for (const rule of options.rules) {
    if (!filled.has(rule.field) && rule.words.some((word) => patternFor(word).test(prompt))) {
      Object.assign(config, { [rule.field]: rule.value });
      filled.add(rule.field);
    }
  }
  return { ...config, ...extractFields(prompt, options.extractors) };
}

/** The keyword match behind the same tier interface as the model tiers. */
export function createKeywordTier<C extends ConfigOf<C>>(options: KeywordOptions<C>): ConfigTier<C> {
  return { config: (prompt: string): Promise<C> => Promise.resolve(keywordConfig(options, prompt)) };
}
