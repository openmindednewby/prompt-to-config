# Changelog

## 0.2.0

- Embedding tier: `deadlineMs` option (default `DEFAULT_EMBED_DEADLINE_MS`, 8 s) and `onProgress` option (model load progress). New `tryConfig()` resolves `TierStatus.TimedOut` at the deadline; `config()` keeps its type and rejects with `timed-out`.
- `TierReplyKind` const enum for worker reply kinds; `TierReply` still accepts the plain `'done'` / `'progress'` strings.

## 0.1.0

- First release: keyword, embedding and LLM tiers with gap fill, schema grammar + parser, tier worker runner, grading helpers. Extracted from Flier Studio `src/ai` (BEAD-AI-1 AC-AI-7).
