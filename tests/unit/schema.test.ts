import { configGrammar, keywordConfig, parseConfig, type KeywordOptions } from '../../src';
import { BASE, DATE, SCHEMA, type Card } from './fixture';

const VALID = '{"shape":"square","colour":"red","title":"TANGO","date":""}';

const OPTIONS: KeywordOptions<Card> = {
  base: BASE,
  rules: [
    { field: 'shape', value: 'square', words: ['square', /\bbox(es)?\b/i] },
    { field: 'colour', value: 'red', words: ['red', 'crimson'] },
    { field: 'colour', value: 'blue', words: ['blue'] },
    { field: 'title', value: 'TANGO', words: ['tango'] },
  ],
  extractors: { date: DATE },
};

describe('configGrammar', () => {
  it('with a schema, lists every choice as a quoted alternative', () => {
    const ids = ['circle', 'square', 'red', 'blue', 'sand'];

    const grammar = configGrammar(SCHEMA);

    expect(ids.filter((id) => !grammar.includes(`"\\"${id}\\""`))).toEqual([]);
  });

  it('with the root rule, puts choice keys before text keys', () => {
    const grammar = configGrammar(SCHEMA);

    const root = grammar.split('\n').find((line) => line.startsWith('root ::=')) ?? '';

    expect(root.indexOf('shape')).toBeLessThan(root.indexOf('date'));
  });

  it('with a text limit, caps text values at that length', () => {
    const limit = 12;

    const grammar = configGrammar(SCHEMA, limit);

    expect(grammar).toContain('{0,12}');
  });
});

describe('parseConfig', () => {
  it('with a reply matching the schema, returns the config', () => {
    const reply = VALID;

    const parsed = parseConfig(SCHEMA, reply);

    expect(parsed.ok && parsed.config.shape).toBe('square');
  });

  it('with an unknown choice, returns an error naming the field', () => {
    const reply = VALID.replace('"red"', '"purple"');

    const parsed = parseConfig(SCHEMA, reply);

    expect(parsed.ok ? [] : parsed.errors).toEqual(['colour']);
  });

  it('with a missing text key, returns an error naming it', () => {
    const reply = '{"shape":"square","colour":"red","title":"TANGO"}';

    const parsed = parseConfig(SCHEMA, reply);

    expect(parsed.ok ? [] : parsed.errors).toEqual(['date']);
  });

  it('with prose before the JSON, returns a json error', () => {
    const reply = `Sure: ${VALID}`;

    const parsed = parseConfig(SCHEMA, reply);

    expect(parsed.ok ? [] : parsed.errors).toEqual(['json']);
  });

  it('with a validator that refuses the config, returns its errors', () => {
    const validate = (): string[] => ['shape-colour'];

    const parsed = parseConfig(SCHEMA, VALID, validate);

    expect(parsed.ok ? [] : parsed.errors).toEqual(['shape-colour']);
  });
});

describe('keywordConfig', () => {
  it('with words from the table, picks each matching value', () => {
    const prompt = 'A square Tango card in crimson';

    const config = keywordConfig(OPTIONS, prompt);

    expect([config.shape, config.colour, config.title]).toEqual(['square', 'red', 'TANGO']);
  });

  it('with two rules for one field, takes the first in table order', () => {
    const prompt = 'blue and red';

    const config = keywordConfig(OPTIONS, prompt);

    expect(config.colour).toBe('red');
  });

  it('with a word inside another word, does not match it', () => {
    const prompt = 'squared paper';

    const config = keywordConfig(OPTIONS, prompt);

    expect(config.shape).toBe('circle');
  });

  it('with a regex rule, matches through the regex', () => {
    const prompt = 'three boxes';

    const config = keywordConfig(OPTIONS, prompt);

    expect(config.shape).toBe('square');
  });

  it('with an extractor, copies the matched text into its field', () => {
    const prompt = 'Party on Saturday 21 November';

    const config = keywordConfig(OPTIONS, prompt);

    expect(config.date).toBe('Saturday 21 November');
  });

  it('with no match, keeps the base config', () => {
    const prompt = 'nothing here';

    const config = keywordConfig(OPTIONS, prompt);

    expect(config).toEqual(BASE);
  });
});
