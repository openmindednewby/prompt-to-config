import type { ConfigKey, ConfigOf, MatchedConfig } from './types';

export type KeyFields<C> = Partial<Record<ConfigKey<C>, readonly string[]>>;

export interface KeyRow<C> {
  readonly prompt: string;
  readonly expect: KeyFields<C>;
}

export interface Grade {
  right: boolean;
  misses: string[];
}

const HALF = 2;
const norm = (v: string): string => v.trim().toLowerCase();

/** The embedding's value for each field it matched, every other field from the keyword match. */
export function gapFill<C extends ConfigOf<C>>(embed: MatchedConfig<C>, keyword: C): C {
  const filled: C = { ...keyword };
  for (const field of embed.matched) {
    filled[field] = embed[field];
  }
  return filled;
}

/** A prompt is right only when every keyed field holds one of its accepted values (case and outer spaces ignored). */
export function gradeConfig<C extends ConfigOf<C>>(key: KeyFields<C>, got: C): Grade {
  const misses = (Object.entries(key) as [ConfigKey<C>, readonly string[] | undefined][])
    .filter(([field, accepted]) => !(accepted ?? []).map(norm).includes(norm(String(got[field]))))
    .map(([field]) => field);
  return { right: misses.length === 0, misses };
}

/** A per-key cache of loading promises that forgets a key whose load failed, so the next call loads again. */
export function tierCache<K, T>(): (key: K, load: () => Promise<T>) => Promise<T> {
  const cache = new Map<K, Promise<T>>();
  return (key, load) => {
    const hit = cache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const loading = load().catch((e: unknown) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, loading);
    return loading;
  };
}

/** The median of a list of timings; 0 for an empty list. */
export function p50(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / HALF);
  if (sorted.length === 0) {
    return 0;
  }
  return sorted.length % HALF === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / HALF;
}
