import { createEmbedTier, DEFAULT_EMBED_DEADLINE_MS, TierReplyKind, TierStatus, type EmbedTier, type EmbedTierOptions, type PresetField } from '../../src';
import { BASE, type Card } from './fixture';

const NEAR = [1, 0];
const SHORT_DEADLINE_MS = 20;
const CORPUS: readonly PresetField<Card>[] = [{ field: 'colour', examples: { blue: ['blue ocean colours'] } }];
const never = (): Promise<ArrayLike<number>> => new Promise(() => undefined);

const tierWith = (extra: Partial<EmbedTierOptions<Card>>): EmbedTier<Card> =>
  createEmbedTier({ embed: () => Promise.resolve(NEAR), corpus: CORPUS, base: BASE, ...extra });

describe('createEmbedTier deadline', () => {
  afterEach(() => jest.useRealTimers());

  it('with an embedding that never answers and a caller deadline, resolves timed-out', async () => {
    const tier = tierWith({ embed: never, deadlineMs: SHORT_DEADLINE_MS });

    const config = await tier.tryConfig('blue');

    expect(config).toBe(TierStatus.TimedOut);
  });

  it('with an embedding that never answers and no deadline, resolves timed-out after the default deadline', async () => {
    jest.useFakeTimers();
    const tier = tierWith({ embed: never });

    const config = tier.tryConfig('blue');
    await jest.advanceTimersByTimeAsync(DEFAULT_EMBED_DEADLINE_MS);

    await expect(config).resolves.toBe(TierStatus.TimedOut);
  });

  it('with config and an embedding that never answers, rejects naming timed-out', async () => {
    const tier = tierWith({ embed: never, deadlineMs: SHORT_DEADLINE_MS });

    const config = tier.config('blue');

    await expect(config).rejects.toThrow(TierStatus.TimedOut);
  });

  it('with an embedding that answers in time, returns the matched config', async () => {
    const tier = tierWith({ deadlineMs: SHORT_DEADLINE_MS * SHORT_DEADLINE_MS });

    const config = await tier.config('blue');

    expect(config).toEqual(expect.objectContaining({ colour: 'blue', matched: ['colour'] }));
  });

  it('with an onProgress option, reports load progress to the caller', async () => {
    const onProgress = jest.fn();
    const tier = tierWith({ onProgress });

    await tier.config('blue');

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ loaded: expect.any(Number), total: expect.any(Number) }));
  });
});

describe('TierReplyKind', () => {
  it('with each member, carries the wire value the worker posts', () => {
    const kinds = [TierReplyKind.Done, TierReplyKind.Progress];

    const values = kinds.map(String);

    expect(values).toEqual(['done', 'progress']);
  });
});
