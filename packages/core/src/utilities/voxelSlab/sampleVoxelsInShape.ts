import type { Point3 } from '../../types';
import type { VoxelsInShapeOptions } from './iterateVoxelsInShape';
import { iterateVoxelsInShape } from './iterateVoxelsInShape';

/** One voxel of an area annotation, with the value read from the volume. */
export interface VoxelSample {
  /** The voxel's value. */
  value: number;
  /** The voxel centre in world coordinates. Safe to retain. */
  pointLPS: Point3;
  /** The voxel index. Safe to retain. */
  pointIJK: Point3;
}

/** Just enough of a voxel manager to read values by index. */
export interface VoxelValueSource {
  getAtIJKPoint(ijk: Point3): number | undefined | null;
}

export interface VoxelsInShapeSamplingOptions extends VoxelsInShapeOptions {
  /** Where the values come from. Voxels it has no value for are skipped. */
  voxelManager: VoxelValueSource;
  /**
   * Called for every voxel that has a value, in iteration order. This is where
   * a statistics accumulator hooks in; it runs whether or not the samples are
   * being collected.
   */
  onSample?: (sample: VoxelSample) => void;
  /**
   * Whether to return the samples as well. Collecting them costs an object per
   * voxel, which an ROI over a large volume will feel, so a caller that only
   * wants statistics should leave this off and use `onSample`.
   */
  storePointData?: boolean;
}

/**
 * Reads the value of every voxel an area annotation contains, per Rule M of
 * https://github.com/cornerstonejs/cornerstone3D/issues/2889
 *
 * This is the whole of the accumulation half of a measurement, and it is
 * identical for every area annotation: only the shape handed in as
 * `getShapeRuns` differs between a polyline, an ellipse and a rectangle. Nothing
 * here reads a viewport, so the same annotation over the same volume samples
 * the same voxels at any zoom, pan, canvas size or slab thickness, and in any
 * orientation.
 *
 * The caller resolves the thickness, as the example below does. A planar shape
 * reports a required thickness of 0, so the `||` keeps the annotation's own
 * thickness. A shape that carries depth of its own, such as an ellipsoid,
 * reports that depth and the `||` takes it instead. The `bounds` the caller
 * passes must allow for the same value.
 *
 * ```ts
 * const shape = createPolylineShape({ volume, viewPlaneNormal, polyline });
 *
 * const samples = sampleVoxelsInShape({
 *   volume,
 *   planePoint,
 *   viewPlaneNormal,
 *   referencePlaneThickness:
 *     shape.getRequiredThickness() || referencePlaneThickness,
 *   getShapeRuns: shape.getRuns,
 *   voxelManager,
 *   onSample: statsCallback,
 *   storePointData,
 * });
 * ```
 *
 * @returns the samples when `storePointData` is set, otherwise an empty array.
 * `onSample` is called either way.
 */
export function sampleVoxelsInShape(
  options: VoxelsInShapeSamplingOptions
): VoxelSample[] {
  const { voxelManager, onSample, storePointData, ...iteration } = options;

  const samples: VoxelSample[] = [];

  if (!voxelManager) {
    return samples;
  }

  for (const { ijk, center } of iterateVoxelsInShape(iteration)) {
    const value = voxelManager.getAtIJKPoint(ijk);

    if (value === undefined || value === null) {
      continue;
    }

    // ijk and center are reused between iterations, so copy before retaining.
    const sample: VoxelSample = {
      value,
      pointLPS: [center[0], center[1], center[2]],
      pointIJK: [ijk[0], ijk[1], ijk[2]],
    };

    onSample?.(sample);

    if (storePointData) {
      samples.push(sample);
    }
  }

  return samples;
}
