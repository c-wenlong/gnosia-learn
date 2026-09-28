---
id: continuous-batching
title: Continuous batching for LLM serving
summary: "Continuous batching schedules requests per decoding step: after every step, finished sequences leave the batch and waiting ones join, so no slot idles waiting for the longest member. With paged KV cache storage, as in vLLM, one GPU serves many more requests at once."
requires: [causal-attention-mask]
tags: [transformers]
sources: []
created: 2026-09-28T15:42:54.053Z
---

# Continuous batching for LLM serving

Continuous batching schedules requests per decoding step: after every step, finished sequences leave the batch and waiting ones join, so no slot idles waiting for the longest member. With paged KV cache storage, as in vLLM, one GPU serves many more requests at once.

## Why it matters

Serving cost is set by tokens per second per GPU across all users. In CP4284 this is module 6's batching topic, with vLLM (the course resource) as the reference system.

## The idea

A request has two phases. **Prefill** processes the whole prompt in one parallel pass and is compute-bound. **Decode** produces one token per step, reusing the KV cache described in [[causal-attention-mask]]. Each decode step reads every weight from GPU memory to make one token per sequence, so it is memory-bandwidth bound; batching shares that read across sequences.

**Static batching** holds a batch until every sequence finishes: a 10-token request's slot idles while another generates 500. **Continuous (iteration-level) batching**, introduced by Orca (Yu et al., OSDI 2022), revisits the batch after every step.

The limit becomes KV cache memory, which grows with sequence length:

$$\text{KV bytes per token} = 2 \times \text{layers} \times \text{kv heads} \times \text{head dim} \times \text{bytes per number}$$

The 2 is one key and one value. Reserving each request's maximum length up front wastes most of it. PagedAttention (Kwon et al., SOSP 2023) stores the cache in fixed-size blocks (16 tokens by default in vLLM) mapped through a block table like virtual memory pages, allocated as a sequence grows. Waste is confined to each sequence's last block, and shared prefixes can share blocks. The paper reports 2 to 4 times the throughput of FasterTransformer and Orca at the same latency.

The trade-off: a larger batch raises total throughput, but each step takes longer, so each user's tokens arrive more slowly.

## Worked example

Llama 2 7B: 32 layers, 32 KV heads, head dimension 128, fp16 (2 bytes).

$$2 \times 32 \times 32 \times 128 \times 2 = 524{,}288 \text{ bytes} = 512 \text{ KiB per token}.$$

A 4,096-token sequence needs 2 GiB. On an 80 GB GPU the fp16 weights take about 14 GB, leaving roughly 66 GB, enough for about 30 full-length sequences. For short sequences the weight read sets the pace: 14 GB at roughly 2 TB/s is about 7 ms per step, much the same for 1 sequence as for 16. Long contexts add cache reads on top. Llama 3 8B uses grouped-query attention with 8 KV heads, so its cache is 128 KiB per token, a quarter of that.

## Failure modes

- **Expecting batching to speed up one request.** It raises total throughput; one request's latency stays level or worsens.
- **Sizing memory by weights alone.** Under load the KV cache runs out first.
- **Counting query heads.** Using 32 heads instead of 8 KV heads for a grouped-query model overestimates the cache fourfold.
- **Long prompts.** A big prefill stalls everyone's decoding unless split into chunks.

## Prerequisites

- [[causal-attention-mask]]

## Checks

```check
q: A model has 40 layers, 8 KV heads, head dimension 128, and stores the cache in fp16. How many bytes of KV cache does one token need?
a: 2 x 40 x 8 x 128 x 2 = 163,840 bytes, which is 160 KiB per token.
why: Catches forgetting the factor of 2 for keys and values, or using query heads instead of KV heads.
```

```check
q: Why does batching more sequences raise decode throughput almost for free, up to a point?
a: Each decode step is memory-bandwidth bound: reading all the weights dominates, and that single read can serve every sequence in the batch, so extra sequences add little time until compute or KV cache reads start to dominate.
why: Catches not knowing that decoding is limited by memory bandwidth rather than arithmetic.
```

```check
q: What problem does continuous batching fix that static batching has?
a: Static batching keeps a batch until its longest sequence finishes, so slots of finished requests sit idle and new requests wait. Continuous batching retires finished sequences and admits new ones after every decoding step.
why: Catches thinking the gain comes from bigger batches rather than from scheduling at each step.
```
