export type ConfigOf<C> = { [K in keyof C]: string };

export type ConfigKey<C> = keyof C & string;

export interface ConfigSchema<C extends ConfigOf<C>> {
  readonly choices: Readonly<Partial<Record<ConfigKey<C>, readonly string[]>>>;
  readonly textKeys: readonly ConfigKey<C>[];
}

export type ParsedConfig<C> = { ok: true; config: C } | { ok: false; errors: string[] };

export type Validator<C> = (config: C) => readonly string[];

export type Extractors<C> = Readonly<Partial<Record<ConfigKey<C>, RegExp>>>;

export type MatchedConfig<C> = C & { readonly matched: readonly ConfigKey<C>[] };

export interface ConfigTier<C> {
  config(prompt: string): Promise<C>;
  readonly nGpuLayers?: number;
}
