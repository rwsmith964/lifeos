# AI cost projection

Section 11.3 asks for a projected per-user monthly cost once the prompts
exist and token counts can be estimated. This is that estimate — computed
from the actual system/user prompt templates in `lib/ai/prompts/`, not
measured against a live API (no `ANTHROPIC_API_KEY` was available in the
build session; see DECISIONS.md D-002). Treat the numbers as directionally
right, not invoiced-accurate — rerun this estimate with `messages.count_tokens`
against a real household once the app is live, and update `lib/ai/pricing.ts`
if actual per-token rates differ from what's assumed here (D-014).

## Rates assumed

`claude-sonnet-4-6` (Section 3's specified model): **$3.00 / MTok input,
$15.00 / MTok output** — see `lib/ai/pricing.ts`.

## Per-call estimate

| Feature | System prompt | Typical user prompt | Typical output | Input tokens | Output tokens | Cost/call |
|---|---|---|---|---|---|---|
| Gift suggestion | `GIFT_SUGGESTION_SYSTEM_PROMPT` (~530 tok) | person + interests + 5 gifts + dismissed list (~400 tok) | 3-tier JSON array (~350 tok) | ~930 | ~350 | **~0.81¢** |
| Daily brief | `BRIEF_SYSTEM_PROMPT` (~620 tok) | events + gift reminders + overdue contacts + weather + prep + weekend mention (~650 tok) | structured brief JSON (~500 tok) | ~1270 | ~500 | **~1.13¢** |
| Weekend plan | `WEEKEND_PLAN_SYSTEM_PROMPT` (~470 tok) | 4 scored candidates with weather/condition/travel data (~400 tok) | narration JSON (~300 tok) | ~870 | ~300 | **~0.71¢** |

(Token counts are rough word-count-based estimates from the actual prompt
template strings, not a real tokenizer run.)

Cost/call = `(input_tokens/1e6 × $3) + (output_tokens/1e6 × $15)`.

## Projected monthly cost per household

Using Section 11.3's own usage assumptions ("one brief per day plus roughly
three gift generations per month plus one weekend plan per week"):

| Feature | Frequency/month | Cost/call | Monthly cost |
|---|---|---|---|
| Daily brief | 30 | 1.13¢ | 33.9¢ |
| Gift suggestion | 3 | 0.81¢ | 2.4¢ |
| Weekend plan | ~4.3 | 0.71¢ | 3.1¢ |
| **Total** | | | **~39.4¢/month** |

That's under $0.02/day on average — well inside the $0.50/day
`ai_daily_spend_ceiling_cents` default, with a large margin for a heavier
household (more people, more events, longer gift history driving bigger
context) or a spike day (multiple gift suggestions generated at once by the
occasion scan). The daily ceiling is the real backstop, not this monthly
estimate — it exists specifically so a bad day doesn't become a bad month.

## What would change this materially

- **Household size.** Ten tracked people with rich interest/gift history
  each roughly doubles the daily brief's context (more overdue-cadence and
  gift-reminder lines) — call it 1.5-2x the brief line above for a large,
  active household.
- **Prompt caching.** None of the current prompts use `cache_control`. The
  base system prompt (`BASE_SYSTEM_PROMPT`) is identical across every call
  and feature, and each feature's own system prompt is static per
  household — both are exactly what prompt caching is for. Not implemented
  in this pass because system prompts here are short enough (~500-600 tok)
  that caching's ~1024-token minimum cacheable-prefix threshold isn't met
  reliably; revisit if per-household system prompts grow (e.g. injecting a
  household's own gift-shipping-window overrides) or if a future model's
  threshold drops.
