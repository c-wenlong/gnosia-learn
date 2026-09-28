---
id: uv-texture-mapping
title: UV texture mapping
summary: UV texture mapping gives every mesh vertex a coordinate $(u, v)$ in the unit square of a 2D image, interpolates those coordinates across each triangle, and looks up the image at every pixel, so detail far finer than the mesh can be painted onto it.
requires: [triangle-mesh-representation]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:03.703Z
---

# UV texture mapping

UV texture mapping gives every mesh vertex a coordinate $(u, v)$ in the unit square of a 2D image, interpolates those coordinates across each triangle, and looks up the image at every pixel, so detail far finer than the mesh can be painted onto it.

## Why it matters

A mesh of a few thousand triangles cannot hold wood grain or skin pores, but an image can, and textures also feed shading (normals, roughness). In CP4281 texturing completes the classical refresher; the idea of an interpolated lookup table returns in neural textures and in later NeRF hash grids.

## The idea

Each vertex of the [[triangle-mesh-representation]] stores $(u, v) \in [0, 1]^2$. The rasteriser interpolates UVs across the triangle (perspective-correctly), and the fragment shader samples the texture there.

**Unwrapping** chooses the UVs: cut the surface along **seams** and flatten the pieces into the square. Curved surfaces cannot flatten without distortion, so unwrapping trades stretch against seams. A seam vertex is duplicated, one copy per side, same position, different UVs.

**Wrapping modes** decide what happens outside $[0, 1]$: repeat (tile), mirrored repeat, or clamp to the edge.

**Filtering** reads between texels: nearest picks one, bilinear blends the four nearest. When a pixel covers many texels (minification, as on a distant floor), sampling one spot aliases into shimmer. **Mipmaps** precompute half-size, quarter-size and smaller copies (about one third extra memory) and sample the level matching the pixel's footprint; trilinear filtering blends two levels.

A **normal map** stores a per-texel normal (usually tangent-space, packed into RGB as $(n + 1)/2$) that replaces the interpolated normal in shading, faking bumps. **Roughness** maps vary the material.

## Worked example

A square quad has corners with UVs $(0,0)$, $(1,0)$, $(1,1)$, $(0,1)$ and shows a $4 \times 4$ texture. A fragment at $u = 0.3$ maps to continuous texel coordinate $0.3 \times 4 - 0.5 = 0.7$ (texel centres sit at half-integers), so bilinear filtering blends texel column 0 with weight $0.3$ and column 1 with weight $0.7$.

Now wrap a texture round a cylinder made of 8 side quads. The last quad's vertices want $u = 0.875$ and $u = 1.0$. If the mesh shares the seam vertex with the first quad, it holds $u = 0$ there, and that last quad interpolates from $0.875$ back down to $0$, squeezing almost the whole texture, reversed, into one strip. Duplicating the seam vertex with $u = 1.0$ on one copy and $u = 0$ on the other fixes it.

## Failure modes

- **Stretching.** Triangles with small UV area relative to 3D area get blurry, stretched texture.
- **Visible seams.** Filtering and mipmapping read texels across the seam that belong elsewhere, so seams show as lines unless each UV island is padded.
- **Aliasing without mipmaps.** Minified textures shimmer and form moire patterns.
- **Shared seam vertices.** Welding a seam vertex forces one UV and gives the squeezed strip above.

## Prerequisites

- [[triangle-mesh-representation]]

## Checks

```check
q: A cylinder is textured with u running from 0 to 1 around it, and one strip of the cylinder shows the whole texture squeezed and reversed. What went wrong?
a: The seam vertex is shared, so it holds u = 0 for both the first and last strips. The last strip interpolates from about 0.9 back to 0. The seam vertex must be duplicated, with u = 1 on one copy and u = 0 on the other.
why: Catches the belief that a vertex position can have only one UV and that seams need no special handling.
```

```check
q: Why does a finely detailed texture on a distant floor shimmer when the camera moves, and what fixes it?
a: Each pixel covers many texels but samples only one or four of them, so the result aliases and changes as the camera moves. Mipmaps precompute filtered, smaller copies and sample the level matching the pixel's footprint.
why: Catches thinking bilinear filtering alone prevents aliasing under minification.
```

```check
q: What does a normal map change in shading, and what does it not change?
a: It replaces the normal used in the lighting calculation per texel, so the lighting shows bumps. It does not move any geometry, so silhouettes and shadows stay those of the flat mesh.
why: Catches confusing normal mapping with displacement of the actual surface.
```
