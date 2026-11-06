import { createEmbedTier, createLlmTier, GPU_ALL_LAYERS, type EmbedTier, type LlmTierOptions, type PresetField } from '../../src';
import { BASE, DATE, SCHEMA, type Card } from './fixture';

const PROMPT = 'warm';
const SAND_EXAMPLE = 'warm beige tones';
const NEAR = [1, 0];
const FAR = [0, 1];
const CORPUS: readonly PresetField<Card>[] = [
  { field: 'colour', examples: { red: ['dark red evening colours'], blue: ['blue ocean colours'], sand: [SAND_EXAMPLE] } },
];
const MODEL = 'org/tiny-model-GGUF';
const REPLY = '{"shape":"square","colour":"blue","title":"SALSA","date":""}';

type Embed = (text: string) => Promise<ArrayLike<number>>;
const tierWith = (embed: Embed): EmbedTier<Card> => createEmbedTier({ embed, corpus: CORPUS, base: { ...BASE, colour: 'red' }, extractors: { date: DATE } });

function fakeRun(content = REPLY): { run: jest.Mock; create: jest.Mock } {
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  const run = jest.fn().mockResolvedValue({ chat: { completions: { create } }, unload: jest.fn() });
  return { run, create };
}

const llmOptions = (run: jest.Mock, webGpu: boolean): LlmTierOptions<Card> => ({
  run: run as unknown as LlmTierOptions<Card>['run'],
  modelId: MODEL,
  webGpu,
  schema: SCHEMA,
  system: 'Pick card settings.',
  examples: [{ ask: 'red circle', reply: '{"shape":"circle","colour":"red","title":"","date":""}' }],
});

describe('createEmbedTier', () => {
  it('with a prompt near a preset, takes the preset and reports the field matched', async () => {
    const tier = tierWith((text) => Promise.resolve(text === PROMPT || text === SAND_EXAMPLE ? NEAR : FAR));

    const c = await tier.config(PROMPT);

    expect([c.colour, c.matched]).toEqual(['sand', ['colour']]);
  });

  it('with no preset above the threshold, keeps the base and matches nothing', async () => {
    const tier = tierWith((text) => Promise.resolve(text === PROMPT ? NEAR : FAR));

    const c = await tier.config(PROMPT);

    expect([c.colour, c.matched]).toEqual(['red', []]);
  });

  it('with a score exactly at the threshold, does not match', async () => {
    const atThreshold = [1, 1, 0, 0];
    const example = [1, 0, 1, 0];
    const tier = tierWith((text) => Promise.resolve(text === PROMPT ? atThreshold : text === SAND_EXAMPLE ? example : [0, 0, 0, 1]));

    const c = await tier.config(PROMPT);

    expect(c.matched).toEqual([]);
  });

  it('with only one fragment near a preset, matches through that fragment', async () => {
    const prompt = `other words, ${PROMPT}`;
    const tier = tierWith((text) => Promise.resolve(text === PROMPT || text === SAND_EXAMPLE ? [1, 0, 0] : text.startsWith('other') ? [0, 0, 1] : [0, 1, 0]));

    const c = await tier.config(prompt);

    expect(c.matched).toEqual(['colour']);
  });

  it('with two presets near the prompt, picks the closer one', async () => {
    const vectors: Record<string, number[] | undefined> = { [PROMPT]: [1, 0], 'dark red evening colours': [1, 1], 'blue ocean colours': [1, 0] };
    const tier = tierWith((text) => Promise.resolve(vectors[text] ?? FAR));

    const c = await tier.config(PROMPT);

    expect(c.colour).toBe('blue');
  });

  it('with an extractor, fills its field from the prompt', async () => {
    const tier = tierWith(() => Promise.resolve(FAR));

    const c = await tier.config('Party on Friday 6 November');

    expect(c.date).toBe('Friday 6 November');
  });

  it('with an embedding failure on the prompt, rejects so the caller reports the model failed', async () => {
    const tier = tierWith((text) => (text === PROMPT ? Promise.reject(new Error('boom')) : Promise.resolve(FAR)));

    const config = tier.config(PROMPT);

    await expect(config).rejects.toThrow('boom');
  });

  it('with an embedding failure on a preset, rejects with that failure', async () => {
    const tier = tierWith(() => Promise.reject(new Error('boom')));

    const config = tier.config(PROMPT);

    await expect(config).rejects.toThrow('boom');
  });
});

describe('createLlmTier', () => {
  it('with no WebGPU, loads the model with nGpuLayers 0', async () => {
    const { run } = fakeRun();
    const tier = createLlmTier(llmOptions(run, false));

    await tier.config('salsa');

    expect(run).toHaveBeenCalledWith(MODEL, expect.objectContaining({ nGpuLayers: 0 }));
  });

  it('with WebGPU, offloads every layer', () => {
    const { run } = fakeRun();

    const tier = createLlmTier(llmOptions(run, true));

    expect(tier.nGpuLayers).toBe(GPU_ALL_LAYERS);
  });

  it('with a prompt, sends the schema grammar and the few-shot examples', async () => {
    const { run, create } = fakeRun();
    const tier = createLlmTier(llmOptions(run, true));

    await tier.config('salsa');

    const request = create.mock.calls[0][0];
    expect([String(request.grammar).includes('root ::='), request.messages.length]).toEqual([true, 4]);
  });

  it('with a schema-shaped reply, returns its config', async () => {
    const { run } = fakeRun();
    const tier = createLlmTier(llmOptions(run, true));

    const c = await tier.config('salsa');

    expect([c.shape, c.colour]).toEqual(['square', 'blue']);
  });

  it('with an invalid reply, rejects naming the bad fields', async () => {
    const { run } = fakeRun(REPLY.replace('"blue"', '"green"'));
    const tier = createLlmTier(llmOptions(run, true));

    const config = tier.config('salsa');

    await expect(config).rejects.toThrow('invalid config: colour');
  });

  it('with two prompts, loads the model once', async () => {
    const { run } = fakeRun();
    const tier = createLlmTier(llmOptions(run, true));
    await tier.config('one');

    await tier.config('two');

    expect(run).toHaveBeenCalledTimes(1);
  });
});
