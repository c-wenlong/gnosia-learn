---
id: data-vs-model-parallelism
title: Data, tensor and pipeline parallelism
summary: Training across many GPUs means splitting something. Data parallelism splits the batch and copies the model; sharded data parallelism also splits the training state; tensor parallelism splits each matrix multiply; pipeline parallelism splits the layers into stages. Large runs combine them.
requires: []
tags: [transformers]
sources: []
created: 2026-09-28T15:43:04.497Z
---

# Data, tensor and pipeline parallelism

Training across many GPUs means splitting something. Data parallelism splits the batch and copies the model; sharded data parallelism also splits the training state; tensor parallelism splits each matrix multiply; pipeline parallelism splits the layers into stages. Large runs combine them.

## Why it matters

A 7B-parameter model already needs more training memory than one 80 GB GPU holds. What you split decides each device's memory and communication. In CP4284 this is module 6's overview of distributed training for large reasoning models.

## The idea

**Memory arithmetic.** Mixed-precision Adam keeps per parameter: 16-bit weights (2 bytes), 16-bit gradients (2), a 32-bit master copy (4), and two 32-bit Adam moments (4 + 4). That is 16 bytes, before activations.

**Data parallelism (DP).** Each of $N$ devices holds the full model and processes a different slice of the batch. After the backward pass an all-reduce averages the gradients, and every device applies the same update, so the copies stay identical. Each device still needs all 16 bytes per parameter.

**Sharded DP.** ZeRO (Rajbhandari et al. 2020), and later PyTorch FSDP, divide that state across the $N$ devices. Stage 1 shards the optimiser state, stage 2 also gradients, stage 3 also weights, gathered layer by layer just before use and then freed. Stage 3 costs about 1.5 times plain DP's communication.

**Tensor parallelism (TP).** Megatron-LM (Shoeybi et al. 2019) splits each layer's weight matrices across devices: the first MLP matrix by columns, the second by rows, attention by heads. Every layer then needs all-reduces in both passes, so TP stays inside a node with a fast interconnect.

**Pipeline parallelism (PP).** Consecutive layers form $p$ stages on $p$ devices. GPipe (Huang et al. 2019) splits each batch into $m$ micro-batches so stages overlap instead of waiting in turn. The idle fraction, the bubble, is $(p-1)/(m+p-1)$.

**3D parallelism** combines them, the degrees multiplying to the GPU count: TP 8 within a node, PP 4 across nodes and DP 16 use 512 GPUs.

## Worked example

A 7B model on 8 GPUs, counting training state only:

| Scheme | Bytes per parameter per GPU | Per GPU |
|---|---|---|
| Plain DP | 16 | 112 GB (does not fit in 80 GB) |
| ZeRO-1 | $2 + 2 + 12/8 = 5.5$ | 38.5 GB |
| ZeRO-2 | $2 + 14/8 = 3.75$ | 26.25 GB |
| ZeRO-3 | $16/8 = 2$ | 14 GB |

Pipeline bubble: with $p = 4$ and $m = 4$, $3/7 \approx 43\%$ of stage time is idle; with $m = 16$ it is $3/19 \approx 16\%$.

## Failure modes

- **Thinking DP saves memory.** Plain DP replicates everything; only sharding cuts per-device memory.
- **Ignoring activations.** Activation memory grows with batch and sequence length and can exceed the training state; checkpointing trades recomputation for it.
- **TP over a slow link.** Per-layer all-reduces across nodes leave GPUs waiting.
- **Too few micro-batches.** A small $m$ leaves stages idle for much of each step.

## Prerequisites

None beyond general background.

## Checks

```check
q: Under mixed-precision Adam at 16 bytes per parameter, how much training-state memory does a 3B model need per GPU with plain data parallelism, and with ZeRO-3 across 4 GPUs?
a: Plain DP: 3 billion x 16 bytes = 48 GB on every GPU. ZeRO-3 divides it by 4, giving 12 GB per GPU, before activations.
why: Catches thinking plain data parallelism reduces per-device memory, when it replicates the full training state.
```

```check
q: Why is tensor parallelism usually kept within a single node while data parallelism can span many nodes?
a: Tensor parallelism needs all-reduces inside every layer on every forward and backward pass, so it needs a very fast interconnect; data parallelism communicates gradients once per step, which tolerates slower links.
why: Catches not linking each scheme's communication pattern to where it can be placed.
```

```check
q: A pipeline has 8 stages and each batch is split into 8 micro-batches. What fraction of stage time is the bubble, and how do you shrink it?
a: (p-1)/(m+p-1) = 7/15, about 47%. Use more micro-batches per batch, which spreads the fixed fill and drain time over more work.
why: Catches not knowing why pipeline parallelism splits a batch into micro-batches.
```
