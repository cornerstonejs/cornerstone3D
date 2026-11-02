import type { Point2 } from '../../../types';
import type { Point3 } from '../../../types';
import type { IndexSpaceSlab } from '../indexSpaceSlab';
import type { VoxelSlabShape } from './shapeGeometry';

/**
 * The union of several plane-anchored shapes, as one shape.
 *
 * A brush that the user drags paints the union of one disc per sample along the
 * stroke, and a single shape cannot describe that. Every member must share the
 * annotation plane and the normal that the iterator is built with, because the
 * runs of all members are emitted along one column axis.
 *
 * The runs stay exact. Each member's runs are merged into a disjoint, ascending
 * sequence, so `iterateVoxelsInShape` visits a voxel that two members share
 * exactly once - which matters, because a fill that writes a voxel twice
 * records two undo entries for it.
 *
 * Cost is proportional to the number of members per row, not per voxel. A
 * per-voxel `containsPoint` over the same members costs the member count for
 * every voxel of the bounding box instead.
 *
 * See `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 *
 * @param shapes - The members. An empty list gives a shape that contains
 *   nothing, which lets a caller build a union without a special case for a
 *   stroke that recorded no points.
 */
export function createUnionShape(shapes: VoxelSlabShape[]): VoxelSlabShape {
  // One member is its own union, and the merge below would only add a layer of
  // generators to every row.
  if (shapes.length === 1) {
    return shapes[0];
  }

  function containsPoint(point: Point3): boolean {
    return shapes.some((shape) => shape.containsPoint(point));
  }

  function* getRuns(
    outerIndex: number,
    rowIndex: number,
    depthRun: Point2,
    slab: IndexSpaceSlab
  ): Generator<Point2, void, undefined> {
    const runs: Point2[] = [];

    for (const shape of shapes) {
      for (const run of shape.getRuns(outerIndex, rowIndex, depthRun, slab)) {
        // The member reuses no run array in any shape here, but copy anyway:
        // the merge below holds every run until the row is complete, and a
        // future member that reuses one would corrupt the whole row.
        runs.push([run[0], run[1]]);
      }
    }

    if (!runs.length) {
      return;
    }

    runs.sort((a, b) => a[0] - b[0]);

    let [low, high] = runs[0];

    for (let index = 1; index < runs.length; index++) {
      const [nextLow, nextHigh] = runs[index];

      // `high + 1` merges runs that only touch, so two discs that meet at a
      // voxel boundary yield one run rather than two.
      if (nextLow <= high + 1) {
        high = Math.max(high, nextHigh);
        continue;
      }

      yield [low, high];
      low = nextLow;
      high = nextHigh;
    }

    yield [low, high];
  }

  return {
    containsPoint,
    getRuns,
    // The slab must hold every member, so the deepest one sets the thickness.
    // A union of planar shapes reports 0, and the caller's own thickness stands.
    getRequiredThickness: () =>
      shapes.reduce((deepest, shape) => {
        const required = shape.getRequiredThickness();
        return required > deepest ? required : deepest;
      }, 0),
  };
}
