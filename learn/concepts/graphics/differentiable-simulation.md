---
id: differentiable-simulation
title: Differentiable simulation
summary: A differentiable simulator returns the simulated outcome and its gradient with respect to the inputs (initial state, material parameters, control forces), usually by automatic differentiation through every time step. Questions like "which throw hits the target?" become gradient descent.
requires: []
assumes: [physics-informed-neural-network]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:47.094Z
---

# Differentiable simulation

A differentiable simulator returns the simulated outcome and its gradient with respect to the inputs (initial state, material parameters, control forces), usually by automatic differentiation through every time step. Questions like "which throw hits the target?" become gradient descent.

## Why it matters

Without gradients, fitting parameters or controls is trial and error, which scales badly with their number. With gradients, thousands can be tuned at once and networks inside the simulator train end to end. In CP4281 module 5 it follows [[physics-informed-neural-network]] models, but here the physics stays a solver and learning happens through it.

## The idea

A simulator steps $s_{n+1} = \Phi(s_n, p, u_n)$ with parameters $p$ and controls $u_n$, and a loss $L(s_N)$ scores the outcome. By the chain rule $\partial L / \partial p$ multiplies every step's Jacobian, which reverse-mode autodiff computes by storing the trajectory and sweeping backwards (**backpropagation through time**). The **adjoint method** computes the same gradient by solving a backward equation, which can cut the memory needed to store the trajectory.

Uses:
- **System identification**: parameters that make the simulation match observations.
- **Control and trajectory optimisation**: forces or initial conditions that achieve a goal.
- **Training neural components** inside the simulator.

**Learned simulators** replace $\Phi$ with a network trained on simulation data; Sanchez-Gonzalez et al. (2020) treat particles as graph nodes and a graph network predicts their accelerations, simulating fluids and sand. **Hybrid simulators** keep the classical update and learn only a correction for what it misses.

## Worked example

Throw a ball from the ground with velocity $(v_x, v_y) = (5, 5)$ m/s and $g = 9.81$ m/s$^2$. It lands at $R = 2 v_x v_y / g \approx 5.10$ m. The target is at $6$ m, so take the loss $L = (R - 6)^2 \approx 0.82$.

The gradient is $\partial R / \partial v_x = 2 v_y / g \approx 1.02$, so $\partial L / \partial v_x = 2(R - 6) \times 1.02 \approx -1.84$. A step with learning rate $0.1$ raises $v_x$ by $0.18$ m/s, moving the landing point about $0.19$ m closer.

A differentiable simulator gets these gradients without the closed form, by differentiating each Euler step. One trap: the landing time is whichever step crosses the ground, a discrete choice with zero gradient, so a naive version misses how $v_y$ changes the flight time. Interpolating the exact crossing within the step restores it.

## Failure modes

- **Contact and collisions.** A tiny change can switch between hitting and missing an obstacle, so gradients jump, vanish or mislead.
- **Exploding or vanishing gradients.** Products of many step Jacobians blow up or shrink, as in recurrent networks.
- **Chaos.** In chaotic systems the exact long-horizon gradient is huge and erratic, of little use for optimisation.
- **Memory.** Backpropagation through time stores every state; long simulations need checkpointing or adjoints.

## Prerequisites

None beyond general background.

Useful background: [[physics-informed-neural-network]].

## Checks

```check
q: A ball launched at (5, 5) m/s lands 5.10 m away under g = 9.81. What is the derivative of the landing distance with respect to the horizontal velocity, and what does a differentiable simulator do with it?
a: Since R = 2 vx vy / g, dR/dvx = 2 vy / g, about 1.02 metres per metre per second. A differentiable simulator computes this through its time steps and uses it to adjust the velocity by gradient descent until the ball hits the target.
why: Catches not seeing that the gradient says how to change the input to move the outcome.
```

```check
q: Why do collisions cause trouble for gradient-based optimisation through a simulator?
a: A collision is a discontinuous event: a small change in input can switch between hitting and missing, so the outcome jumps and the local gradient is zero, huge or misleading. The gradient then no longer describes how to reach the goal.
why: Catches assuming autodiff gives useful gradients for any simulator.
```

```check
q: How does a learned simulator such as a graph network simulator differ from a hybrid simulator?
a: A learned simulator replaces the physics update entirely with a network trained on simulation data, for example a graph network predicting particle accelerations. A hybrid simulator keeps the classical physics update and learns only a correction for what it gets wrong.
why: Catches treating all learned or differentiable simulators as the same design.
```
