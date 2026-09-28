---
id: physics-informed-neural-network
title: Physics-informed neural networks
summary: A physics-informed neural network (PINN) represents the solution of a differential equation as a network $u_\theta(x, t)$, trained so the equation holds at many sampled points (its derivatives computed by automatic differentiation) while also fitting boundary conditions, initial conditions and any measured data.
requires: []
tags: [graphics]
sources: []
created: 2026-09-28T15:46:41.694Z
---

# Physics-informed neural networks

A physics-informed neural network (PINN) represents the solution of a differential equation as a network $u_\theta(x, t)$, trained so the equation holds at many sampled points (its derivatives computed by automatic differentiation) while also fitting boundary conditions, initial conditions and any measured data.

## Why it matters

Classical solvers need a mesh or grid and solve the forward problem. A PINN needs no mesh, and handles the inverse problem (unknown coefficients inferred from sparse measurements) with the same machinery. In CP4281 module 5, following Raissi, Perdikaris and Karniadakis (2019), it is the first way the course brings learning into simulation.

## The idea

Write the PDE as $\mathcal{N}[u] = 0$. The network maps coordinates to the solution value, a continuous function rather than a grid.

Autodiff gives $\partial u_\theta / \partial t$, $\partial^2 u_\theta / \partial x^2$ and so on exactly at any input. The **residual** $r_\theta(x, t) = \mathcal{N}[u_\theta](x, t)$ measures how badly the equation fails there.

The loss has two kinds of term:

$$\mathcal{L}(\theta) = \underbrace{\frac{1}{N_d}\sum_{k} \big(u_\theta(x_k, t_k) - u_k\big)^2}_{\text{data, boundary, initial}} + \lambda\,\underbrace{\frac{1}{N_r}\sum_{m} r_\theta(x_m, t_m)^2}_{\text{PDE residual}}$$

The residual points $(x_m, t_m)$ are **collocation points**, sampled anywhere in the domain; no mesh connects them.

For an **inverse problem**, an unknown coefficient in $\mathcal{N}$ (a diffusivity, a viscosity) is made a trainable parameter next to $\theta$. Minimising both terms finds the coefficient under which the solution fits the data and obeys the equation.

## Worked example

The 1-D heat equation $u_t = k\,u_{xx}$ on $0 \le x \le 1$, with $u(0,t) = u(1,t) = 0$ and $u(x,0) = \sin \pi x$, has residual $r = u_t - k\,u_{xx}$.

The exact solution is $u = e^{-k\pi^2 t}\sin \pi x$. Then $u_t = -k\pi^2 u$ and $u_{xx} = -\pi^2 u$, so $r = -k\pi^2 u + k\pi^2 u = 0$ at every point.

Now suppose $k = 0.1$ and the network has learned $u_\theta = e^{-t}\sin \pi x$. It satisfies the boundary and initial conditions, so the data term is zero. But $u_t = -u$ and $k\,u_{xx} = -0.1\pi^2 u \approx -0.987u$, so $r \approx -0.013\,u$. At the collocation point $(0.5, 0)$, $u = 1$ and $r \approx -0.013$. Only the residual term notices the decay rate is wrong, and its gradient pushes the rate toward $0.1\pi^2 \approx 0.987$.

## Failure modes

- **Stiff and multi-scale problems.** Equations with sharp fronts, shocks or widely separated scales train poorly or converge to wrong, smooth solutions.
- **Balancing the loss.** The data and residual terms can differ by orders of magnitude, and a badly chosen $\lambda$ lets one term dominate.
- **Spectral bias.** The network fits smooth components first and struggles with high-frequency solutions.
- **Worse than classical solvers on forward problems.** For a plain forward solve on a known geometry, finite elements or finite differences are usually faster and more accurate; the PINN's advantages are inverse problems and irregular, mesh-free settings.

## Prerequisites

None beyond general background.

## Checks

```check
q: How does a PINN get the derivatives it needs for the PDE residual, and where is the residual evaluated?
a: By automatic differentiation of the network output with respect to its input coordinates, which is exact for the network. The residual is evaluated at collocation points sampled across the domain, with no mesh.
why: Catches assuming PINNs use finite differences on a grid.
```

```check
q: A PINN candidate satisfies the boundary and initial conditions exactly but has the wrong decay rate for the heat equation. Which term of the loss detects this?
a: Only the PDE residual term, because the boundary and initial data are already matched. The residual u_t - k u_xx is nonzero inside the domain and its gradient corrects the decay rate.
why: Catches thinking fitting boundary and initial conditions is enough to pin down the solution.
```

```check
q: How does a PINN solve an inverse problem such as an unknown diffusivity?
a: The unknown coefficient is made a trainable parameter alongside the network weights. Minimising the data misfit plus the PDE residual finds the coefficient under which the fitted solution both matches the measurements and obeys the equation.
why: Catches believing inverse problems need a different method from the forward PINN.
```
