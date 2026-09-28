---
id: gaussian-splat-compression
title: Compressing Gaussian splat scenes
summary: "A 3DGS scene stores 59 floating-point numbers (236 bytes) per Gaussian across millions of Gaussians, so files run to hundreds of megabytes or more, mostly spherical-harmonic colour. Compression pulls five levers: fewer Gaussians, fewer bits per number, shared codebooks, lower colour degree and entropy coding, with anchor-based representations as a structural alternative."
requires: [gaussian-splatting-optimization]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:06.193Z
---

# Compressing Gaussian splat scenes

A 3DGS scene stores 59 floating-point numbers (236 bytes) per Gaussian across millions of Gaussians, so files run to hundreds of megabytes or more, mostly spherical-harmonic colour. Compression pulls five levers: fewer Gaussians, fewer bits per number, shared codebooks, lower colour degree and entropy coding, with anchor-based representations as a structural alternative.

## Why it matters

Raw splat scenes are too large to stream to a phone or browser, and GPU memory caps how much fits at once. In CP4282 this is the storage half of module 3: making scenes small enough to ship, at a known cost in quality and decode time.

## The idea

Bytes per Gaussian, in 32-bit floats:

| Attribute | Floats |
| --- | --- |
| Position | 3 |
| Scale | 3 |
| Rotation (quaternion) | 4 |
| Opacity | 1 |
| Colour, SH degree 3 (16 coefficients x 3 channels) | 48 |
| Total | 59, so 236 bytes |

Colour is 48 of 59 numbers, about 81%. (The reference PLY adds three unused normal values.)

The levers:

1. **Prune** Gaussians that contribute little to any view, cutting the count, which scales everything.
2. **Quantise** each number to fewer bits (16-bit floats, or 8-bit integers within a known range).
3. **Vector quantisation**: cluster similar attribute vectors, especially SH, into a shared codebook and store an index per Gaussian.
4. **Lower SH degree** where view dependence adds little. Degree 0 keeps only the 3 base colour numbers.
5. **Entropy coding** of the quantised values and indices, often after sorting Gaussians so neighbours are similar.

Structurally, one can store sparse anchors with feature vectors and decode nearby Gaussians with a small network, as in Scaffold-GS (Lu et al. 2024), trading storage for decode work.

Every method trades rate (bytes), quality (PSNR, SSIM, LPIPS on held-out views) and decode or render cost.

## Worked example

A scene has 3 million Gaussians. Uncompressed: $3\times10^6 \times 236$ bytes $= 708$ MB.

Keep SH degree 0 only: $3 + 3 + 4 + 1 + 3 = 14$ numbers. Store them as 16-bit floats: $14 \times 2 = 28$ bytes per Gaussian. Total: $3\times10^6 \times 28 = 84$ MB, about 8.4 times smaller.

The cost: view-dependent colour is gone, so highlights no longer move with the viewer. And a 16-bit float has 10 fraction bits, so between 64 and 128 its step is $2^6 \times 2^{-10} = 0.0625$: a position 100 m from the origin snaps to a 6 cm grid, which is why compressors quantise positions relative to a local origin or bounding box.

## Failure modes

- **Dropping colour blindly.** Lower SH degree removes gloss, which PSNR on diffuse scenes may barely register.
- **Naive position quantisation.** Precision fine near the origin becomes jitter far from it.
- **Counting file size only.** A tiny file that needs a network at render time may draw slower than the raw scene.

## Prerequisites

- [[gaussian-splatting-optimization]]

## Checks

```check
q: Roughly what share of an uncompressed 3DGS Gaussian's numbers are colour coefficients, and why so many?
a: 48 of 59, about 81%, because degree-3 spherical harmonics need 16 coefficients per colour channel to model view-dependent colour.
why: Catches assuming geometry (position, scale, rotation) dominates storage.
```

```check
q: A 3 million Gaussian scene is stored at SH degree 0 in 16-bit floats. About how large is it?
a: 14 numbers times 2 bytes is 28 bytes per Gaussian, so about 84 MB, against about 708 MB uncompressed.
why: Catches miscounting the per-Gaussian attributes or forgetting that degree 0 keeps 3 colour numbers.
```

```check
q: Why can storing positions as plain 16-bit floats cause visible problems in a large scene?
a: Half precision has about 10 fraction bits, so its step size grows with magnitude; at 100 units from the origin it is about 0.06 units, which snaps far Gaussians onto a coarse grid.
why: Catches treating quantisation error as uniform across the scene.
```
