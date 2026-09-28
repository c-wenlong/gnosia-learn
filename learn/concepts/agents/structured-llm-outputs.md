---
id: structured-llm-outputs
title: Structured LLM outputs with typed schemas
summary: Declare an LLM's output shape as a Pydantic model, send its JSON Schema, validate the reply and retry on errors; validation checks types, not truth.
requires: []
assumes: [tool-calling]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:33:10.531Z
---

# Structured LLM outputs with typed schemas

Instead of parsing free text from a language model, you declare the answer's shape as a typed schema, usually a Pydantic model in Python, send it to the model, and validate what comes back. A reply that fails is retried with the error attached, or rejected, so the rest of your program only sees correctly shaped data.

## Why it matters

An agentic product feeds model output into code: a database write, an API call, a card on screen. With free text, a missing field or a price written as "about twenty dollars" becomes a crash or a silently wrong value far from its cause. A schema moves that failure to one place you control.

## The idea

CS3216 (Software Product Engineering for Digital Markets) places this under its Agentic AI Building Blocks module.

The loop, using the Pydantic v2 API:

1. **Declare.** Subclass `BaseModel` with typed fields and constraints such as `Field(ge=1, le=5)`.
2. **Send the schema.** `Model.model_json_schema()` returns a JSON Schema. Put it in the prompt, or make it a tool's input schema so the model answers by calling that tool ([[tool-calling]]).
3. **Validate.** `Model.model_validate_json(reply)` parses the raw JSON and checks every field. It returns a typed object or raises `ValidationError` naming each failing field.
4. **Retry with the error.** Send back the reply plus the validation messages and ask for a correction. Cap the retries, then fail loudly.

Some providers can also constrain decoding so the model can only produce output fitting a supplied schema (supported schema features vary by provider). This guarantees shape, not correct content.

More generally, validation checks types, not truth. A `rating` field bounded 1 to 5 rejects "great" and 7, but happily accepts a 4 that the review does not support. Checking truth needs a separate step: a rule, a lookup, a second model or a person.

## Worked example

A study app turns pasted lecture notes into flashcards.

```python
from typing import Literal
from pydantic import BaseModel, Field

class Card(BaseModel):
    question: str
    answer: str
    difficulty: Literal["easy", "medium", "hard"]

class Deck(BaseModel):
    cards: list[Card] = Field(min_length=1, max_length=20)
```

The app sends `Deck.model_json_schema()` with the notes. The first reply gives the third card a difficulty of "moderate", so `Deck.model_validate_json(reply)` raises a `ValidationError` pointing at that field and listing the allowed values. The app sends that message back, and the second reply passes.

One card still has a wrong answer. Validation cannot catch that, so students can flag cards.

## Failure modes

- **Trusting valid as correct.** A reply passes the schema and is treated as true. Notice it when nothing checks content.
- **Unbounded retries.** A model that keeps failing loops forever and burns cost. Always cap attempts.
- **Over-loose schemas.** Every field an optional string, so almost anything passes. Use literals, bounds and required fields.
- **Schema too complex for the model.** Deep nesting and many fields make failures more likely. Split the task or simplify.

## Prerequisites

- [[tool-calling]] (background)

## Checks

```check
q: A provider's constrained decoding guarantees every reply matches your schema. Can you now skip checking the content? Why?
a: No. Constrained decoding guarantees the shape, not that the values are correct. A field can hold a well-typed but wrong value, so content still needs its own check.
why: Catches equating schema conformance with correctness.
```

```check
q: In Pydantic v2, which method gives you the JSON Schema to send to the model, and which parses and validates the model's raw JSON string?
a: model_json_schema() produces the JSON Schema; model_validate_json() parses and validates the raw JSON string, raising ValidationError on failure.
why: Catches mixing up Pydantic v1 names (schema_json, parse_raw) with the v2 API.
```

```check
q: Validation fails on the model's reply. What should the retry prompt contain, and what should bound the retries?
a: It should include the failed reply and the validation error messages so the model knows which fields to fix. A fixed cap on attempts bounds it, after which the call fails loudly.
why: Catches retrying blindly with the same prompt, or looping without a limit.
```
