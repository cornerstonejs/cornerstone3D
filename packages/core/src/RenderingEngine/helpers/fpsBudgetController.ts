/**
 * Per-frame Target FPS budget controller (EMA + damped budgetPx) and
 * steps-then-scale LOD mapping used by legacy Volume3D interactive fidelity.
 */

export const VOLUME_3D_DEFAULT_TARGET_FPS = 10;
export const VOLUME_3D_MIN_TARGET_FPS = 1;
export const VOLUME_3D_MAX_TARGET_FPS = 30;

/** Absolute floor for adaptive pixel budget. */
export const HARD_MIN_BUDGET_PX = 10_000;

const FPS_EMA_ALPHA = 0.3;
const FPS_DEADBAND = 0.12;
const BUDGET_SHRINK_NEAR = 0.85;
const BUDGET_GROW_NEAR = 1.05;
const BUDGET_SHRINK_FAR = 0.55;
const BUDGET_GROW_FAR = 1.08;
const BUDGET_SHRINK_AGGRESSIVE = 0.35;
const BIG_SHRINK_RATIO = 0.18;
const MIN_ADAPTIVE_STEPS = 64;
/** Keep full scale until budget is this fraction of full-res pixels. */
const STEPS_ONLY_UNTIL = 0.55;
/** Fallback start fraction when no learned budget is available. */
export const AGGRESSIVE_START_BUDGET_FRAC = 0.4;

export type LodProfile = {
  minimumScale: number;
  maximumScale: number;
  steps: number;
};

export type ResolvedLod = {
  scale: number;
  steps: number;
  budgetPx: number;
};

export type FpsBudget = {
  targetMs: number;
  minPx: number;
  maxPx: number;
  budgetPx: number;
  update: (
    measuredMs: number,
    options?: { allowGrow?: boolean; aggressive?: boolean }
  ) => {
    changed: boolean;
    settled: boolean;
    shrunk: boolean;
    bigShrink: boolean;
  };
};

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeTargetFps(value: unknown): number {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    return VOLUME_3D_DEFAULT_TARGET_FPS;
  }
  return clamp(
    Math.round(fps),
    VOLUME_3D_MIN_TARGET_FPS,
    VOLUME_3D_MAX_TARGET_FPS
  );
}

/**
 * Map a pixel budget to scale + steps.
 * Prefer cutting ray steps while budget is high; once budget falls below
 * STEPS_ONLY_UNTIL × full-res pixels, blend scale down with steps.
 */
export function resolveTargetedLod(
  profile: LodProfile,
  nativePixels: number,
  pixelBudget: number
): ResolvedLod {
  const maxScale = profile.maximumScale ?? 1;
  const minScale = profile.minimumScale;
  const pixelsAtMax = Math.max(1, nativePixels * maxScale * maxScale);
  const budget = Math.max(HARD_MIN_BUDGET_PX, Number(pixelBudget) || 0);
  const fullSteps = profile.steps;
  const q = Math.min(1, budget / pixelsAtMax);

  if (q >= 1) {
    return {
      scale: maxScale,
      steps: fullSteps,
      budgetPx: budget,
    };
  }

  if (q >= STEPS_ONLY_UNTIL) {
    const steps = clamp(
      Math.round(fullSteps * q),
      Math.max(MIN_ADAPTIVE_STEPS, Math.round(fullSteps * STEPS_ONLY_UNTIL)),
      fullSteps
    );
    return { scale: maxScale, steps, budgetPx: budget };
  }

  const t = q / STEPS_ONLY_UNTIL;
  const stepsAtBlend = Math.max(
    MIN_ADAPTIVE_STEPS,
    Math.round(fullSteps * STEPS_ONLY_UNTIL)
  );
  const scale = minScale + (maxScale - minScale) * t;
  const steps = clamp(
    Math.round(MIN_ADAPTIVE_STEPS + (stepsAtBlend - MIN_ADAPTIVE_STEPS) * t),
    MIN_ADAPTIVE_STEPS,
    stepsAtBlend
  );
  return {
    scale: clamp(scale, minScale, maxScale),
    steps,
    budgetPx: budget,
  };
}

export function createFpsBudget({
  targetMs,
  minPx,
  maxPx,
  startPx,
}: {
  targetMs: number;
  minPx: number;
  maxPx: number;
  startPx: number;
}): FpsBudget {
  return {
    targetMs: Math.max(4, Number(targetMs) || 33),
    minPx: Math.max(HARD_MIN_BUDGET_PX, Number(minPx) || HARD_MIN_BUDGET_PX),
    maxPx: Math.max(HARD_MIN_BUDGET_PX, Number(maxPx) || HARD_MIN_BUDGET_PX),
    budgetPx: Math.max(HARD_MIN_BUDGET_PX, Number(startPx) || HARD_MIN_BUDGET_PX),
    update(measuredMs, { allowGrow = true, aggressive = false } = {}) {
      const result = {
        changed: false,
        settled: false,
        shrunk: false,
        bigShrink: false,
      };
      if (!(measuredMs > 0) || !Number.isFinite(measuredMs)) {
        return result;
      }
      this.minPx = Math.max(this.minPx, HARD_MIN_BUDGET_PX);
      const adj = this.targetMs / measuredMs;
      if (adj >= 1 - FPS_DEADBAND && adj <= 1 + FPS_DEADBAND) {
        result.settled = true;
        return result;
      }
      if (adj > 1 && !allowGrow) {
        return result;
      }
      const shrinkFar = aggressive ? BUDGET_SHRINK_AGGRESSIVE : BUDGET_SHRINK_FAR;
      const shrinkNear = aggressive
        ? Math.min(BUDGET_SHRINK_NEAR, 0.7)
        : BUDGET_SHRINK_NEAR;
      const growFar = aggressive ? 1.02 : BUDGET_GROW_FAR;
      const growNear = aggressive ? 1.02 : BUDGET_GROW_NEAR;
      const limited =
        adj < 0.65 || adj > 1.5
          ? Math.max(shrinkFar, Math.min(growFar, adj))
          : Math.max(shrinkNear, Math.min(growNear, adj));
      const previous = this.budgetPx;
      const next = Math.max(this.minPx, Math.min(this.maxPx, previous * limited));
      if (Math.abs(next - previous) < previous * 0.02) {
        return result;
      }
      this.budgetPx = next;
      result.changed = true;
      result.shrunk = next < previous;
      result.bigShrink =
        result.shrunk && (previous - next) / previous >= BIG_SHRINK_RATIO;
      return result;
    },
  };
}

export function updateEmaMs(previousEmaMs: number, dt: number): number {
  if (!(previousEmaMs > 0)) {
    return dt;
  }
  return (1 - FPS_EMA_ALPHA) * previousEmaMs + FPS_EMA_ALPHA * dt;
}
