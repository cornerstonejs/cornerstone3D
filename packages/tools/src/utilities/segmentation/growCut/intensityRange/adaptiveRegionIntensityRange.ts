import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { VoxelManager } from '@cornerstonejs/core/utilities';
import type {
  FloodFillIntensityRangeOptions,
  FloodFillIntensityRangeResult,
} from '../floodFillIntensityRangeTypes';
import type { GetFloodFillIntensityRange } from '../floodFillIntensityRangeTypes';
import { getViewportVoiMappingForVolume } from '../getViewportVoiMappingForVolume';
import type { ViewportVoiMappingForTool } from '../getViewportVoiMappingForVolume';
import { DEFAULT_POSITIVE_STD_DEV_MULTIPLIER } from '../constants';

type NumberVoxelManager = VoxelManager<number>;

const {
  transformWorldToIndex,
  mapScalarToViewportVoiIntensity,
  mapViewportVoiIntensityToScalar,
  getVolumeDirectionVectors,
} = csUtils;
const { growCutLog: log } = csUtils.logger;

/**
 * Adaptive one-click region strategy ("no disk"): from a single click the
 * strategy inspects an in-plane analysis window around the pointer, snaps the
 * seed onto the most locally-contrasting pixel (so clicking on/near a region
 * edge still lands inside it), determines the region polarity (brighter or
 * darker than its surroundings), then sweeps every possible one-sided
 * intensity threshold in one pass and picks the threshold whose region stays
 * stable over the widest span before leaking into the surroundings.
 *
 * The band is **one-sided**: for a hot region it is "everything at least this
 * intense" with no upper limit, so the hottest core of a PET lesion can never
 * be excluded (no interior holes); symmetrically for dark regions. A segment
 * is only "meaningful" when its in-plane footprint falls within physical
 * (mm²) lesion-scale bounds — a whole PET body section or a speck of noise is
 * rejected, and callers surface that as a blocked cursor / no-op click.
 *
 * It is intentionally configuration-free: all constants below are internal.
 */

/** Analysis half-window (in-plane voxels) centered on the click. */
const WINDOW_RADIUS_PX = 96;
/** Seed snapping search radius (in-plane voxels) around the clicked pixel. */
const SEED_SNAP_RADIUS_PX = 4;
/** Hard floor in pixels regardless of spacing (sub-resolution specks). */
const MIN_REGION_PX = 6;
/** Smallest meaningful in-plane footprint (≈3 mm diameter). */
const MIN_REGION_MM2 = 8;
/**
 * Analyzability guard, not a size rule: a region that floods most of the
 * analysis window has no boundary we can see, so it reads as unbounded.
 * There is intentionally no physical maximum — large lesions are legitimate;
 * entity coherence is judged in 3D by the tool (shape gate), not by size.
 */
const MAX_REGION_WINDOW_FRACTION = 0.6;
/** Local contrast (display bytes) below which the vicinity is considered flat. */
const FLAT_CONTRAST_BYTES = 10;
/** Minimum threshold depth (display bytes) so the fill tolerates noise. */
const MIN_TOLERANCE_BYTES = 2;
/**
 * A region only counts as properly bounded when its growth stays quiet over at
 * least this many tolerance levels (its stability run). Areas that grow
 * substantially at every tolerance never form one and are rejected as
 * unbounded.
 */
const MIN_PLATEAU_WIDTH_BYTES = 4;
/** Per-level growth (pixels) always considered quiet (boundary trickle). */
const QUIET_GAIN_ABS_PX = 3;
/** Per-level growth below this fraction of the region is considered quiet. */
const QUIET_GAIN_FRACTION = 0.02;

export type AdaptiveRegionProbeReason =
  | 'ok'
  | 'outside-volume'
  | 'flat-region'
  | 'too-small'
  | 'unbounded'
  /** A region exists nearby but the pointer itself is not on it. */
  | 'off-target';

/**
 * Everything needed to rebuild the intensity band at a different tolerance
 * after the click — the basis for trustworthy, deterministic expand/shrink
 * (each step moves along the recorded growth curve instead of re-guessing).
 */
export type AdaptiveRegionExpandContext = {
  /** Seed reference display byte. */
  seedByte: number;
  /** +1 = region brighter than surroundings, -1 = darker. */
  polarity: 1 | -1;
  /** VOI mapping snapshot taken at click time (display-space stability). */
  voiMapping: ViewportVoiMappingForTool | null;
  /** Raw normalization fallback when no VOI mapping was available. */
  rawWindow: { min: number; span: number };
  /** Snapped seed (volume ijk). */
  seedIjk: Types.Point3;
  /** Raw scalar at the snapped seed. */
  seedScalar: number;
  /** Region growth change points: [toleranceLevel, regionSizePx]. */
  growthCurve: Array<[number, number]>;
  /** Tolerance the click ran with. */
  chosenToleranceBytes: number;
  /** Last tolerance level covered by the sweep. */
  growthEndLevel: number;
  /** mm² covered by one in-plane pixel. */
  pxAreaMm2: number;
};

export type AdaptiveRegionProbeResult = {
  /** True when a proper (bounded, non-trivial) region was found at the click. */
  viable: boolean;
  reason: AdaptiveRegionProbeReason;
  /** Intensity band + seed for the flood fill; null when not viable. */
  range: FloodFillIntensityRangeResult | null;
  /** In-plane region size (pixels) at the chosen tolerance. */
  regionSizePx?: number;
  /** In-plane region footprint (mm²) at the chosen tolerance. */
  regionAreaMm2?: number;
  /** Chosen threshold depth in display-byte units (0..255). */
  toleranceBytes?: number;
  /**
   * Present when viable: tolerance level at which each of the clicked pixel's
   * 4 in-plane neighbors ([-A, +A, -B, +B]) joined the region during the
   * sweep (-1 = never joined, null = outside the volume). Lets hover
   * consensus checks vote from this one sweep instead of re-probing each
   * neighbor with its own full window analysis.
   */
  clickNeighborJoinLevels?: Array<number | null>;
  /** Present when viable: context for deterministic expand/shrink. */
  expandContext?: AdaptiveRegionExpandContext;
  /** Growth internals for the selection stage (present on its failures). */
  debug?: {
    /** Region growth change points: [toleranceLevel, regionSizePx]. */
    growthCurve: Array<[number, number]>;
    /** Quiet runs: [startLevel, endLevel, regionSizePx]. */
    quietRuns: Array<[number, number, number]>;
    seedByte: number;
    backgroundByte: number;
    polarity: number;
    borderTouchLevel: number;
    explosionLevel: number;
    /** Tolerance level at which the clicked pixel joined the region (-1 = never). */
    clickJoinLevel: number;
    minRegionPx: number;
    maxRegionPx: number;
    pxAreaMm2: number;
  };
};

export type AdaptiveRegionCoreInput = {
  dimensions: Types.Point3;
  /** Raw scalar accessor; may return undefined/NaN for missing data. */
  getScalar: (i: number, j: number, k: number) => number;
  /** Clicked voxel (ijk, already rounded/bounded by the caller). */
  ijkClick: Types.Point3;
  /** The two in-plane axis indices (0=i, 1=j, 2=k). Defaults to [0, 1]. */
  inPlaneAxes?: [number, number];
  /** mm per pixel along the two in-plane axes. Defaults to [1, 1]. */
  inPlaneSpacing?: [number, number];
  /** Viewport VOI mapping; when absent, bytes use window-local raw min/max. */
  voiMapping?: ViewportVoiMappingForTool | null;
  /**
   * Band scale relative to the default: >1 widens (expand), <1 narrows
   * (shrink). Wired from legacy shrink/expand actions.
   */
  toleranceScale?: number;
};

function medianOf(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * One-sided raw band for a threshold depth below the seed's elevation. The
 * included side (at and beyond the seed's intensity, in display terms) is
 * unbounded so a lesion's hottest core is always inside the fill.
 */
function rawBandForTolerance(
  context: Pick<
    AdaptiveRegionExpandContext,
    'seedByte' | 'polarity' | 'voiMapping' | 'rawWindow' | 'seedScalar'
  >,
  toleranceBytes: number
): { min: number; max: number } {
  const { seedByte, polarity, voiMapping, rawWindow, seedScalar } = context;
  const thresholdByte = Math.max(
    0,
    Math.min(
      255,
      polarity > 0 ? seedByte - toleranceBytes : seedByte + toleranceBytes
    )
  );
  const includedExtremeByte = polarity > 0 ? 255 : 0;

  const rawFromByte = (byte: number): number =>
    voiMapping
      ? mapViewportVoiIntensityToScalar(byte / 255, voiMapping)
      : rawWindow.min + (byte / 255) * rawWindow.span;

  const rawThreshold = rawFromByte(thresholdByte);
  const rawExtreme = rawFromByte(includedExtremeByte);

  let min: number;
  let max: number;
  if (rawExtreme >= rawThreshold) {
    min = rawThreshold;
    max = Infinity;
  } else {
    min = -Infinity;
    max = rawThreshold;
  }
  if (Number.isFinite(seedScalar)) {
    min = Math.min(min, seedScalar);
    max = Math.max(max, seedScalar);
  }
  return { min, max };
}

/**
 * Rebuilds the flood-fill intensity range for a stored click context at a new
 * tolerance. Used by expand/shrink so each step is deterministic against the
 * click-time growth curve (and immune to later window/level changes).
 */
export function resolveAdaptiveBandAtTolerance(
  context: AdaptiveRegionExpandContext,
  toleranceBytes: number
): FloodFillIntensityRangeResult {
  const tolerance = Math.max(0, Math.min(255, Math.round(toleranceBytes)));
  const { min, max } = rawBandForTolerance(context, tolerance);
  return {
    min,
    max,
    ijkStart: [...context.seedIjk] as Types.Point3,
    diagnostics: {
      neighborhoodMean: Number.isFinite(context.seedScalar)
        ? context.seedScalar
        : 0,
      neighborhoodStdDev: 0,
      clickedVoxelValue: Number.isFinite(context.seedScalar)
        ? context.seedScalar
        : 0,
      positiveStdDevMultiplier: 1,
      neighborhoodRadius: SEED_SNAP_RADIUS_PX,
      strategy: 'adaptiveRegion:atTolerance',
      adaptive: {
        toleranceBytes: tolerance,
        regionSizePx: -1,
        backgroundByte: -1,
        seedByte: context.seedByte,
        seedSnapped: false,
        windowSize: [0, 0],
        polarity: context.polarity,
      },
    },
  };
}

/**
 * Core of the adaptive probe, operating on an abstract scalar accessor so it
 * is unit-testable without viewports or caches. See module doc for the idea.
 */
export function probeAdaptiveRegionCore(
  input: AdaptiveRegionCoreInput
): AdaptiveRegionProbeResult {
  const { dimensions, getScalar, ijkClick, voiMapping } = input;
  const inPlaneAxes = input.inPlaneAxes ?? [0, 1];
  const inPlaneSpacing = input.inPlaneSpacing ?? [1, 1];

  for (let axis = 0; axis < 3; axis++) {
    if (ijkClick[axis] < 0 || ijkClick[axis] >= dimensions[axis]) {
      return { viable: false, reason: 'outside-volume', range: null };
    }
  }

  const [axisA, axisB] = inPlaneAxes;
  const a0 = Math.max(0, ijkClick[axisA] - WINDOW_RADIUS_PX);
  const a1 = Math.min(
    dimensions[axisA] - 1,
    ijkClick[axisA] + WINDOW_RADIUS_PX
  );
  const b0 = Math.max(0, ijkClick[axisB] - WINDOW_RADIUS_PX);
  const b1 = Math.min(
    dimensions[axisB] - 1,
    ijkClick[axisB] + WINDOW_RADIUS_PX
  );
  const wA = a1 - a0 + 1;
  const wB = b1 - b0 + 1;
  const windowArea = wA * wB;

  const spacingA =
    Number.isFinite(inPlaneSpacing[0]) && inPlaneSpacing[0] > 0
      ? inPlaneSpacing[0]
      : 1;
  const spacingB =
    Number.isFinite(inPlaneSpacing[1]) && inPlaneSpacing[1] > 0
      ? inPlaneSpacing[1]
      : 1;
  const pxAreaMm2 = spacingA * spacingB;

  // Minimum is physical (specks are not lesions); maximum is only the
  // analyzability guard relative to the window.
  const minRegionPx = Math.max(
    MIN_REGION_PX,
    Math.ceil(MIN_REGION_MM2 / pxAreaMm2)
  );
  const maxRegionPx = Math.max(
    minRegionPx + 1,
    Math.floor(windowArea * MAX_REGION_WINDOW_FRACTION)
  );

  const scalarAt = (x: number, y: number): number => {
    const ijk: Types.Point3 = [...ijkClick] as Types.Point3;
    ijk[axisA] = a0 + x;
    ijk[axisB] = b0 + y;
    return Number(getScalar(ijk[0], ijk[1], ijk[2]));
  };

  // Pass 1: raw scalars (kept for the no-VOI fallback normalization).
  const rawValues = new Float64Array(windowArea);
  let rawMinInWindow = Infinity;
  let rawMaxInWindow = -Infinity;
  for (let y = 0; y < wB; y++) {
    for (let x = 0; x < wA; x++) {
      const v = scalarAt(x, y);
      rawValues[y * wA + x] = v;
      if (Number.isFinite(v)) {
        if (v < rawMinInWindow) {
          rawMinInWindow = v;
        }
        if (v > rawMaxInWindow) {
          rawMaxInWindow = v;
        }
      }
    }
  }
  if (!Number.isFinite(rawMinInWindow)) {
    return { viable: false, reason: 'outside-volume', range: null };
  }

  // Display bytes 0..255 (what the user sees); -1 marks missing samples.
  const rawSpan = rawMaxInWindow - rawMinInWindow || 1;
  const bytes = new Int16Array(windowArea);
  for (let idx = 0; idx < windowArea; idx++) {
    const v = rawValues[idx];
    if (!Number.isFinite(v)) {
      bytes[idx] = -1;
      continue;
    }
    const mapped = voiMapping
      ? mapScalarToViewportVoiIntensity(v, voiMapping)
      : (v - rawMinInWindow) / rawSpan;
    bytes[idx] = Math.max(0, Math.min(255, Math.round(mapped * 255)));
  }

  // Background estimate: median display byte on the window perimeter.
  const ringBytes: number[] = [];
  for (let x = 0; x < wA; x++) {
    if (bytes[x] >= 0) {
      ringBytes.push(bytes[x]);
    }
    const bottom = (wB - 1) * wA + x;
    if (wB > 1 && bytes[bottom] >= 0) {
      ringBytes.push(bytes[bottom]);
    }
  }
  for (let y = 1; y < wB - 1; y++) {
    const left = y * wA;
    const right = y * wA + (wA - 1);
    if (bytes[left] >= 0) {
      ringBytes.push(bytes[left]);
    }
    if (wA > 1 && bytes[right] >= 0) {
      ringBytes.push(bytes[right]);
    }
  }
  const backgroundByte = medianOf(ringBytes);

  // Seed snap: most locally-contrasting pixel near the click, so an edge
  // click lands inside the structure instead of on its partial-volume shell.
  const clickX = ijkClick[axisA] - a0;
  const clickY = ijkClick[axisB] - b0;
  let seedX = clickX;
  let seedY = clickY;
  let bestContrast = -1;
  let bestDist = Infinity;
  const snapR2 = SEED_SNAP_RADIUS_PX * SEED_SNAP_RADIUS_PX;
  for (let dy = -SEED_SNAP_RADIUS_PX; dy <= SEED_SNAP_RADIUS_PX; dy++) {
    for (let dx = -SEED_SNAP_RADIUS_PX; dx <= SEED_SNAP_RADIUS_PX; dx++) {
      if (dx * dx + dy * dy > snapR2) {
        continue;
      }
      const x = clickX + dx;
      const y = clickY + dy;
      if (x < 0 || x >= wA || y < 0 || y >= wB) {
        continue;
      }
      const byte = bytes[y * wA + x];
      if (byte < 0) {
        continue;
      }
      const contrast = Math.abs(byte - backgroundByte);
      const dist = dx * dx + dy * dy;
      if (
        contrast > bestContrast ||
        (contrast === bestContrast && dist < bestDist)
      ) {
        bestContrast = contrast;
        bestDist = dist;
        seedX = x;
        seedY = y;
      }
    }
  }

  if (bestContrast < 0) {
    return { viable: false, reason: 'outside-volume', range: null };
  }
  if (bestContrast < FLAT_CONTRAST_BYTES) {
    return { viable: false, reason: 'flat-region', range: null };
  }

  // Region polarity: brighter or darker than the surroundings. All growth is
  // then computed in "elevation" space where the structure is always high.
  const seedPixelByte = bytes[seedY * wA + seedX];
  const polarity: 1 | -1 = seedPixelByte >= backgroundByte ? 1 : -1;
  const elevation = (byte: number): number =>
    polarity > 0 ? byte : 255 - byte;

  // Reference value: median of the 3x3 neighbors on the seed's side of the
  // background (noise robustness). Restricting to same-side neighbors keeps
  // thin/tiny structures from dragging the reference onto the background.
  const seedNeighborhood: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = seedX + dx;
      const y = seedY + dy;
      if (x < 0 || x >= wA || y < 0 || y >= wB) {
        continue;
      }
      const byte = bytes[y * wA + x];
      if (
        byte >= 0 &&
        Math.abs(byte - seedPixelByte) <= Math.abs(byte - backgroundByte)
      ) {
        seedNeighborhood.push(byte);
      }
    }
  }
  const v0 = seedNeighborhood.length
    ? medianOf(seedNeighborhood)
    : seedPixelByte;
  const h0 = elevation(v0);

  // One-pass threshold sweep: a bucket-queue flood that grows the connected
  // region by descending intensity threshold. Cost is one-sided: anything at
  // or above the seed's elevation joins immediately (level 0) — a lesion's
  // hot core can never be excluded — and cooler pixels join once the
  // threshold drops to their elevation.
  const cost = (idx: number): number => {
    const byte = bytes[idx];
    if (byte < 0) {
      return -1;
    }
    return Math.max(0, h0 - elevation(byte));
  };

  const buckets: number[][] = new Array(256);
  const pushToBucket = (level: number, idx: number) => {
    let bucket = buckets[level];
    if (!bucket) {
      bucket = [];
      buckets[level] = bucket;
    }
    bucket.push(idx);
  };
  const visited = new Uint8Array(windowArea); // 0 unseen, 1 queued, 2 region
  const seedIdx = seedY * wA + seedX;
  const seedCost = cost(seedIdx);
  if (seedCost < 0) {
    return { viable: false, reason: 'flat-region', range: null };
  }
  pushToBucket(seedCost, seedIdx);
  visited[seedIdx] = 1;

  type CurvePoint = { level: number; size: number };
  const curve: CurvePoint[] = [];
  const clickIdx = clickY * wA + clickX;
  let clickJoinLevel = -1;
  // The click's 4 in-plane neighbors ([-A, +A, -B, +B]): record when each
  // joins the region, exactly like the click pixel itself. The window always
  // contains them unless clamped at the volume edge (null = not evaluable).
  const neighborOffsets: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const clickNeighborJoinLevels: Array<number | null> = [];
  const neighborWatch = new Map<number, number>();
  neighborOffsets.forEach(([dx, dy], slot) => {
    const x = clickX + dx;
    const y = clickY + dy;
    if (x < 0 || x >= wA || y < 0 || y >= wB) {
      clickNeighborJoinLevels.push(null);
      return;
    }
    clickNeighborJoinLevels.push(-1);
    neighborWatch.set(y * wA + x, slot);
  });
  let size = 0;
  let borderTouchLevel = -1;
  let explosionLevel = -1;

  outer: for (let level = 0; level < 256; level++) {
    const bucket = buckets[level];
    if (bucket?.length) {
      // Plain index loop: neighbors with cost <= level append to this bucket.
      for (let bi = 0; bi < bucket.length; bi++) {
        const idx = bucket[bi];
        if (visited[idx] === 2) {
          continue;
        }
        visited[idx] = 2;
        size++;
        if (idx === clickIdx) {
          clickJoinLevel = level;
        }
        const watchSlot = neighborWatch.get(idx);
        if (watchSlot !== undefined) {
          clickNeighborJoinLevels[watchSlot] = level;
        }

        const x = idx % wA;
        const y = Math.floor(idx / wA);
        if (
          borderTouchLevel < 0 &&
          (x === 0 || x === wA - 1 || y === 0 || y === wB - 1)
        ) {
          borderTouchLevel = level;
        }
        if (size > maxRegionPx) {
          explosionLevel = level;
          break outer;
        }

        const neighbors = [idx - 1, idx + 1, idx - wA, idx + wA];
        const canLeft = x > 0;
        const canRight = x < wA - 1;
        const canUp = y > 0;
        const canDown = y < wB - 1;
        const allowed = [canLeft, canRight, canUp, canDown];
        for (let n = 0; n < 4; n++) {
          if (!allowed[n]) {
            continue;
          }
          const nIdx = neighbors[n];
          if (visited[nIdx] !== 0) {
            continue;
          }
          const nCost = cost(nIdx);
          if (nCost < 0) {
            continue;
          }
          visited[nIdx] = 1;
          pushToBucket(Math.max(level, nCost), nIdx);
        }
      }
      bucket.length = 0;
    }
    const lastSize = curve.length ? curve[curve.length - 1].size : 0;
    if (size > lastSize) {
      curve.push({ level, size });
    }
  }

  // Threshold selection (MSER-style): find "quiet runs" — spans of tolerance
  // levels where the region grows at most a trickle (a few boundary pixels per
  // level). A proper region shows a wide quiet run between filling itself and
  // leaking into the surroundings; uniform organs and background gradients
  // grow substantially at every level and never form one. The threshold is
  // placed mid-run so the 3D fill is robust to slice-to-slice drift.
  const growthEndLevel = explosionLevel >= 0 ? explosionLevel - 1 : 255;
  type QuietRun = {
    startLevel: number;
    endLevel: number;
    width: number;
    size: number;
  };
  const runs: QuietRun[] = [];
  {
    let runStart = -1;
    let currentSize = 0;
    let ci = 0;
    const closeRun = (endLevel: number, sizeAtEnd: number) => {
      if (runStart >= 0 && endLevel >= runStart) {
        runs.push({
          startLevel: runStart,
          endLevel,
          width: endLevel - runStart,
          size: sizeAtEnd,
        });
      }
      runStart = -1;
    };
    for (let level = 0; level <= growthEndLevel; level++) {
      const sizeBefore = currentSize;
      let gain = 0;
      if (ci < curve.length && curve[ci].level === level) {
        gain = curve[ci].size - currentSize;
        currentSize = curve[ci].size;
        ci++;
      }
      const quietThreshold = Math.max(
        QUIET_GAIN_ABS_PX,
        Math.floor(sizeBefore * QUIET_GAIN_FRACTION)
      );
      if (currentSize > 0 && gain <= quietThreshold) {
        if (runStart < 0) {
          runStart = level;
        }
      } else {
        // The gain that ends a run is the leak; record the pre-leak size.
        closeRun(level - 1, sizeBefore);
      }
    }
    closeRun(growthEndLevel, currentSize);
  }

  let best: QuietRun | null = null;
  for (const run of runs) {
    const endLevel =
      borderTouchLevel >= 0
        ? Math.min(run.endLevel, borderTouchLevel - 1)
        : run.endLevel;
    if (endLevel < run.startLevel) {
      continue;
    }
    const clipped: QuietRun = {
      ...run,
      endLevel,
      width: endLevel - run.startLevel,
    };
    if (clipped.size < minRegionPx || clipped.size > maxRegionPx) {
      continue;
    }
    if (!best || clipped.width > best.width) {
      best = clipped;
    }
  }

  const selectionDebug = () => ({
    growthCurve: curve.map((p): [number, number] => [p.level, p.size]),
    quietRuns: runs.map((run): [number, number, number] => [
      run.startLevel,
      run.endLevel,
      run.size,
    ]),
    seedByte: v0,
    backgroundByte,
    polarity,
    borderTouchLevel,
    explosionLevel,
    clickJoinLevel,
    minRegionPx,
    maxRegionPx,
    pxAreaMm2,
  });

  if (!best || best.width < MIN_PLATEAU_WIDTH_BYTES) {
    // Distinguish "there was a stable region but it is tiny" from "nothing
    // ever stabilized" for diagnostics; both show as blocked to the user.
    const stableButSmall = runs.find(
      (run) =>
        run.size < minRegionPx &&
        run.width >= MIN_PLATEAU_WIDTH_BYTES &&
        (borderTouchLevel < 0 || run.startLevel < borderTouchLevel)
    );
    const failSize = best?.size ?? stableButSmall?.size ?? size;
    return {
      viable: false,
      reason: stableButSmall ? 'too-small' : 'unbounded',
      range: null,
      regionSizePx: failSize,
      regionAreaMm2: failSize * pxAreaMm2,
      debug: selectionDebug(),
    };
  }

  let toleranceBytes = best.startLevel + Math.floor(best.width / 2);
  toleranceBytes = Math.min(
    Math.max(toleranceBytes, MIN_TOLERANCE_BYTES),
    best.endLevel
  );
  const toleranceScale =
    input.toleranceScale && input.toleranceScale > 0 ? input.toleranceScale : 1;
  toleranceBytes = Math.max(
    1,
    Math.min(255, Math.round(toleranceBytes * toleranceScale))
  );
  const chosen = best;

  // The pointer must be ON the region it would segment: if the clicked pixel
  // itself is not part of the region at the chosen threshold (it only exists
  // because the seed snapped onto a nearby structure), report off-target so
  // the cursor blocks the surroundings of a lesion.
  if (clickJoinLevel < 0 || clickJoinLevel > toleranceBytes) {
    return {
      viable: false,
      reason: 'off-target',
      range: null,
      regionSizePx: chosen.size,
      regionAreaMm2: chosen.size * pxAreaMm2,
      debug: selectionDebug(),
    };
  }

  const seedIjk: Types.Point3 = [...ijkClick] as Types.Point3;
  seedIjk[axisA] = a0 + seedX;
  seedIjk[axisB] = b0 + seedY;
  const seedScalar = rawValues[seedIdx];
  const clickedScalar = rawValues[clickY * wA + clickX];

  const expandContext: AdaptiveRegionExpandContext = {
    seedByte: v0,
    polarity,
    voiMapping: voiMapping ?? null,
    rawWindow: { min: rawMinInWindow, span: rawSpan },
    seedIjk,
    seedScalar: Number.isFinite(seedScalar) ? seedScalar : 0,
    growthCurve: curve.map((p): [number, number] => [p.level, p.size]),
    chosenToleranceBytes: toleranceBytes,
    growthEndLevel,
    pxAreaMm2,
  };

  const { min: rawLo, max: rawHi } = rawBandForTolerance(
    expandContext,
    toleranceBytes
  );

  return {
    viable: true,
    reason: 'ok',
    regionSizePx: chosen.size,
    regionAreaMm2: chosen.size * pxAreaMm2,
    toleranceBytes,
    clickNeighborJoinLevels,
    expandContext,
    range: {
      min: rawLo,
      max: rawHi,
      ijkStart: seedIjk,
      diagnostics: {
        neighborhoodMean: Number.isFinite(seedScalar) ? seedScalar : 0,
        neighborhoodStdDev: 0,
        clickedVoxelValue: Number.isFinite(clickedScalar) ? clickedScalar : 0,
        positiveStdDevMultiplier: toleranceScale,
        neighborhoodRadius: SEED_SNAP_RADIUS_PX,
        strategy: 'adaptiveRegion',
        adaptive: {
          toleranceBytes,
          regionSizePx: chosen.size,
          regionAreaMm2: chosen.size * pxAreaMm2,
          backgroundByte,
          seedByte: v0,
          polarity,
          seedSnapped: seedX !== clickX || seedY !== clickY,
          windowSize: [wA, wB],
          growthCurve: curve.map((p): [number, number] => [p.level, p.size]),
          explosionLevel,
          borderTouchLevel,
        },
      },
    },
  };
}

/**
 * The two volume axes lying in the viewed plane (from the viewport camera for
 * orthogonal views), defaulting to the acquisition plane [0, 1].
 */
export function resolveInPlaneAxes(
  referencedVolume: Types.IImageVolume,
  viewport: Types.IViewport | undefined
): [number, number] {
  if (!viewport) {
    return [0, 1];
  }
  try {
    const camera = viewport.getCamera();
    const { ijkVecSliceDir } = getVolumeDirectionVectors(
      referencedVolume.imageData,
      camera
    );
    const abs = ijkVecSliceDir.map(Math.abs);
    let sliceAxis = 0;
    if (abs[1] >= abs[0] && abs[1] >= abs[2]) {
      sliceAxis = 1;
    } else if (abs[2] >= abs[0] && abs[2] >= abs[1]) {
      sliceAxis = 2;
    }
    const axes = [0, 1, 2].filter((axis) => axis !== sliceAxis);
    return [axes[0], axes[1]];
  } catch {
    return [0, 1];
  }
}

/**
 * Probes whether a one-click segmentation at `worldPosition` would produce a
 * meaningful region, and if so returns the flood-fill intensity band plus the
 * context for deterministic expand/shrink. Cheap enough to run on hover
 * (single in-plane window, one pass).
 */
export function probeAdaptiveRegion(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: FloodFillIntensityRangeOptions
): AdaptiveRegionProbeResult {
  const { dimensions, imageData, spacing } = referencedVolume;
  const voxelManager =
    referencedVolume.voxelManager as unknown as NumberVoxelManager;
  const [width, height] = dimensions;
  const pixelsPerSlice = width * height;

  const ijkClick = transformWorldToIndex(imageData, worldPosition).map(
    Math.round
  ) as Types.Point3;

  const voiMapping =
    options?.voiMapping ??
    (options?.viewport && options?.referencedVolumeId
      ? getViewportVoiMappingForVolume(
          options.viewport,
          options.referencedVolumeId
        )
      : null);

  const toleranceScale = options?.positiveStdDevMultiplier
    ? options.positiveStdDevMultiplier / DEFAULT_POSITIVE_STD_DEV_MULTIPLIER
    : 1;

  const inPlaneAxes = resolveInPlaneAxes(referencedVolume, options?.viewport);
  const inPlaneSpacing: [number, number] = [
    spacing?.[inPlaneAxes[0]] ?? 1,
    spacing?.[inPlaneAxes[1]] ?? 1,
  ];

  const result = probeAdaptiveRegionCore({
    dimensions,
    getScalar: (i, j, k) =>
      Number(voxelManager.getAtIndex(k * pixelsPerSlice + j * width + i)),
    ijkClick,
    inPlaneAxes,
    inPlaneSpacing,
    voiMapping,
    toleranceScale,
  });

  log.debug('adaptiveRegion probe', {
    ijkClick,
    viable: result.viable,
    reason: result.reason,
    regionSizePx: result.regionSizePx,
    regionAreaMm2: result.regionAreaMm2,
    toleranceBytes: result.toleranceBytes,
    band: result.range
      ? { min: result.range.min, max: result.range.max }
      : null,
  });

  return result;
}

/**
 * `GetFloodFillIntensityRange`-compatible wrapper around
 * {@link probeAdaptiveRegion}: returns the band when a meaningful region
 * exists at the click, otherwise null (surfaced by tools as "cannot segment
 * here").
 */
export const getAdaptiveRegionIntensityRange: GetFloodFillIntensityRange = (
  referencedVolume,
  worldPosition,
  options
) => {
  const probe = probeAdaptiveRegion(referencedVolume, worldPosition, options);
  if (!probe.viable) {
    log.info('adaptiveRegion: no proper region at click', {
      reason: probe.reason,
      regionSizePx: probe.regionSizePx,
      regionAreaMm2: probe.regionAreaMm2,
      debug: probe.debug,
    });
    return null;
  }
  return probe.range;
};
