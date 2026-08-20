/**
 * Bayesian Knowledge Tracing.
 *
 * The learner model is a probability per concept: p(L) = "this mind has
 * latent mastery of this concept". Every answered question is evidence that
 * moves p(L). Four parameters govern it:
 *
 *   pL0  prior       — belief before any evidence
 *   pT   transit     — chance of learning the concept at each opportunity
 *   pG   guess       — chance of answering right WITHOUT mastery
 *   pS   slip        — chance of answering wrong DESPITE mastery
 *
 * Guess defaults assume 4-option multiple choice (chance = 0.25), nudged
 * down because a well-written distractor set beats pure chance.
 */

export const DEFAULT_PARAMS = Object.freeze({
  pL0: 0.25,
  pT: 0.15,
  pG: 0.2,
  pS: 0.1,
});

/** p(L) at or above this counts as mastered. */
export const MASTERY_THRESHOLD = 0.95;

/** p(L) at or below this counts as a genuine gap rather than uncertainty. */
export const GAP_THRESHOLD = 0.4;

function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/**
 * Posterior p(L) given one observation, before the learning step.
 * Correct:   p(L)(1-pS) / [ p(L)(1-pS) + (1-p(L))pG ]
 * Incorrect: p(L)pS     / [ p(L)pS     + (1-p(L))(1-pG) ]
 */
export function posterior(prior, correct, params = DEFAULT_PARAMS) {
  const { pG, pS } = { ...DEFAULT_PARAMS, ...params };
  const pL = clamp01(prior);

  const numerator = correct ? pL * (1 - pS) : pL * pS;
  const denominator = correct
    ? pL * (1 - pS) + (1 - pL) * pG
    : pL * pS + (1 - pL) * (1 - pG);

  if (denominator === 0) return pL;
  return clamp01(numerator / denominator);
}

/** Apply the learning (transit) step: p(L') = post + (1-post)·pT */
export function transit(post, params = DEFAULT_PARAMS) {
  const { pT } = { ...DEFAULT_PARAMS, ...params };
  return clamp01(post + (1 - post) * pT);
}

/**
 * Full update for one observation. `opportunity` is false for pure
 * assessment (a probe question teaches nothing, so no transit step).
 */
export function update(prior, correct, options = {}) {
  const { params = DEFAULT_PARAMS, opportunity = true } = options;
  const post = posterior(prior, correct, params);
  return opportunity ? transit(post, params) : post;
}

/** Probability the learner answers the next item correctly. */
export function predictCorrect(pL, params = DEFAULT_PARAMS) {
  const { pG, pS } = { ...DEFAULT_PARAMS, ...params };
  const p = clamp01(pL);
  return clamp01(p * (1 - pS) + (1 - p) * pG);
}

/**
 * Shannon entropy of the belief, in bits. This is the quantity a probe
 * should reduce: the most informative question is the one asked where we
 * are least certain, which is what makes the probe a binary search rather
 * than a quiz that marches through everything.
 */
export function entropy(pL) {
  const p = clamp01(pL);
  if (p === 0 || p === 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/**
 * Expected information gain from asking about a concept, in bits: current
 * entropy minus the probability-weighted entropy of both outcomes.
 */
export function expectedInfoGain(pL, params = DEFAULT_PARAMS) {
  const pCorrect = predictCorrect(pL, params);
  const ifCorrect = entropy(posterior(pL, true, params));
  const ifWrong = entropy(posterior(pL, false, params));
  const after = pCorrect * ifCorrect + (1 - pCorrect) * ifWrong;
  return Math.max(0, entropy(pL) - after);
}

/**
 * How much of a direct update indirect evidence carries, per hop.
 * 0.4 means an immediate prerequisite gets 40% of the movement, its own
 * prerequisite 16%, and so on. Evidence thins fast with distance because a
 * correct answer says a lot about what sits directly underneath it and very
 * little about what sits five levels down.
 */
export const PROPAGATION_DECAY = 0.4;

/**
 * Indirect evidence can raise confidence but never confer mastery on its own.
 * Without this ceiling, a long enough correct streak high in the graph would
 * mark concepts mastered that the learner was never actually asked about.
 */
export const PROPAGATION_CEILING = 0.9;

/**
 * Update a prerequisite from evidence observed `hops` away.
 *
 * Blends toward the full posterior rather than applying it, so distance
 * attenuates the movement. Returns the prior unchanged for hops < 1, since
 * that is the direct case and belongs to `update`.
 */
export function propagate(prior, correct, hops, options = {}) {
  const {
    params = DEFAULT_PARAMS,
    decay = PROPAGATION_DECAY,
    ceiling = PROPAGATION_CEILING,
  } = options;

  if (!Number.isFinite(hops) || hops < 1) return clamp01(prior);

  const p = clamp01(prior);
  const full = posterior(p, correct, params);
  const weight = Math.pow(decay, hops);
  const blended = p + weight * (full - p);

  // A concept already above the ceiling keeps its earned belief.
  return clamp01(Math.min(blended, Math.max(p, ceiling)));
}

export function isMastered(pL) {
  return pL >= MASTERY_THRESHOLD;
}

export function isGap(pL) {
  return pL <= GAP_THRESHOLD;
}

/** Coarse label for display. */
export function masteryLabel(pL) {
  if (pL >= MASTERY_THRESHOLD) return "mastered";
  if (pL >= 0.75) return "solid";
  if (pL >= 0.55) return "shaky";
  if (pL > GAP_THRESHOLD) return "weak";
  return "gap";
}
