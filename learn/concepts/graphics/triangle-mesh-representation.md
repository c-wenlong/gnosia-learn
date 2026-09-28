---
id: triangle-mesh-representation
title: Triangle mesh representation
summary: A triangle mesh stores a surface as a list of vertex positions plus a list of triangles, each triangle naming three vertices by index, so vertices shared by neighbouring triangles are stored once and the surface is piecewise flat.
requires: []
tags: [graphics]
sources: []
created: 2026-09-28T15:45:58.454Z
---

# Triangle mesh representation

A triangle mesh stores a surface as a list of vertex positions plus a list of triangles, each triangle naming three vertices by index, so vertices shared by neighbouring triangles are stored once and the surface is piecewise flat.

## Why it matters

Meshes are what GPUs rasterise and what modelling tools and games use. In CP4281 the mesh is the classical starting point, and its awkwardness for neural networks is why module 2 turns to implicit and neural representations.

## The idea

The **vertex list** holds positions $v_i \in \mathbb{R}^3$; the **index list** (face list) holds triples $(i, j, k)$. Vertices can also carry **attributes** (normal, colour, UV coordinates) that the rasteriser interpolates across each triangle.

The index order is the **winding**. By OpenGL's default, a triangle appearing counter-clockwise on screen is front-facing, so the GPU can discard the rest (**back-face culling**). Winding also fixes the face normal's direction, $(v_j - v_i) \times (v_k - v_i)$.

A mesh is **manifold** when every edge has at most two triangles and the triangles round each vertex form a single fan. Many algorithms assume this.

Adjacency queries (which triangles touch this vertex?) are slow with only an index list. The **half-edge** structure stores each edge as two directed half-edges, each pointing to its twin, the next half-edge round its face, its vertex and its face, so such queries are local walks.

For a closed mesh of genus 0 (no handles), the **Euler characteristic** is $V - E + F = 2$; for genus $g$ it is $2 - 2g$.

Meshes suit hardware but not learning. Shapes differ in vertex count and have irregular connectivity, so they do not fit a network's fixed-size tensors, and deforming a template never changes its topology.

## Worked example

A unit cube has 8 corner vertices. Each of its 6 square faces is split into 2 triangles, giving $F = 12$. The edges are the 12 cube edges plus 6 face diagonals, $E = 18$. Then $V - E + F = 8 - 18 + 12 = 2$, as expected for genus 0.

Indexed, that is 8 positions and 36 indices. The catch: for sharp shading each face needs its own normal, and each corner touches three faces, so real cube meshes store 24 vertices. A vertex is a whole tuple of attributes, not only a position.

## Failure modes

- **Inconsistent winding.** Mixed clockwise and counter-clockwise triangles make culling remove the wrong faces and flip some normals inwards.
- **Non-manifold input.** Edges shared by three or more faces break half-edge construction and many geometry tools.
- **Assuming a vertex is only a position.** Hard edges and UV seams split vertices, so counts exceed the corner count.
- **Expecting topology to change under deformation.** Moving vertices never adds or removes holes.

## Prerequisites

None beyond general background.

## Checks

```check
q: A cube mesh has 8 corners and 12 triangles. How many edges does it have, and what is V - E + F?
a: 18 edges: the 12 cube edges plus one diagonal on each of the 6 faces. V - E + F = 8 - 18 + 12 = 2, as for any closed genus-0 mesh.
why: Catches forgetting the face diagonals introduced by triangulating the squares.
```

```check
q: Why does a flat-shaded cube mesh usually store 24 vertices rather than 8?
a: A vertex is the full tuple of attributes, and each corner touches three faces with different normals. Each corner is therefore duplicated once per face, giving 8 x 3 = 24 vertices.
why: Catches the belief that vertex count equals the number of geometric corner positions.
```

```check
q: Give two reasons triangle meshes are awkward as the output of a neural network.
a: Shapes differ in vertex count and connectivity, so they do not map to a fixed-size tensor, and the connectivity is irregular. If you instead deform a fixed template, its topology is fixed, so it cannot add holes or separate parts.
why: Catches assuming a mesh is a regular array a network can predict directly.
```
