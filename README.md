# @dloizides/prompt-to-config

Turn a free-text prompt into a validated config object, in the browser, in three tiers:

1. **LLM tier** (`createLlmTier`): a small GGUF model through `@dloizides/llm-run`, reply held to a GBNF grammar built from your schema, then parsed and validated.
2. **Embedding tier** (`createEmbedTier`): sentence-embedding match per field over your preset corpus (`@dloizides/llm-run/intent`), no text generation.
3. **Keyword tier** (`keywordConfig`): your keyword table, first rule per field wins, whole-word match.

`gapFill(embed, keyword)` takes each field the embedding matched and the keyword value for the rest. `createTierRunner` runs tiers in a Web Worker with a deadline. `gradeConfig` + `p50` grade a tier against a hand-keyed prompt set.

No product logic: the caller passes the schema (`choices` + `textKeys`), the keyword table, the preset corpus, extractors (for example a date regex) and an optional validator.

```ts
import { createEmbedTier, gapFill, keywordConfig } from '@dloizides/prompt-to-config';

const keyword = keywordConfig({ base, rules: [{ field: 'shape', value: 'square', words: ['square'] }] }, prompt);
const embed = await createEmbedTier({ embed: runtime.embed, corpus, base }).config(prompt);
const config = gapFill(embed, keyword);
```

Peer dependency: `@dloizides/llm-run` ^0.4.1. Licence: Apache-2.0.
