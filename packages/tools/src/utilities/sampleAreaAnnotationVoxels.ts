import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { getBoundingBoxAroundShapeIJK } from './boundingBox';

const {
  asUnitNormal,
  getMembershipHalfWidth,
  getVoxelThicknessAlongNormal,
  resolveReferencePlaneThickness,
  sampleVoxelsInShape,
} = csUtils.voxelSlab;

/**
 * The volume geometry that the voxel iterator reads: core's `VolumeGeometry`,
 * restricted to the structural form, because every caller here passes an
 * `IImageData` and never an `IImageVolume`.
 */
export type AreaAnnotationVolume = {
  dimensions: Types.Point3;
  direction: Types.Mat3;
  spacing: Types.Point3;
  origin: Types.Point3;
};

/** A plane-anchored shape, as every `csUtils.voxelSlab` factory returns one. */
export type AreaAnnotationShape = csUtils.voxelSlab.VoxelSlabShape;

/** One voxel of an area annotation, with its value. */
export type AreaAnnotationVoxel = {
  value: number;
  pointLPS: Types.Point3;
  pointIJK: Types.Point3;
};

export interface AreaAnnotationVoxelsOptions {
  /**
   * The annotation. The function reads `metadata.viewPlaneNormal`,
   * `metadata.planeRestriction`, and nothing else.
   */
  annotation: {
    metadata?: {
      viewPlaneNormal?: Types.Point3;
      planeRestriction?: {
        referencePlaneThickness?: number;
        inPlaneVector1?: Types.Point3;
        inPlaneVector2?: Types.Point3;
      };
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
   * The world points the shape is built from: the outline of a polyline, the
   * four corners of a rectangle, the centre and the handles of a circle. The
   * index bounds come from these points and from `boundsMargin`, and
   * `points[0]` anchors the plane unless `planePoint` overrides it.
   */
  points: Types.Point3[];
  /**
   * How far, in mm, the shape reaches past `points`. Defaults to 0, which
   * holds when the points enclose the shape, as the outline of a polyline and
   * the four corners of a rectangle do. A circle and an ellipse pass their
   * largest radius, because their handles only touch the outline.
   */
  boundsMargin?: number;
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
  boundsMargin = 0,
  createShape,
  planePoint: planePointOverride,
  minimumPoints = 3,
  onSample,
  storePointData,
}: AreaAnnotationVoxelsOptions): AreaAnnotationVoxel[] {
  // Without a plane there is no voxel set at all.
  const viewPlaneNormal = resolveAnnotationNormal(annotation?.metadata);

  if (
    !voxelManager ||
    !image ||
    !viewPlaneNormal ||
    !(points?.length >= minimumPoints)
  ) {
    return [];
  }

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

  // A planar shape reports 0, so the annotation's own thickness stands. A
  // shape that carries depth of its own reports that depth instead. The bounds
  // and the iterator must use the same value, or a solid shape loses every
  // layer past the first.
  const slabThickness = shape.getRequiredThickness() || referencePlaneThickness;

  return sampleVoxelsInShape({
    volume,
    planePoint,
    viewPlaneNormal,
    referencePlaneThickness: slabThickness,
    bounds: getShapeIndexBounds(
      points,
      volume,
      imageData,
      viewPlaneNormal,
      getMembershipHalfWidth(slabThickness, voxelThickness),
      boundsMargin
    ),
    getShapeRuns: shape.getRuns,
    voxelManager,
    onSample,
    storePointData,
  });
}

/**
 * The unit normal of the annotation's own plane.
 *
 * `metadata.viewPlaneNormal` is the recorded value, and every tool records it
 * when the user draws the annotation. An annotation that arrives from a DICOM
 * SR has no recorded normal, because an SR stores no camera: the hydration
 * code calls `updatePlaneRestriction` instead, which records two in-plane
 * directions, and the cross product of the two describes the same plane.
 * Neither source reads a viewport, so the voxel set stays a property of the
 * annotation and the data in both cases.
 *
 * @returns undefined when neither source gives a plane. Two points give one
 * in-plane direction and no plane, so a two point annotation that arrives
 * without a normal, such as a circle from an SR, reports no statistics.
 */
function resolveAnnotationNormal(
  metadata: AreaAnnotationVoxelsOptions['annotation']['metadata']
): Types.Point3 | undefined {
  const recorded = metadata?.viewPlaneNormal;

  if (recorded && vec3.squaredLength(recorded as vec3) > 0) {
    return asUnitNormal(recorded);
  }

  const { inPlaneVector1, inPlaneVector2 } = metadata?.planeRestriction ?? {};

  if (!inPlaneVector1 || !inPlaneVector2) {
    return undefined;
  }

  const normal = vec3.cross(
    vec3.create(),
    inPlaneVector1 as vec3,
    inPlaneVector2 as vec3
  );

  // Two collinear vectors cross to zero, and describe no plane.
  return vec3.squaredLength(normal) > 0
    ? (asUnitNormal(normal as unknown as Types.Point3) as Types.Point3)
    : undefined;
}

/**
 * The index-space bounding box of the voxels a plane-anchored shape can reach,
 * clamped to the volume.
 *
 * The slab narrows iteration along the normal on its own, and the shape runs
 * bound the column axis exactly, but the outer and row loops would otherwise
 * walk the full volume extent. This confines them to the rows the shape can
 * actually reach.
 *
 * Shared with the brush fill strategies, which bound a brush the same way. See
 * `strategies/utils/brushVoxelSlab.ts`.
 *
 * The box of `points` is not the box of the shape, and a qualifying voxel
 * centre does not lie on the shape's plane. Two dilations therefore keep the
 * box a superset:
 *
 * - `margin`, how far the shape reaches past `points`. The direction matrix is
 *   orthonormal, so a world distance of `margin` moves the index by at most
 *   `margin / spacing` along any axis.
 * - `halfWidth`, the slab's `(T + T_v) / 2`, within which a centre qualifies.
 *   The centre can sit outside the plane by that much, along the normal. A
 *   fixed one voxel silently drops the outer layers of a thick annotation.
 *
 * The extra voxel on top absorbs the rounding of a fractional index.
 */
export function getShapeIndexBounds(
  points: Types.Point3[],
  volume: Pick<AreaAnnotationVolume, 'dimensions' | 'direction' | 'spacing'>,
  imageData,
  viewPlaneNormal: Types.Point3,
  halfWidth: number,
  margin: number
): Types.BoundsIJK {
  const { dimensions, direction, spacing } = volume;

  const indexPoints = points.map(
    (point) => imageData.worldToIndex(point) as Types.Point3
  );
  const boundingBox = getBoundingBoxAroundShapeIJK(indexPoints);

  return [0, 1, 2].map((axis) => {
    const axisVector = direction.slice(axis * 3, axis * 3 + 3) as Types.Point3;
    // How far the margin and the half width reach along this index axis, in
    // voxels.
    const dilation =
      Math.ceil(
        (margin +
          halfWidth * Math.abs(vec3.dot(axisVector, viewPlaneNormal as vec3))) /
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
