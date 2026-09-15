import type { Point3 } from '../../types';
import type {
  BrickAxis,
  BrickLevelSpec,
  BrickManifest,
  BrickOrder,
  ResolvedBrickLevel,
  ResolvedBrickManifest,
} from './types';

const BRICK_ORDERS: BrickOrder[] = ['z-minor', 'plane-major'];
const DEFAULT_BRICK_ORDER: BrickOrder = 'z-minor';

/**
 * Per-axis downsample factors from a level name.
 *
 * `d8` is eight times coarser on every axis; `d8_8_2` is eight in-plane and two
 * through-plane, which is what a series with 5mm slices against 1mm pixels
 * produces once the pyramid is built from physical spacing rather than from a
 * single factor.
 *
 * @param levelName - The level's name
 * @returns `[fx, fy, fz]`
 */
export function levelFactors(levelName: string): Point3 {
  const uniform = /^d(\d+)$/.exec(levelName);

  if (uniform) {
    const factor = Number(uniform[1]);
    if (Number.isInteger(factor) && factor >= 1) {
      return [factor, factor, factor];
    }
  }

  const perAxis = /^d(\d+)_(\d+)_(\d+)$/.exec(levelName);

  if (perAxis) {
    const factors = [1, 2, 3].map((group) => Number(perAxis[group]));
    if (factors.every((factor) => Number.isInteger(factor) && factor >= 1)) {
      return factors as Point3;
    }
  }

  throw new Error(
    `[brick] Level name must be "d<factor>" or "d<fx>_<fy>_<fz>", got "${levelName}"`
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function assertTriple(value: unknown, what: string): Point3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(isPositiveInteger)
  ) {
    throw new Error(
      `[brick] ${what} must be three positive integers, got ${JSON.stringify(
        value
      )}`
    );
  }

  return [value[0], value[1], value[2]] as Point3;
}

function validateAxes(axes: unknown): {
  spatialAxes: [BrickAxis, BrickAxis, BrickAxis];
  indexedAxes: BrickAxis[];
} {
  if (!Array.isArray(axes) || axes.length === 0) {
    throw new Error('[brick] manifest.axes must be a non-empty array');
  }

  const spatial: BrickAxis[] = [];
  const indexed: BrickAxis[] = [];

  for (const axis of axes as BrickAxis[]) {
    if (!axis || typeof axis.name !== 'string') {
      throw new Error('[brick] Each axis requires a name');
    }
    if (!isPositiveInteger(axis.size)) {
      throw new Error(
        `[brick] Axis "${axis.name}" size must be a positive integer`
      );
    }
    (axis.type === 'space' ? spatial : indexed).push(axis);
  }

  if (spatial.length !== 3) {
    throw new Error(
      `[brick] Expected exactly 3 spatial axes, found ${spatial.length}. ` +
        'A series whose third index is temporal has no off-axis plane to ' +
        'serve and should not have a brick store.'
    );
  }

  return {
    spatialAxes: [spatial[0], spatial[1], spatial[2]],
    indexedAxes: indexed,
  };
}

/**
 * Spatial extent at given per-axis downsample factors.
 *
 * Uses `ceil` so a partial trailing voxel is kept rather than dropped, matching
 * a box-filtered reduction that averages whatever falls in the final cell.
 *
 * This is only an approximation of what the generator did when a factor is not a
 * power of two divisor of the extent, because repeated halving rounds up at every
 * step: 301 halved three times is 38, but 301/8 rounded up is 38 as well only by
 * luck. The generator therefore writes `size` explicitly and this is the
 * fallback for a manifest that omits it.
 */
export function dimensionsAtFactors(base: Point3, factors: Point3): Point3 {
  return [
    Math.max(1, Math.ceil(base[0] / factors[0])),
    Math.max(1, Math.ceil(base[1] / factors[1])),
    Math.max(1, Math.ceil(base[2] / factors[2])),
  ];
}

/** Number of bricks needed to cover `dimensions` at `brickSize`. */
export function brickGridFor(dimensions: Point3, brickSize: Point3): Point3 {
  return [
    Math.ceil(dimensions[0] / brickSize[0]),
    Math.ceil(dimensions[1] / brickSize[1]),
    Math.ceil(dimensions[2] / brickSize[2]),
  ];
}

function resolveLevel(
  spec: BrickLevelSpec | string,
  baseDimensions: Point3,
  defaultBrickSize: Point3
): ResolvedBrickLevel {
  const levelSpec: BrickLevelSpec =
    typeof spec === 'string' ? { name: spec } : spec;

  if (!levelSpec || typeof levelSpec.name !== 'string') {
    throw new Error('[brick] Each level requires a name');
  }

  const factors = levelSpec.factors
    ? assertTriple(levelSpec.factors, `Level "${levelSpec.name}" factors`)
    : levelFactors(levelSpec.name);

  // `size`, `brickSize` and `bricks` are optional: the generator writes them, but
  // they are derivable, so a bare ["d1","d2"] list is accepted too.
  const dimensions = levelSpec.size
    ? assertTriple(levelSpec.size, `Level "${levelSpec.name}" size`)
    : dimensionsAtFactors(baseDimensions, factors);

  // A level small enough to be one request is stored as a single brick shaped
  // like the level, so its brick is not the default cube.
  const brickSize = levelSpec.brickSize
    ? assertTriple(levelSpec.brickSize, `Level "${levelSpec.name}" brickSize`)
    : defaultBrickSize;

  const derivedGrid = brickGridFor(dimensions, brickSize);
  const brickGrid = levelSpec.bricks
    ? assertTriple(levelSpec.bricks, `Level "${levelSpec.name}" bricks`)
    : derivedGrid;

  if (
    levelSpec.bricks &&
    (brickGrid[0] !== derivedGrid[0] ||
      brickGrid[1] !== derivedGrid[1] ||
      brickGrid[2] !== derivedGrid[2])
  ) {
    throw new Error(
      `[brick] Level "${levelSpec.name}" declares brick grid ` +
        `${JSON.stringify(brickGrid)} but its size and brickSize imply ` +
        `${JSON.stringify(derivedGrid)}`
    );
  }

  return {
    name: levelSpec.name,
    factors,
    dimensions,
    brickSize,
    brickGrid,
    brickCount: brickGrid[0] * brickGrid[1] * brickGrid[2],
    voxelCount: dimensions[0] * dimensions[1] * dimensions[2],
  };
}

/**
 * Validates a `manifest.json` and derives everything a loader needs from it.
 *
 * Levels come back sorted **coarsest first**, so walking the array is the same
 * as walking from a fast first image toward full resolution.
 *
 * @param raw - Parsed manifest JSON.
 * @returns The manifest with per-level geometry resolved.
 */
export function parseBrickManifest(raw: BrickManifest): ResolvedBrickManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[brick] manifest must be an object');
  }

  const { spatialAxes, indexedAxes } = validateAxes(raw.axes);
  const brickSize = assertTriple(raw.brickSize, 'manifest.brickSize');

  const brickOrder = raw.brickOrder ?? DEFAULT_BRICK_ORDER;
  if (!BRICK_ORDERS.includes(brickOrder)) {
    throw new Error(
      `[brick] Unknown brickOrder "${brickOrder}", expected one of ` +
        BRICK_ORDERS.join(', ')
    );
  }

  if (typeof raw.transferSyntaxUID !== 'string' || !raw.transferSyntaxUID) {
    throw new Error('[brick] manifest.transferSyntaxUID is required');
  }

  if (!Array.isArray(raw.levels) || raw.levels.length === 0) {
    throw new Error('[brick] manifest.levels must be a non-empty array');
  }

  const baseDimensions: Point3 = [
    spatialAxes[0].size,
    spatialAxes[1].size,
    spatialAxes[2].size,
  ];

  // Coarsest first, by voxel count rather than by a downsample factor: with
  // per-axis factors there is no single number to sort on, and size is what
  // "coarser" actually means for fetch order.
  const levels = raw.levels
    .map((spec) => resolveLevel(spec, baseDimensions, brickSize))
    .sort((a, b) => a.voxelCount - b.voxelCount);

  const levelsByName = new Map<string, ResolvedBrickLevel>();
  for (const level of levels) {
    if (levelsByName.has(level.name)) {
      throw new Error(`[brick] Duplicate level "${level.name}"`);
    }
    levelsByName.set(level.name, level);
  }

  const baseLevel = levels.find((level) =>
    level.factors.every((factor) => factor === 1)
  );

  if (!baseLevel) {
    throw new Error(
      '[brick] Manifest has no full-resolution level (none with factors [1,1,1]); ' +
        `levels are ${levels.map((level) => level.name).join(', ')}`
    );
  }

  return {
    raw,
    brickSize,
    brickOrder,
    // Version 2 stores every brick at its true extent. Older stores padded edge
    // bricks out to the full brick size, so absent the flag, assume padding.
    brickPadding: raw.brickPadding ?? true,
    transferSyntaxUID: raw.transferSyntaxUID,
    spatialAxes,
    indexedAxes,
    baseDimensions,
    levels,
    levelsByName,
    baseLevel,
  };
}

/**
 * Picks the coarsest level whose extent is at least `minVoxelsPerAxis`, so the
 * opening fetch is small but not so small it is useless.
 *
 * @param manifest - Resolved manifest.
 * @param minVoxelsPerAxis - Lower bound on the smallest spatial dimension.
 * @returns The chosen level, or the finest available when none qualifies.
 */
export function pickCoarseLevel(
  manifest: ResolvedBrickManifest,
  minVoxelsPerAxis = 32
): ResolvedBrickLevel {
  const suitable = manifest.levels.find((level) =>
    level.dimensions.every((size) => size >= minVoxelsPerAxis)
  );

  return suitable ?? manifest.levels[manifest.levels.length - 1];
}
