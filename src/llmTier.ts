import type { ProgressEvent, run } from '@dloizides/llm-run';
import { configGrammar, parseConfig } from './schema';
import type { ConfigOf, ConfigSchema, ConfigTier, Validator } from './types';

export interface FewShot {
  readonly ask: string;
  readonly reply: string;
}

export interface LlmTierOptions<C extends ConfigOf<C>> {
  readonly run: typeof run;
  readonly modelId: string;
  readonly webGpu: boolean;
  readonly schema: ConfigSchema<C>;
  readonly system: string;
  readonly examples?: readonly FewShot[];
  readonly validate?: Validator<C>;
  readonly maxModelBytes?: number;
  readonly maxTokens?: number;
  readonly textMax?: number;
  readonly onProgress?: (e: ProgressEvent) => void;
}

const MB = 1024 * 1024;
export const DEFAULT_MAX_MODEL_BYTES = 145 * MB;
export const DEFAULT_MAX_TOKENS = 128;
export const GPU_ALL_LAYERS = 99;

/** Tier 1: a small model through llm-run, its reply held to the schema grammar and parsed; GPU layers explicit. */
export function createLlmTier<C extends ConfigOf<C>>(options: LlmTierOptions<C>): ConfigTier<C> & { readonly nGpuLayers: number } {
  const nGpuLayers = options.webGpu ? GPU_ALL_LAYERS : 0;
  const grammar = configGrammar(options.schema, options.textMax);
  const shots = (options.examples ?? []).flatMap((shot) => [
    { role: 'user' as const, content: shot.ask },
    { role: 'assistant' as const, content: shot.reply },
  ]);
  let client: ReturnType<typeof run> | null = null;
  return {
    nGpuLayers,
    async config(prompt: string): Promise<C> {
      client ??= options.run(options.modelId, { maxModelBytes: options.maxModelBytes ?? DEFAULT_MAX_MODEL_BYTES, nGpuLayers, onProgress: options.onProgress });
      const reply = await (await client).chat.completions.create({
        messages: [{ role: 'system', content: options.system }, ...shots, { role: 'user', content: prompt }],
        grammar,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: 0,
      });
      const parsed = parseConfig(options.schema, reply.choices[0]?.message.content ?? '', options.validate);
      if (!parsed.ok) {
        throw new Error(`invalid config: ${parsed.errors.join(', ')}`);
      }
      return parsed.config;
    },
  };
}
