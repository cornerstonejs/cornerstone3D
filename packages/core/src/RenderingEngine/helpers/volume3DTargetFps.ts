import { getEnabledElementByViewportId } from '../../getEnabledElement';
import ViewportType from '../../enums/ViewportType';
import type { IViewport } from '../../types/IViewport';
import type { ActorEntry } from '../../types/IActor';
import {
  AGGRESSIVE_START_BUDGET_FRAC,
  createFpsBudget,
  HARD_MIN_BUDGET_PX,
  normalizeTargetFps,
  resolveTargetedLod,
  updateEmaMs,
  VOLUME_3D_DEFAULT_TARGET_FPS,
  type FpsBudget,
  type LodProfile,
  type ResolvedLod,
} from './fpsBudgetController';

export {
  VOLUME_3D_DEFAULT_TARGET_FPS,
  VOLUME_3D_MIN_TARGET_FPS,
  VOLUME_3D_MAX_TARGET_FPS,
} from './fpsBudgetController';

/** Fixed interactive sample-distance factor (legacy rotate ×2). */
export const VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR = 2;

export type Volume3DInteractiveQualityPolicy =
  | 'fixedSampleDistance'
  | 'targetFps';

export type Volume3DTargetFpsPhase =
  | 'idle'
  | 'learn'
  | 'hold'
  | 'steer'
  | 'settled';

export type Volume3DTargetFpsSnapshot = {
  enabled: boolean;
  policy: Volume3DInteractiveQualityPolicy;
  interacting: boolean;
  phase: Volume3DTargetFpsPhase;
  targetFps: number;
  targetMs: number;
  emaFps: number;
  emaMs: number;
  budgetPx: number;
  minPx: number;
  maxPx: number;
  lastGoodBudgetPx: number;
  scale: number;
  steps: number;
  sampleDistance: number;
  dragFrames: number;
  budgetHoldFrames: number;
};

/** Throttle budget steering while still sampling every frame. */
const BUDGET_UPDATE_INTERVAL_MS = 500;
/** After resume, only allow shrink for this many budget samples. */
const RESUME_SHRINK_ONLY_FRAMES = 4;
/** Freeze budget this many frames after a large shrink. */
const BUDGET_HOLD_AFTER_SHRINK = 2;
/** Aggressive learn window after target FPS changes. */
const AGGRESSIVE_WINDOW_MS = 2000;

/** Nominal interactive step count for VTK sample-distance LOD. */
const INTERACTIVE_FULL_STEPS = 136;
const INTERACTIVE_MIN_SCALE = 0.35;

type MapperSampleDistance = {
  mapper: {
    getSampleDistance?: () => number;
    setSampleDistance?: (distance: number) => void;
  };
  baselineSampleDistance: number;
};

type Volume3DTargetFpsEntry = {
  targetFps: number;
  /** True when Target FPS / IFD is opted in. */
  enabled: boolean;
  policy: Volume3DInteractiveQualityPolicy;
  interacting: boolean;
  fpsBudget: FpsBudget;
  emaMs: number;
  lastPresentMs: number;
  lastBudgetUpdateAtMs: number;
  dragFrameCount: number;
  budgetHoldFrames: number;
  lastGoodBudgetPx: number;
  aggressiveUntilMs: number;
  skipNextDt: boolean;
  lastUpdateSettled: boolean;
  baselineMappers: MapperSampleDistance[];
  lastLod: ResolvedLod;
  lastPresentSize: {
    renderWidth: number;
    renderHeight: number;
    scale: number;
  } | null;
};

const entries = new Map<string, Volume3DTargetFpsEntry>();

const interactiveProfile: LodProfile = {
  minimumScale: INTERACTIVE_MIN_SCALE,
  maximumScale: 1,
  steps: INTERACTIVE_FULL_STEPS,
};

function isLegacyVolume3DViewport(viewport: IViewport | undefined): boolean {
  // Only the classic VolumeViewport3D class (`type === volume3d`), not
  // VOLUME_3D_NEXT / GenericViewport remaps.
  return viewport?.type === ViewportType.VOLUME_3D;
}

function resolveViewport(viewportId: string): IViewport | undefined {
  return getEnabledElementByViewportId(viewportId)?.viewport;
}

function ensureEntry(viewportId: string): Volume3DTargetFpsEntry | undefined {
  const existing = entries.get(viewportId);
  if (existing) {
    return existing;
  }

  const viewport = resolveViewport(viewportId);
  if (!viewport || !isLegacyVolume3DViewport(viewport)) {
    return undefined;
  }

  const nativePixels = Math.max(
    1,
    (viewport.sWidth || 1) * (viewport.sHeight || 1)
  );
  const maxPx = nativePixels;
  const minPx = HARD_MIN_BUDGET_PX;
  const startPx = Math.max(
    minPx,
    Math.round(maxPx * AGGRESSIVE_START_BUDGET_FRAC)
  );
  const targetFps = VOLUME_3D_DEFAULT_TARGET_FPS;
  const entry: Volume3DTargetFpsEntry = {
    targetFps,
    enabled: false,
    policy: 'fixedSampleDistance',
    interacting: false,
    fpsBudget: createFpsBudget({
      targetMs: 1000 / targetFps,
      minPx,
      maxPx,
      startPx,
    }),
    emaMs: 0,
    lastPresentMs: 0,
    lastBudgetUpdateAtMs: 0,
    dragFrameCount: 0,
    budgetHoldFrames: 0,
    lastGoodBudgetPx: 0,
    aggressiveUntilMs: 0,
    skipNextDt: false,
    lastUpdateSettled: false,
    baselineMappers: [],
    lastLod: {
      scale: 1,
      steps: INTERACTIVE_FULL_STEPS,
      budgetPx: startPx,
    },
    lastPresentSize: null,
  };
  entries.set(viewportId, entry);
  return entry;
}

function syncBudgetLimits(entry: Volume3DTargetFpsEntry, viewport: IViewport) {
  const nativePixels = Math.max(
    1,
    (viewport.sWidth || 1) * (viewport.sHeight || 1)
  );
  entry.fpsBudget.maxPx = Math.max(HARD_MIN_BUDGET_PX, nativePixels);
  entry.fpsBudget.minPx = HARD_MIN_BUDGET_PX;
  entry.fpsBudget.budgetPx = Math.max(
    entry.fpsBudget.minPx,
    Math.min(entry.fpsBudget.maxPx, entry.fpsBudget.budgetPx)
  );
  if (entry.lastGoodBudgetPx > 0) {
    entry.lastGoodBudgetPx = Math.max(
      entry.fpsBudget.minPx,
      Math.min(entry.fpsBudget.maxPx, entry.lastGoodBudgetPx)
    );
  }
}

function captureBaselineMappers(viewport: IViewport): MapperSampleDistance[] {
  const actors =
    typeof (viewport as { getActors?: () => ActorEntry[] }).getActors ===
    'function'
      ? (viewport as { getActors: () => ActorEntry[] }).getActors()
      : [];

  const baselines: MapperSampleDistance[] = [];
  for (const actorEntry of actors) {
    const actor = actorEntry?.actor as
      | { getMapper?: () => MapperSampleDistance['mapper'] }
      | undefined;
    const mapper = actor?.getMapper?.();
    if (!mapper?.getSampleDistance || !mapper?.setSampleDistance) {
      continue;
    }
    baselines.push({
      mapper,
      baselineSampleDistance: mapper.getSampleDistance(),
    });
  }
  return baselines;
}

/** Live VTK sample distance for overlays (first volume mapper). */
function resolveSampleDistance(
  entry: Volume3DTargetFpsEntry,
  viewportId: string
): number {
  const held = entry.baselineMappers[0]?.mapper?.getSampleDistance?.();
  if (typeof held === 'number' && Number.isFinite(held) && held > 0) {
    return held;
  }

  const viewport = resolveViewport(viewportId);
  if (!viewport) {
    return 0;
  }

  const actors =
    typeof (viewport as { getActors?: () => ActorEntry[] }).getActors ===
    'function'
      ? (viewport as { getActors: () => ActorEntry[] }).getActors()
      : [];

  for (const actorEntry of actors) {
    const actor = actorEntry?.actor as
      | { getMapper?: () => MapperSampleDistance['mapper'] }
      | undefined;
    const distance = actor?.getMapper?.()?.getSampleDistance?.();
    if (typeof distance === 'number' && Number.isFinite(distance) && distance > 0) {
      return distance;
    }
  }
  return 0;
}

function applyFixedSampleDistanceFactor(entry: Volume3DTargetFpsEntry) {
  const factor = VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR;
  for (const { mapper, baselineSampleDistance } of entry.baselineMappers) {
    mapper.setSampleDistance?.(baselineSampleDistance * factor);
  }
}

function applySampleDistanceForLod(
  entry: Volume3DTargetFpsEntry,
  lod: ResolvedLod
) {
  const fullSteps = INTERACTIVE_FULL_STEPS;
  const stepRatio = lod.steps > 0 ? fullSteps / lod.steps : 1;
  for (const { mapper, baselineSampleDistance } of entry.baselineMappers) {
    mapper.setSampleDistance?.(baselineSampleDistance * stepRatio);
  }
}

function restoreBaselineSampleDistances(entry: Volume3DTargetFpsEntry) {
  for (const { mapper, baselineSampleDistance } of entry.baselineMappers) {
    mapper.setSampleDistance?.(baselineSampleDistance);
  }
}

function computeLod(
  entry: Volume3DTargetFpsEntry,
  viewport: IViewport
): ResolvedLod {
  syncBudgetLimits(entry, viewport);
  const nativePixels = Math.max(
    1,
    (viewport.sWidth || 1) * (viewport.sHeight || 1)
  );
  return resolveTargetedLod(
    interactiveProfile,
    nativePixels,
    entry.fpsBudget.budgetPx
  );
}

function rearmLearning(entry: Volume3DTargetFpsEntry) {
  entry.emaMs = 0;
  entry.lastBudgetUpdateAtMs = 0;
  entry.dragFrameCount = 0;
  entry.budgetHoldFrames = 0;
  entry.lastGoodBudgetPx = 0;
  entry.aggressiveUntilMs = performance.now() + AGGRESSIVE_WINDOW_MS;
  entry.skipNextDt = true;
  entry.lastUpdateSettled = false;
}

function isTargetFpsPolicyActive(entry: Volume3DTargetFpsEntry): boolean {
  return entry.policy === 'targetFps' && entry.enabled;
}

function resolvePhase(entry: Volume3DTargetFpsEntry): Volume3DTargetFpsPhase {
  if (!entry.interacting) {
    return 'idle';
  }
  const now = performance.now();
  if (entry.aggressiveUntilMs > 0 && now < entry.aggressiveUntilMs) {
    return 'learn';
  }
  if (entry.budgetHoldFrames > 0) {
    return 'hold';
  }
  if (entry.lastUpdateSettled) {
    return 'settled';
  }
  return 'steer';
}

/**
 * Set the Target FPS for a legacy Volume3D viewport.
 * Clamps to 1–60. Returns false when the viewport is not legacy Volume3D.
 * Does not enable targeting by itself — use setVolume3DTargetFpsEnabled.
 */
export function setVolume3DTargetFps(
  viewportId: string,
  fps: number
): boolean {
  const entry = ensureEntry(viewportId);
  if (!entry) {
    return false;
  }
  const next = normalizeTargetFps(fps);
  const previous = entry.targetFps;
  entry.targetFps = next;
  entry.fpsBudget.targetMs = 1000 / next;
  if (next !== previous) {
    rearmLearning(entry);
  }
  const viewport = resolveViewport(viewportId);
  if (viewport) {
    syncBudgetLimits(entry, viewport);
  }
  return true;
}

export function getVolume3DTargetFps(viewportId: string): number | undefined {
  const entry = entries.get(viewportId) ?? ensureEntry(viewportId);
  return entry?.targetFps;
}

/**
 * Set interactive quality policy for a legacy Volume3D viewport.
 * `fixedSampleDistance` (default) applies ×2 during drag; `targetFps` uses
 * adaptive budget LOD when also enabled via setVolume3DTargetFpsEnabled.
 */
export function setVolume3DInteractiveQualityPolicy(
  viewportId: string,
  policy: Volume3DInteractiveQualityPolicy
): boolean {
  const entry = ensureEntry(viewportId);
  if (!entry) {
    return false;
  }
  if (policy !== 'fixedSampleDistance' && policy !== 'targetFps') {
    return false;
  }
  entry.policy = policy;
  if (policy === 'targetFps') {
    entry.enabled = true;
    rearmLearning(entry);
  } else {
    entry.enabled = false;
    if (entry.interacting) {
      endVolume3DInteraction(viewportId);
    }
  }
  return true;
}

export function getVolume3DInteractiveQualityPolicy(
  viewportId: string
): Volume3DInteractiveQualityPolicy | undefined {
  const entry = entries.get(viewportId) ?? ensureEntry(viewportId);
  return entry?.policy;
}

/**
 * Enable or disable interactive Target FPS for a legacy Volume3D viewport.
 * When enabled, policy becomes `targetFps`. When disabled, policy restores
 * `fixedSampleDistance` and any active interaction ends.
 */
export function setVolume3DTargetFpsEnabled(
  viewportId: string,
  enabled: boolean
): boolean {
  const entry = ensureEntry(viewportId);
  if (!entry) {
    return false;
  }
  const next = Boolean(enabled);
  entry.enabled = next;
  entry.policy = next ? 'targetFps' : 'fixedSampleDistance';
  if (!next && entry.interacting) {
    endVolume3DInteraction(viewportId);
  }
  if (next) {
    rearmLearning(entry);
  }
  return true;
}

export function getVolume3DTargetFpsEnabled(
  viewportId: string
): boolean | undefined {
  const entry = entries.get(viewportId) ?? ensureEntry(viewportId);
  return entry?.enabled;
}

/**
 * Begin interactive LOD for a legacy Volume3D viewport.
 * Returns true when interaction quality was armed (fixed ×2 or Target FPS).
 */
export function beginVolume3DInteraction(viewportId: string): boolean {
  const entry = ensureEntry(viewportId);
  const viewport = resolveViewport(viewportId);
  if (!entry || !viewport) {
    return false;
  }

  entry.baselineMappers = captureBaselineMappers(viewport);
  if (!entry.baselineMappers.length) {
    return false;
  }

  entry.interacting = true;
  entry.lastPresentSize = null;

  if (isTargetFpsPolicyActive(entry)) {
    syncBudgetLimits(entry, viewport);
    if (entry.lastGoodBudgetPx > 0) {
      entry.fpsBudget.budgetPx = Math.min(
        entry.fpsBudget.budgetPx,
        entry.lastGoodBudgetPx
      );
    }
    entry.skipNextDt = true;
    entry.dragFrameCount = 0;
    entry.lastBudgetUpdateAtMs = 0;
    entry.emaMs = 0;
    entry.lastUpdateSettled = false;
    entry.lastLod = computeLod(entry, viewport);
    applySampleDistanceForLod(entry, entry.lastLod);
  } else {
    // fixedSampleDistance (default)
    applyFixedSampleDistanceFactor(entry);
    entry.lastLod = {
      scale: 1,
      steps: INTERACTIVE_FULL_STEPS,
      budgetPx: entry.fpsBudget.budgetPx,
    };
  }

  return true;
}

/**
 * End interactive LOD and restore full-quality sample distances.
 */
export function endVolume3DInteraction(viewportId: string): boolean {
  const entry = entries.get(viewportId);
  if (!entry || !entry.interacting) {
    return false;
  }

  if (isTargetFpsPolicyActive(entry) && entry.emaMs > 0) {
    const result = entry.fpsBudget.update(entry.emaMs, { allowGrow: true });
    entry.lastUpdateSettled = result.settled;
    if (result.settled) {
      entry.lastGoodBudgetPx = entry.fpsBudget.budgetPx;
    }
  }

  restoreBaselineSampleDistances(entry);
  entry.baselineMappers = [];
  entry.interacting = false;
  entry.skipNextDt = false;
  entry.lastPresentSize = null;
  entry.lastLod = {
    scale: 1,
    steps: INTERACTIVE_FULL_STEPS,
    budgetPx: entry.fpsBudget.budgetPx,
  };
  return true;
}

export function isVolume3DInteracting(viewportId: string): boolean {
  return entries.get(viewportId)?.interacting === true;
}

/**
 * Interactive present size for ContextPool (smaller GL rect during Target FPS).
 * Returns null for fixedSampleDistance policy or when not interacting.
 */
export function getVolume3DInteractivePresentSize(
  viewportId: string,
  sWidth: number,
  sHeight: number
): { renderWidth: number; renderHeight: number; scale: number } | null {
  const entry = entries.get(viewportId);
  if (!entry?.interacting || !isTargetFpsPolicyActive(entry)) {
    return null;
  }

  const viewport = resolveViewport(viewportId);
  if (!viewport) {
    return null;
  }

  const lod = computeLod(entry, viewport);
  entry.lastLod = lod;
  applySampleDistanceForLod(entry, lod);

  if (!(lod.scale < 0.999)) {
    entry.lastPresentSize = null;
    return null;
  }

  const renderWidth = Math.max(1, Math.round(sWidth * lod.scale));
  const renderHeight = Math.max(1, Math.round(sHeight * lod.scale));
  const present = { renderWidth, renderHeight, scale: lod.scale };
  entry.lastPresentSize = present;
  return present;
}

/**
 * Present size used for the most recent interactive VTK draw (for matching blit).
 */
export function peekVolume3DInteractivePresentSize(
  viewportId: string
): { renderWidth: number; renderHeight: number; scale: number } | null {
  const entry = entries.get(viewportId);
  if (!entry || !isTargetFpsPolicyActive(entry)) {
    return null;
  }
  return entry.lastPresentSize ?? null;
}

/**
 * Record wall-clock present dt after ContextPool blit and steer budgetPx.
 * No-op unless Target FPS policy is active and interacting.
 */
export function recordVolume3DPresent(viewportId: string): void {
  const entry = entries.get(viewportId);
  if (!entry?.interacting || !isTargetFpsPolicyActive(entry)) {
    return;
  }

  const now = performance.now();
  if (entry.skipNextDt || !(entry.lastPresentMs > 0)) {
    entry.lastPresentMs = now;
    entry.skipNextDt = false;
    return;
  }

  const dt = now - entry.lastPresentMs;
  entry.lastPresentMs = now;
  if (!(dt > 0) || !Number.isFinite(dt)) {
    return;
  }

  entry.dragFrameCount += 1;
  entry.emaMs = updateEmaMs(entry.emaMs, dt);

  const aggressive =
    entry.aggressiveUntilMs > 0 && now < entry.aggressiveUntilMs;
  if (!aggressive && entry.aggressiveUntilMs > 0) {
    entry.aggressiveUntilMs = 0;
  }

  if (entry.budgetHoldFrames > 0 && !aggressive) {
    entry.budgetHoldFrames -= 1;
    return;
  }

  if (!entry.lastBudgetUpdateAtMs) {
    entry.lastBudgetUpdateAtMs = now;
    return;
  }
  if (now - entry.lastBudgetUpdateAtMs < BUDGET_UPDATE_INTERVAL_MS) {
    return;
  }
  entry.lastBudgetUpdateAtMs = now;

  entry.fpsBudget.targetMs = 1000 / entry.targetFps;
  const allowGrow =
    !aggressive && entry.dragFrameCount > RESUME_SHRINK_ONLY_FRAMES;
  const result = entry.fpsBudget.update(entry.emaMs, {
    allowGrow,
    aggressive,
  });

  entry.lastUpdateSettled = result.settled;

  if (result.settled) {
    entry.lastGoodBudgetPx = entry.fpsBudget.budgetPx;
    if (aggressive) {
      entry.aggressiveUntilMs = 0;
    }
  }
  if (result.bigShrink && !aggressive) {
    entry.budgetHoldFrames = BUDGET_HOLD_AFTER_SHRINK;
  }
}

/**
 * Read-only snapshot of Target FPS controller state for overlays / debugging.
 */
export function getVolume3DTargetFpsSnapshot(
  viewportId: string
): Volume3DTargetFpsSnapshot | undefined {
  const entry = entries.get(viewportId);
  if (!entry) {
    return undefined;
  }

  const targetMs = 1000 / entry.targetFps;
  const emaMs = entry.emaMs;
  const emaFps = emaMs > 0 ? 1000 / emaMs : 0;

  return {
    enabled: entry.enabled,
    policy: entry.policy,
    interacting: entry.interacting,
    phase: resolvePhase(entry),
    targetFps: entry.targetFps,
    targetMs,
    emaFps,
    emaMs,
    budgetPx: entry.fpsBudget.budgetPx,
    minPx: entry.fpsBudget.minPx,
    maxPx: entry.fpsBudget.maxPx,
    lastGoodBudgetPx: entry.lastGoodBudgetPx,
    scale: entry.lastLod.scale,
    steps: entry.lastLod.steps,
    sampleDistance: resolveSampleDistance(entry, viewportId),
    dragFrames: entry.dragFrameCount,
    budgetHoldFrames: entry.budgetHoldFrames,
  };
}

export function unregisterVolume3DTargetFps(viewportId: string): void {
  const entry = entries.get(viewportId);
  if (!entry) {
    return;
  }
  if (entry.interacting) {
    restoreBaselineSampleDistances(entry);
  }
  entries.delete(viewportId);
}
