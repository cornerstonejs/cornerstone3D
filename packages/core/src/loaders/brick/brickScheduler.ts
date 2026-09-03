import type { Point3 } from '../../types';
import { brickKey } from './brickAddressing';
import type { BrickCoord, ResolvedBrickLevel } from './types';

/** A displayed plane, already converted into the level's index space. */
export interface IndexPlane {
  normalIJK: Point3;
  pointIJK: Point3;
}

export interface BrickPriorityContext {
  /**
   * Levels by name.
   *
   * The queue holds bricks from several levels at once but scores them against
   * one set of planes, so it needs each brick's own brick size and downsample
   * factors to express its centre and extent in the same units. Neither is a
   * property of the queue any more: a coarse level small enough to be one
   * request has a brick shaped like the level, not a cube.
   */
  levels: Map<string, ResolvedBrickLevel>;
  /** Planes currently on screen. An empty list leaves order unchanged. */
  planes: IndexPlane[];
}

interface ScoredBrick {
  coord: BrickCoord;
  /**
   * Coarser levels sort first, whatever else is queued. Without this a second
   * panel coming on screen mid-refine would interleave its `d1` bricks with the
   * `d4` bricks already in flight, and the image would sharpen in patches
   * instead of as a whole.
   */
  rank: number;
  /** 0 when the brick is cut by a plane, else voxels to the nearest plane. */
  distance: number;
  /** Distance from the focal point, used to break ties within a slab. */
  focal: number;
  /** Original position, to keep the sort stable. */
  order: number;
}

/**
 * Sort rank for a level: coarser first.
 *
 * The coarsest level sorts first, so the ladder is always climbed in order
 * regardless of which viewport queued what. Ranked by voxel count rather than by
 * a downsample factor because per-axis factors give no single number to compare,
 * and size is what "coarser" means here.
 */
export function levelRank(level: ResolvedBrickLevel | undefined): number {
  return level?.voxelCount ?? 0;
}

/**
 * A brick's centre in full-resolution index space.
 *
 * Both the brick size and the downsample factors are per-axis, so this scales
 * each axis independently — a `d8_8_2` brick covers eight base voxels per level
 * voxel in-plane but only two through-plane, and treating that as one number
 * puts the brick in the wrong place on anisotropic data.
 */
function brickCentre(coord: BrickCoord, level: ResolvedBrickLevel): Point3 {
  const { brickSize, factors } = level;
  const k = [coord.kx, coord.ky, coord.kz];

  // Voxel centres sit on integer indices, matching `bricksForPlane`.
  return [0, 1, 2].map(
    (axis) =>
      (k[axis] * brickSize[axis] + (brickSize[axis] - 1) / 2) * factors[axis]
  ) as Point3;
}

/**
 * A brick's half-extent along each axis in full-resolution index space.
 *
 * This has to be scaled by the factors for the same reason the centre does.
 * Leaving it unscaled understates a coarse brick's size by its factor, so a
 * plane that cuts a `d8` brick well inside it scores as several voxels away and
 * the brick loses priority to bricks the plane misses.
 */
function brickHalfExtent(level: ResolvedBrickLevel): Point3 {
  const { brickSize, factors } = level;
  return [0, 1, 2].map(
    (axis) => (brickSize[axis] * factors[axis]) / 2
  ) as Point3;
}

function normalise(v: Point3): Point3 | undefined {
  const length = Math.hypot(v[0], v[1], v[2]);

  if (!Number.isFinite(length) || length === 0) {
    return undefined;
  }

  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * How far a brick is from being displayed by any of the given planes.
 *
 * Bricks the plane cuts score 0. Everything else scores the voxel distance from
 * the brick's surface to the nearest plane, so a refinement pass naturally
 * spreads outward from what is on screen.
 */
export function scoreBrick(
  coord: BrickCoord,
  context: BrickPriorityContext
): { distance: number; focal: number } {
  const { levels, planes } = context;
  const level = levels.get(coord.level);

  if (!planes.length || !level) {
    return { distance: 0, focal: 0 };
  }

  const centre = brickCentre(coord, level);
  const half = brickHalfExtent(level);
  let bestDistance = Infinity;
  let bestFocal = Infinity;

  for (const plane of planes) {
    const n = normalise(plane.normalIJK);

    if (!n) {
      continue;
    }

    const radius =
      Math.abs(n[0]) * half[0] +
      Math.abs(n[1]) * half[1] +
      Math.abs(n[2]) * half[2];

    const signed =
      n[0] * (centre[0] - plane.pointIJK[0]) +
      n[1] * (centre[1] - plane.pointIJK[1]) +
      n[2] * (centre[2] - plane.pointIJK[2]);

    const distance = Math.max(0, Math.abs(signed) - radius);

    const focal = Math.hypot(
      centre[0] - plane.pointIJK[0],
      centre[1] - plane.pointIJK[1],
      centre[2] - plane.pointIJK[2]
    );

    if (
      distance < bestDistance ||
      (distance === bestDistance && focal < bestFocal)
    ) {
      bestDistance = distance;
      bestFocal = focal;
    }
  }

  return {
    distance: bestDistance === Infinity ? 0 : bestDistance,
    focal: bestFocal === Infinity ? 0 : bestFocal,
  };
}

/**
 * Orders outstanding bricks so the currently displayed planes resolve first.
 *
 * Ordering only — the same bricks are fetched either way, just sooner or later.
 * Within a slab, bricks nearer the focal point come first so the middle of the
 * view sharpens before its corners.
 *
 * @param outstanding - Bricks still to fetch.
 * @param context - Level geometry and the planes currently on screen.
 * @returns A new array; the input is not mutated.
 */
export function prioritiseBricks(
  outstanding: BrickCoord[],
  context: BrickPriorityContext
): BrickCoord[] {
  const scored: ScoredBrick[] = outstanding.map((coord, order) => {
    const { distance, focal } = scoreBrick(coord, context);
    const rank = levelRank(context.levels.get(coord.level));
    return { coord, rank, distance, focal, order };
  });

  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.distance - b.distance ||
      a.focal - b.focal ||
      a.order - b.order
  );

  return scored.map((entry) => entry.coord);
}

/**
 * Outstanding-brick queue that can be re-ordered as the camera moves.
 *
 * Deliberately independent of viewports and rendering so it can be driven
 * directly in tests; the loader converts cameras into {@link IndexPlane}s and
 * feeds them in.
 */
export class BrickQueue {
  private readonly pending = new Map<string, BrickCoord>();
  private ordered: BrickCoord[] = [];
  private dirty = false;
  private context: BrickPriorityContext;

  constructor(
    levels: Map<string, ResolvedBrickLevel>,
    planes: IndexPlane[] = []
  ) {
    this.context = { levels, planes };
  }

  /** Number of bricks still to fetch. */
  get size(): number {
    return this.pending.size;
  }

  has(coord: BrickCoord): boolean {
    return this.pending.has(brickKey(coord));
  }

  /** Adds bricks, ignoring any already queued. */
  add(coords: BrickCoord[]): void {
    for (const coord of coords) {
      const key = brickKey(coord);
      if (!this.pending.has(key)) {
        this.pending.set(key, coord);
        this.dirty = true;
      }
    }
  }

  /** Removes a brick, whether it succeeded or was abandoned. */
  complete(coord: BrickCoord): void {
    if (this.pending.delete(brickKey(coord))) {
      this.dirty = true;
    }
  }

  /**
   * Replaces the displayed planes and re-orders what is left.
   *
   * Cheap enough to call on every camera change: it is a sort of the
   * outstanding set, with no fetching or allocation beyond the ordering.
   */
  setPlanes(planes: IndexPlane[]): void {
    this.context = { ...this.context, planes };
    this.dirty = true;
  }

  /** Takes up to `count` bricks in priority order. */
  take(count: number): BrickCoord[] {
    if (this.dirty) {
      this.ordered = prioritiseBricks([...this.pending.values()], this.context);
      this.dirty = false;
    }

    const taken = this.ordered.splice(0, count);

    for (const coord of taken) {
      this.pending.delete(brickKey(coord));
    }

    return taken;
  }

  /** Drops everything, e.g. when loading is cancelled. */
  clear(): void {
    this.pending.clear();
    this.ordered = [];
    this.dirty = false;
  }
}
