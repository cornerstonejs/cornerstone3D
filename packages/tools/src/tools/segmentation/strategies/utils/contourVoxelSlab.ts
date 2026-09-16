/**
 * The contour to labelmap fill, over the shared voxel slab iterator.
 *
 * `LabelmapBaseTool` converts a closed contour annotation to labelmap voxels,
 * and that conversion is a fill. It therefore uses the same iterator, the same
 * shapes and the same index bounds as the brush fills in `brushVoxelSlab.ts`
 * and the area annotation tools in `utilities/sampleAreaAnnotationVoxels.ts`.
 *
 * The rules are documented in
 * `docs/docs/concepts/cornerstone-tools/segmentation/planar-fill-iteration.md`
 * and `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 */
import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { getShapeIndexBounds } from '../../../../utilities/sampleAreaAnnotationVoxels';

const {
  createPolylineShape,
  getSlabHalfWidth,
  getVoxelThicknessAlongNormal,
  iterateVoxelsInShape,
} = csUtils.voxelSlab;

/**
 * A contour to labelmap conversion is a fill, so it follows Rule F and not
 * Rule M: it writes the voxels whose centre the contour's own slab holds.
 *
 * Rule M widens the slab by half a voxel on each side, because a measurement
 * must not under-count. A fill must not do that. A contour that falls midway
 * between two voxel layers would write both layers, and two contours on
 * neighbouring frames would each write the layer between them, which records
 * two undo entries for that layer.
 *
 * See `getFillHalfWidth` in core, and the brush fills in `brushVoxelSlab.ts`,
 * which take the same coverage for the same reason.
 */
export const CONTOUR_FILL_COVERAGE = 'centerInside' as const;

/** The volume geometry the iterator reads, as a labelmap's image data gives it. */
export type ContourFillVolume = {
  dimensions: Types.Point3;
  direction: Types.Mat3;
  spacing: Types.Point3;
  origin: Types.Point3;
};

export interface ContourFillOptions {
  /** The labelmap geometry. The contour and the labelmap share every index. */
  volume: ContourFillVolume;
  /** The closed contour, in world coordinates. */
  polyline: Types.Point3[];
  /** The unit normal of the contour's own plane, never the camera's. */
  viewPlaneNormal: Types.Point3;
  /** The labelmap's image data, for `worldToIndex`. */
  imageData;
}

/**
 * Yields the index of every voxel that a contour fills.
 *
 * The contour is the shape, through `createPolylineShape`, which is flat and
 * reports no thickness of its own. The fill therefore takes a depth of one
 * voxel along the contour's own normal, and the coverage
 * {@link CONTOUR_FILL_COVERAGE}. A thin oblique contour writes the single frame
 * that the view shows, the walk never visits a voxel off that frame, and
 * contours on consecutive frames tile the volume.
 *
 * Nothing here reads a viewport, so the same contour over the same volume fills
 * the same voxels at any zoom, any pan, any canvas size and any slab thickness,
 * and at any orientation.
 *
 * **The yielded index is a single buffer, and every step writes over it.**
 * `iterateVoxelsInShape` reuses it so that a fill allocates nothing per voxel,
 * and this function passes that buffer through. Read the three values inside
 * the loop body, as the caller in `LabelmapBaseTool.ts` does. A caller that
 * keeps the index past one step must copy it first.
 *
 * @returns nothing when the contour has fewer than three points, which
 * describes no area.
 */
export function* iterateContourFillVoxels({
  volume,
  polyline,
  viewPlaneNormal,
  imageData,
}: ContourFillOptions): Generator<Types.Point3> {
  if (!(polyline?.length >= 3)) {
    return;
  }

  const planePoint = polyline[0];
  const voxelThickness = getVoxelThicknessAlongNormal(volume, viewPlaneNormal);
  const shape = createPolylineShape({
    volume,
    planePoint,
    viewPlaneNormal,
    polyline,
  });

  for (const { ijk } of iterateVoxelsInShape({
    volume,
    planePoint,
    viewPlaneNormal,
    depthCoverage: CONTOUR_FILL_COVERAGE,
    bounds: getShapeIndexBounds(
      polyline,
      volume,
      imageData,
      viewPlaneNormal,
      getSlabHalfWidth(voxelThickness, voxelThickness, CONTOUR_FILL_COVERAGE)
    ),
    getShapeRuns: shape.getRuns,
  })) {
    yield ijk;
  }
}
