import type { Point3 } from '../../types';
import type { VoxelSlabIterationOptions } from './iterateVoxelsInSlab';
import { iterateVoxelsInSlab } from './iterateVoxelsInSlab';

/** One voxel of an area annotation, with the value read from the volume. */
export interface VoxelSlabSample {
  /** The voxel's value. */
  value: number;
  /** The voxel centre in world coordinates. Safe to retain. */
  pointLPS: Point3;
  /** The voxel index. Safe to retain. */
  pointIJK: Point3;
}

/** Just enough of a voxel manager to read values by index. */
export interface VoxelSlabValueSource {
  getAtIJKPoint(ijk: Point3): number | undefined | null;
}

export interface VoxelSlabSamplingOptions extends VoxelSlabIterationOptions {
  /** Where the values come from. Voxels it has no value for are skipped. */
  voxelManager: VoxelSlabValueSource;
  /**
   * Called for every voxel that has a value, in iteration order. This is where
   * a statistics accumulator hooks in; it runs whether or not the samples are
   * being collected.
   */
  onSample?: (sample: VoxelSlabSample) => void;
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
 * `getShapeRuns` differs between a contour, an ellipse and a rectangle. Nothing
 * here reads a viewport, so the same annotation over the same volume samples
 * the same voxels at any zoom, pan, canvas size or slab thickness, and in any
 * orientation.
 *
 * ```ts
 * const shape = createContourShape({ volume, planePoint, normal, polyline });
 *
 * const samples = sampleVoxelsInSlab({
 *   volume,
 *   planePoint,
 *   normal,
 *   annotationThickness: shape.getRequiredThickness(),
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
export function sampleVoxelsInSlab(
  options: VoxelSlabSamplingOptions
): VoxelSlabSample[] {
  const { voxelManager, onSample, storePointData, ...iteration } = options;

  const samples: VoxelSlabSample[] = [];

  if (!voxelManager) {
    return samples;
  }

  for (const { ijk, center } of iterateVoxelsInSlab(iteration)) {
    const value = voxelManager.getAtIJKPoint(ijk);

    if (value === undefined || value === null) {
      continue;
    }

    // ijk and center are reused between iterations, so copy before retaining.
    const sample: VoxelSlabSample = {
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
