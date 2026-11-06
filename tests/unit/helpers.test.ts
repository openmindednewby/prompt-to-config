import { gapFill, gradeConfig, p50, tierCache, type MatchedConfig } from '../../src';
import { BASE, type Card } from './fixture';

describe('gapFill', () => {
  it('with a field the embedding matched, keeps the embedding value', () => {
    const embed: MatchedConfig<Card> = { ...BASE, colour: 'red', matched: ['colour'] };
    const keyword: Card = { ...BASE, colour: 'blue' };

    const c = gapFill(embed, keyword);

    expect(c.colour).toBe('red');
  });

  it('with a matched field whose value equals the base, still keeps the embedding value', () => {
    const embed: MatchedConfig<Card> = { ...BASE, colour: 'sand', matched: ['colour'] };
    const keyword: Card = { ...BASE, colour: 'blue' };

    const c = gapFill(embed, keyword);

    expect(c.colour).toBe('sand');
  });

  it('with a field the embedding did not match, takes the keyword value', () => {
    const embed: MatchedConfig<Card> = { ...BASE, title: 'SALSA', matched: [] };
    const keyword: Card = { ...BASE, title: 'MILONGA' };

    const c = gapFill(embed, keyword);

    expect(c.title).toBe('MILONGA');
  });

  it('with a matched list, leaves the result without a matched key', () => {
    const embed: MatchedConfig<Card> = { ...BASE, matched: ['colour'] };

    const c = gapFill(embed, BASE);

    expect('matched' in c).toBe(false);
  });
});

describe('gradeConfig', () => {
  it('with every keyed field accepted, is right with no misses', () => {
    const key = { shape: ['circle'], title: ['HELLO', 'HI'] };

    const grade = gradeConfig(key, BASE);

    expect(grade).toEqual({ right: true, misses: [] });
  });

  it('with a value outside the accepted list, misses that field', () => {
    const key = { shape: ['square'] };

    const grade = gradeConfig(key, BASE);

    expect(grade).toEqual({ right: false, misses: ['shape'] });
  });

  it('with a value that differs only in case and outer spaces, is right', () => {
    const key = { date: ['Saturday 21 November'] };

    const grade = gradeConfig(key, { ...BASE, date: ' saturday 21 november ' });

    expect(grade.right).toBe(true);
  });
});

describe('tierCache', () => {
  it('after a failed load, loads again on the next call', async () => {
    const cache = tierCache<string, number>();
    let loads = 0;
    const load = (): Promise<number> => {
      loads += 1;
      return loads === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(loads);
    };
    await cache('embed', load).catch(() => undefined);

    const value = await cache('embed', load);

    expect([value, loads]).toEqual([2, 2]);
  });

  it('after a good load, reuses it without loading again', async () => {
    const cache = tierCache<string, number>();
    let loads = 0;
    const load = (): Promise<number> => Promise.resolve((loads += 1));
    await cache('embed', load);

    const value = await cache('embed', load);

    expect([value, loads]).toEqual([1, 1]);
  });
});

describe('p50', () => {
  it('with an odd count, returns the middle value', () => {
    const ms = [3000, 1000, 2000];

    const median = p50(ms);

    expect(median).toBe(2000);
  });

  it('with an even count, returns the mean of the two middle values', () => {
    const ms = [4000, 1000, 3000, 2000];

    const median = p50(ms);

    expect(median).toBe(2500);
  });

  it('with no values, returns 0', () => {
    const values: number[] = [];

    const median = p50(values);

    expect(median).toBe(0);
  });
});
