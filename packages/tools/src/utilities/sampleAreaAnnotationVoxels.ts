import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { getBoundingBoxAroundShapeIJK } from './boundingBox';

const {
  createPolylineShape,
  getMembershipHalfWidth,
  getVoxelThicknessAlongNormal,
  resolveReferencePlaneThickness,
  sampleVoxelsInShape,
} = csUtils.voxelSlab;

/** The volume geometry that the voxel iterator reads. */
export type AreaAnnotationVolume = {
  dimensions: Types.Point3;
  direction: Types.Mat3;
  spacing: Types.Point3;
  origin: Types.Point3;
};

/**
 * A plane-anchored shape, as every `csUtils.voxelSlab` shape factory returns
 * one. Taken from `createPolylineShape` because the shape type is internal to
 * core; all of the factories return the same shape.
 */
export type AreaAnnotationShape = ReturnType<typeof createPolylineShape>;

/** One voxel of an area annotation, with its value. */
export type AreaAnnotationVoxel = {
  value: number;
  pointLPS: Types.Point3;
  pointIJK: Types.Point3;
};

export interface AreaAnnotationVoxelsOptions {
  /**
   * The annotation. The function reads `metadata.viewPlaneNormal` and
   * `metadata.planeRestriction.referencePlaneThickness`, and nothing else.
   */
  annotation: {
    metadata?: {
      viewPlaneNormal?: Types.Point3;
      planeRestriction?: { referencePlaneThickness?: number };
    };
  };
  /**
   * The target's `IImageData`, and NOT `image.imageData`. The inner image data
   * of the CPU fallback supplies every geometry getter except `getOrigin`, so
   * the four geometry fields are read from the enclosing object, where the GPU
   * path and the CPU path both carry them as plain properties.
   */
  image: AreaAnnotationVolume & { imageData };
  /** Where the values come from. */
  voxelManager: { getAtIJKPoint(ijk: Types.Point3): number };
  /**
   * The world points that bound the shape: the outline of a polyline, the four
   * corners of a rectangle, the cardinal handles of a circle. The index bounds
   * come from these points, and `points[0]` anchors the plane unless
   * `planePoint` overrides it.
   */
  points: Types.Point3[];
  /**
   * Builds the shape. This is the only argument that differs between the area
   * annotation tools.
   */
  createShape: (args: {
    volume: AreaAnnotationVolume;
    planePoint: Types.Point3;
    viewPlaneNormal: Types.Point3;
  }) => AreaAnnotationShape | null | undefined;
  /** Overrides the plane anchor. Defaults to `points[0]`. */
  planePoint?: Types.Point3;
  /**
   * The smallest number of points that the shape needs. Fewer points return an
   * empty result rather than reaching the shape factory, which throws. A
   * degenerate annotation arrives here after a bad hydration, or after a click
   * that registered one point, and an exception inside the render loop stops
   * the whole viewport. A caller whose shape can degenerate in another way
   * returns nothing from `createShape` instead.
   */
  minimumPoints?: number;
  /**
   * Called for every voxel that has a value. This is where the statistics
   * accumulator hooks in, and it runs whether or not the voxels are collected.
   */
  onSample?: (sample: AreaAnnotationVoxel) => void;
  /** Whether to return the voxels as well as accumulate them. */
  storePointData?: boolean;
}

/**
 * Selects the voxels an area annotation covers, and feeds them to a statistics
 * accumulator, per Rule M of
 * https://github.com/cornerstonejs/cornerstone3D/issues/2889
 *
 * Every area annotation tool shares this whole path. The plane, the thickness,
 * the index bounds and the accumulation are identical for a polyline, a circle,
 * an ellipse and a rectangle; only `createShape` differs:
 *
 * ```ts
 * // Planar freehand ROI
 * createShape: ({ volume, planePoint, viewPlaneNormal }) =>
 *   createPolylineShape({ volume, planePoint, viewPlaneNormal, polyline }),
 *
 * // Circle ROI
 * createShape: ({ volume, planePoint, viewPlaneNormal }) =>
 *   createCircleShape({ volume, planePoint, viewPlaneNormal, centerWorld, radius }),
 *
 * // Rectangle ROI
 * createShape: ({ volume, planePoint, viewPlaneNormal }) =>
 *   createRectangleShape({ volume, planePoint, viewPlaneNormal, centerWorld,
 *     majorAxis, majorHalfLength, minorHalfLength }),
 * ```
 *
 * Nothing here reads a viewport. The same annotation over the same volume
 * therefore selects the same voxels at any zoom, any pan, any canvas size and
 * any slab thickness, and at any orientation.
 *
 * See `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 *
 * @returns the voxels when `storePointData` is set, otherwise an empty array.
 * `onSample` runs either way.
 */
export default function sampleAreaAnnotationVoxels({
  annotation,
  image,
  voxelManager,
  points,
  createShape,
  planePoint: planePointOverride,
  minimumPoints = 3,
  onSample,
  storePointData,
}: AreaAnnotationVoxelsOptions): AreaAnnotationVoxel[] {
  // Without a normal there is no plane, and so no voxel set is defined. Every
  // tool records the normal when it creates the annotation, so this guards a
  // malformed annotation rather than an ordinary one.
  const recordedNormal = annotation?.metadata?.viewPlaneNormal;

  if (
    !voxelManager ||
    !image ||
    !recordedNormal ||
    !(points?.length >= minimumPoints)
  ) {
    return [];
  }

  const viewPlaneNormal = vec3.normalize(
    vec3.create(),
    recordedNormal
  ) as unknown as Types.Point3;

  // The annotation's own points define the plane's depth, which is what makes
  // this independent of where the camera happens to be focused. The shape and
  // the iterator must use the same anchor, so name it once here.
  const planePoint = planePointOverride ?? (points[0] as Types.Point3);

  const { dimensions, direction, spacing, origin, imageData } = image;
  const volume = { dimensions, direction, spacing, origin };
  const voxelThickness = getVoxelThicknessAlongNormal(volume, viewPlaneNormal);

  // T: the annotation's own thickness, captured from the viewport slab when
  // the annotation was created. Absent for stack annotations, and for
  // everything drawn before PlaneRestriction.referencePlaneThickness existed,
  // in which case it falls back to one voxel along the normal.
  //
  // Resolve it once, because the bounds below must use the value the iterator
  // uses: an unresolved absent thickness gives a half width of T_v / 2, which
  // clips the bounds by half a voxel and drops the outermost layer.
  const referencePlaneThickness = resolveReferencePlaneThickness(
    annotation.metadata?.planeRestriction?.referencePlaneThickness,
    voxelThickness
  );

  // A caller returns nothing for a degenerate annotation, such as a rectangle
  // of zero width. The shape factories throw on one, and an exception inside
  // the render loop stops the whole viewport.
  const shape = createShape({ volume, planePoint, viewPlaneNormal });

  if (!shape) {
    return [];
  }

  return sampleVoxelsInShape({
    volume,
    planePoint,
    viewPlaneNormal,
    // A planar shape reports 0, so the annotation's own thickness stands. A
    // shape that carries depth of its own reports that depth instead.
    referencePlaneThickness:
      shape.getRequiredThickness() || referencePlaneThickness,
    bounds: getAnnotationIndexBounds(
      points,
      volume,
      imageData,
      viewPlaneNormal,
      getMembershipHalfWidth(referencePlaneThickness, voxelThickness)
    ),
    getShapeRuns: shape.getRuns,
    voxelManager,
    onSample,
    storePointData,
  });
}

/**
 * The index-space bounding box of the voxels the annotation can reach, clamped
 * to the volume.
 *
 * The slab narrows iteration along the normal on its own, and the shape runs
 * bound the column axis exactly, but the outer and row loops would otherwise
 * walk the full volume extent. This confines them to the rows the annotation
 * can actually reach.
 *
 * A qualifying voxel centre does not lie on the annotation's plane: it lies
 * within the slab's half width `(T + T_v) / 2` of the plane along the normal,
 * so it can sit outside the outline's own box by that much. Dilating by the
 * half width converted into voxels per axis is what keeps the box a superset.
 * A fixed one voxel silently drops the outer layers of a thick annotation. The
 * extra voxel on top absorbs the rounding of a fractional index.
 */
function getAnnotationIndexBounds(
  points: Types.Point3[],
  volume: Pick<AreaAnnotationVolume, 'dimensions' | 'direction' | 'spacing'>,
  imageData,
  viewPlaneNormal: Types.Point3,
  halfWidth: number
): Types.BoundsIJK {
  const { dimensions, direction, spacing } = volume;

  const indexPoints = points.map(
    (point) => imageData.worldToIndex(point) as Types.Point3
  );
  const boundingBox = getBoundingBoxAroundShapeIJK(indexPoints);

  return [0, 1, 2].map((axis) => {
    const axisVector = direction.slice(axis * 3, axis * 3 + 3) as Types.Point3;
    // How far the slab's half width reaches along this index axis, in voxels.
    const dilation =
      Math.ceil(
        (halfWidth * Math.abs(vec3.dot(axisVector, viewPlaneNormal as vec3))) /
          spacing[axis]
      ) + 1;

    return [
      Math.max(0, Math.floor(boundingBox[axis][0]) - dilation),
      Math.min(
        dimensions[axis] - 1,
        Math.ceil(boundingBox[axis][1]) + dilation
      ),
    ];
  }) as Types.BoundsIJK;
}
