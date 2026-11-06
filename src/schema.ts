import type { ConfigKey, ConfigOf, ConfigSchema, ParsedConfig, Validator } from './types';

export const DEFAULT_TEXT_MAX = 32;

const quoted = (id: string): string => `"\\"${id}\\""`;

function choiceEntries<C extends ConfigOf<C>>(schema: ConfigSchema<C>): [ConfigKey<C>, readonly string[]][] {
  return (Object.entries(schema.choices) as [ConfigKey<C>, readonly string[] | undefined][]).flatMap(([key, ids]) => (ids === undefined ? [] : [[key, ids]]));
}

function readJson(reply: string): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(reply.trim());
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** GBNF grammar for the schema: choice keys then text keys in a fixed order, choice values only, texts capped at `textMax`. */
export function configGrammar<C extends ConfigOf<C>>(schema: ConfigSchema<C>, textMax = DEFAULT_TEXT_MAX): string {
  const choices = choiceEntries(schema);
  const keys = [...choices.map(([key]) => key), ...schema.textKeys];
  const fields = keys.map((key) => `"\\"${key}\\":" ${key}`).join(' "," ');
  return [
    `root ::= "{" ${fields} "}"`,
    ...choices.map(([key, ids]) => `${key} ::= ${ids.map(quoted).join(' | ')}`),
    ...schema.textKeys.map((key) => `${key} ::= text`),
    `text ::= "\\"" [^"\\\\\\n]{0,${textMax}} "\\""`,
  ].join('\n');
}

/** The config in a model reply, or the names of the fields that are not valid; `validate` adds the caller's own checks. */
export function parseConfig<C extends ConfigOf<C>>(schema: ConfigSchema<C>, reply: string, validate?: Validator<C>): ParsedConfig<C> {
  const obj = readJson(reply);
  if (obj === null) {
    return { ok: false, errors: ['json'] };
  }
  const errors = [
    ...choiceEntries(schema).filter(([key, ids]) => !ids.includes(String(obj[key]))).map(([key]) => key),
    ...schema.textKeys.filter((key) => typeof obj[key] !== 'string'),
  ];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const config = obj as unknown as C;
  const refused = validate?.(config) ?? [];
  return refused.length === 0 ? { ok: true, config } : { ok: false, errors: [...refused] };
}
