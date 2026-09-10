/**
 * Brush fills over the shared voxel slab iterator.
 *
 * Each builder here describes a brush shape - circle/ellipse, sphere,
 * rectangle - as a `VoxelSlabShape` anchored on the view plane, and the fill
 * enumerates the voxels of that shape with `csUtils.voxelSlab`'s
 * `iterateVoxelsInShape`. That is the same iterator, the same shapes and the
 * same membership rule that the area annotation tools measure with, so a brush
 * paints the voxels that an annotation of the same shape would report. See
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 *
 * The iterator emits exact integer runs along one voxel axis, nested inside the
 * slab's own bounds along the normal. Cost is therefore proportional to the
 * voxels painted plus the rows touched, and never to the volume of the
 * axis-aligned bounding box - which is almost entirely empty for a brush on an
 * oblique plane, and is what made the previous box walk both slow and prone to
 * bleeding into the neighbouring slices.
 *
 * ## Slab thickness
 *
 * A circle or a rectangle brush is flat: it lies in the view plane and carries
 * no depth of its own. The reference plane thickness therefore decides how deep
 * the fill reaches along the normal:
 *
 * - **Thin (single-slice) view** - the default. The thickness is one voxel
 *   measured along the normal, so the fill paints one oblique layer of voxels.
 *   Rule M widens the slab by half a voxel on each side, which is what keeps
 *   that single layer watertight: a thinner slab grazes the voxel grid at
 *   sparse positions and shows up as spaced lines or holes on a steep oblique
 *   plane.
 * - **Full-thickness (thick-slab) view** - the view slab thickness is passed
 *   through as the reference plane thickness, so the flat disc becomes a short
 *   cylinder and the fill paints every layer through the slab.
 *
 * A sphere brush is different: it carries its own depth, reports it through
 * `getRequiredThickness`, and so ignores the view slab entirely.
 *
 * ## Area semantics for thick-slab fills
 *
 * A thin fill is one voxel deep, so its in-plane area is the painted voxel
 * count times the voxel area. A thick-slab fill is a volume, not a planar
 * region: an *area* over its voxels must divide by the depth in voxels, or the
 * extra layers over-count the area. This affects area measurements only.
 */
import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

import { getShapeIndexBounds } from '../../../../utilities/sampleAreaAnnotationVoxels';

const {
  createCircleShape,
  createEllipseShape,
  createRectangleShape,
  createUnionShape,
  getMembershipHalfWidth,
  getVoxelThicknessAlongNormal,
  iterateVoxelsInShape,
  resolveReferencePlaneThickness,
} = csUtils.voxelSlab;

type VoxelSlabShape = csUtils.voxelSlab.VoxelSlabShape;

/** The volume geometry the iterator reads, as a labelmap's image data gives it. */
type BrushVolume = {
  dimensions: Types.Point3;
  direction: Types.Mat3;
  spacing: Types.Point3;
  origin: Types.Point3;
};

/**
 * A brush fill, ready to hand to {@link forEachBrushFillVoxel}.
 *
 * Attached to `InitializedOperationData.brushVoxelSlabFill` by the initialize
 * callback of a brush strategy, and consumed by the `regionFill` composition.
 */
export interface BrushVoxelSlabFill {
  volume: BrushVolume;
  /** The view plane anchor, in world coordinates. */
  planePoint: Types.Point3;
  /** The unit view plane normal. */
  viewPlaneNormal: Types.Point3;
  /** The resolved thickness along the normal, in mm. */
  referencePlaneThickness: number;
  /** Inclusive index bounds the iteration is confined to. */
  bounds: Types.BoundsIJK;
  /** The brush shape's exact in-plane runs. */
  shape: VoxelSlabShape;
}

/** The geometry an `InitializedOperationData` carries as `segmentationImageData`. */
function volumeFromImageData(imageData: vtkImageData): BrushVolume {
  return {
    dimensions: imageData.getDimensions() as Types.Point3,
    direction: imageData.getDirection() as Types.Mat3,
    spacing: imageData.getSpacing() as Types.Point3,
    origin: imageData.getOrigin() as Types.Point3,
  };
}

/** The viewport's in-plane x axis, from the view up and the normal. */
function getViewRight(
  viewUp: Types.Point3,
  viewPlaneNormal: Types.Point3
): Types.Point3 {
  const right = vec3.cross(
    vec3.create(),
    viewUp as vec3,
    viewPlaneNormal as vec3
  );
  return vec3.normalize(right, right) as unknown as Types.Point3;
}

/**
 * The centres of a brush stroke, resampled so consecutive discs overlap.
 *
 * The pointer reports a handful of positions per stroke, and a fast drag leaves
 * them further apart than the brush is wide. The union of discs at only those
 * positions would then be a dotted line, so a sample every `stepWorld` fills
 * the gaps. Half the smaller radius guarantees an overlap.
 */
function densifyStrokeCenters(
  centers: Types.Point3[],
  stepWorld: number
): Types.Point3[] {
  if (centers.length <= 1 || !(stepWorld > 0)) {
    return centers;
  }

  const dense: Types.Point3[] = [centers[0]];

  for (let index = 1; index < centers.length; index++) {
    const from = centers[index - 1];
    const to = centers[index];
    const delta = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(delta[0], delta[1], delta[2]);
    const steps = Math.max(1, Math.ceil(length / stepWorld));

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      dense.push([
        from[0] + delta[0] * t,
        from[1] + delta[1] * t,
        from[2] + delta[2] * t,
      ] as Types.Point3);
    }
  }

  return dense;
}

/**
 * Assembles a fill from one shape per stroke centre.
 *
 * Everything except the shape is identical for all three brushes, and it is the
 * same resolution order that `sampleAreaAnnotationVoxels` uses: resolve the
 * thickness first, let a shape with depth of its own override it, then bound
 * the index space with that same thickness. Bounds computed from a different
 * thickness than the iterator uses drop the outermost layer.
 *
 * @returns null when the brush covers nothing, which tells `regionFill` to fall
 * back to the bounding-box walk rather than paint an empty region.
 */
function buildBrushFill({
  segmentationImageData,
  planePoint,
  viewPlaneNormal,
  centersWorld,
  boundsMargin,
  slabThicknessWorld,
  createShape,
}: {
  segmentationImageData: vtkImageData;
  planePoint: Types.Point3;
  viewPlaneNormal: Types.Point3;
  centersWorld: Types.Point3[];
  boundsMargin: number;
  slabThicknessWorld?: number;
  createShape: (args: {
    volume: BrushVolume;
    planePoint: Types.Point3;
    viewPlaneNormal: Types.Point3;
    centerWorld: Types.Point3;
  }) => VoxelSlabShape | null;
}): BrushVoxelSlabFill | null {
  if (!centersWorld.length) {
    return null;
  }

  const volume = volumeFromImageData(segmentationImageData);
  const voxelThickness = getVoxelThicknessAlongNormal(volume, viewPlaneNormal);

  const shapes = centersWorld
    .map((centerWorld) =>
      createShape({ volume, planePoint, viewPlaneNormal, centerWorld })
    )
    .filter(Boolean) as VoxelSlabShape[];

  // A degenerate brush - a preview with fewer than two points, or a rectangle
  // dragged to zero width - reaches the shape factories, which reject it.
  if (!shapes.length) {
    return null;
  }

  const shape = createUnionShape(shapes);

  // The view slab thickness stands in for the annotation's own thickness here:
  // a brush has no recorded thickness, and what the user sees is what the view
  // shows. Absent or zero resolves to one voxel along the normal, so a thin
  // view paints one oblique layer.
  const referencePlaneThickness =
    shape.getRequiredThickness() ||
    resolveReferencePlaneThickness(slabThicknessWorld, voxelThickness);

  return {
    volume,
    planePoint,
    viewPlaneNormal,
    referencePlaneThickness,
    bounds: getShapeIndexBounds(
      centersWorld,
      volume,
      segmentationImageData,
      viewPlaneNormal,
      getMembershipHalfWidth(referencePlaneThickness, voxelThickness),
      boundsMargin
    ),
    shape,
  };
}

/**
 * A circle or ellipse brush: a flat disc in the view plane, per stroke centre.
 *
 * Flat, not an ellipsoid. An ellipsoid tapers to zero thickness at its rim, so
 * on an oblique plane it leaves holes there; the flat disc keeps the full slab
 * thickness right out to the edge and stays watertight. The depth comes from
 * the slab, as the module description explains.
 *
 * @param operationData.slabThicknessWorld - The view slab thickness in mm.
 * Omit, or pass 0, to paint a single oblique layer.
 */
export function createCircleBrushFill(operationData: {
  segmentationImageData: vtkImageData;
  viewUp: Types.Point3;
  viewPlaneNormal: Types.Point3;
  centerWorld: Types.Point3;
  xRadius: number;
  yRadius: number;
  strokeCentersWorld?: Types.Point3[];
  slabThicknessWorld?: number;
}): BrushVoxelSlabFill | null {
  const {
    segmentationImageData,
    viewUp,
    viewPlaneNormal,
    centerWorld,
    xRadius,
    yRadius,
    slabThicknessWorld,
  } = operationData;

  if (!(xRadius > 0) || !(yRadius > 0)) {
    return null;
  }

  const viewRight = getViewRight(viewUp, viewPlaneNormal);
  const centers = operationData.strokeCentersWorld?.length
    ? operationData.strokeCentersWorld
    : [centerWorld];

  return buildBrushFill({
    segmentationImageData,
    // Every disc is projected onto this one plane, so a stroke paints one
    // oblique layer however far the pointer travelled.
    planePoint: centerWorld,
    viewPlaneNormal,
    centersWorld: densifyStrokeCenters(centers, Math.min(xRadius, yRadius) / 2),
    boundsMargin: Math.max(xRadius, yRadius),
    slabThicknessWorld,
    createShape: ({ volume, planePoint, centerWorld: center }) =>
      createEllipseShape({
        volume,
        planePoint,
        viewPlaneNormal,
        centerWorld: center,
        majorAxis: viewRight,
        majorRadius: xRadius,
        minorRadius: yRadius,
      }),
  });
}

/**
 * A sphere brush: a solid sphere per stroke centre.
 *
 * The sphere carries its own depth, so it reports the thickness the slab must
 * have and the view slab thickness never enters. Unlike the circle brush the
 * centres are not projected onto the plane, so a stroke sweeps a true tube.
 */
export function createSphereBrushFill(operationData: {
  segmentationImageData: vtkImageData;
  viewPlaneNormal: Types.Point3;
  centerWorld: Types.Point3;
  radiusWorld: number;
  strokeCentersWorld?: Types.Point3[];
}): BrushVoxelSlabFill | null {
  const { segmentationImageData, viewPlaneNormal, centerWorld, radiusWorld } =
    operationData;

  if (!(radiusWorld > 0)) {
    return null;
  }

  const centers = operationData.strokeCentersWorld?.length
    ? operationData.strokeCentersWorld
    : [centerWorld];

  return buildBrushFill({
    segmentationImageData,
    planePoint: centerWorld,
    viewPlaneNormal,
    centersWorld: densifyStrokeCenters(centers, radiusWorld / 2),
    boundsMargin: radiusWorld,
    createShape: ({ volume, planePoint, centerWorld: center }) =>
      createCircleShape({
        volume,
        planePoint,
        viewPlaneNormal,
        centerWorld: center,
        radius: radiusWorld,
        depthRadius: radiusWorld,
      }),
  });
}

/**
 * A rectangle brush, from four coplanar corners in winding order.
 *
 * The plane comes from the corners themselves rather than from the camera, so
 * the fill matches the rectangle the user drew even if the camera has since
 * moved. `orderRectangleCorners` supplies the winding, which makes `p0 -> p1`
 * and `p0 -> p3` the two edges and `p0 -> p2` the diagonal.
 */
export function createRectangleBrushFill(operationData: {
  segmentationImageData: vtkImageData;
  cornersWorld: Types.Point3[];
  /** Used only when the corners are degenerate and define no plane. */
  viewPlaneNormal?: Types.Point3;
}): BrushVoxelSlabFill | null {
  const { segmentationImageData, cornersWorld } = operationData;

  if (cornersWorld.length < 4) {
    return null;
  }

  const [p0, p1, , p3] = cornersWorld;

  const majorAxis = vec3.sub(vec3.create(), p1 as vec3, p0 as vec3);
  const minorAxis = vec3.sub(vec3.create(), p3 as vec3, p0 as vec3);
  const majorHalfLength = vec3.length(majorAxis) / 2;
  const minorHalfLength = vec3.length(minorAxis) / 2;

  if (!(majorHalfLength > 0) || !(minorHalfLength > 0)) {
    return null;
  }

  // The rectangle's own normal, which is independent of the viewport. Two
  // parallel edges cross to zero and describe no plane, so fall back to the
  // recorded view normal.
  const normal = vec3.cross(vec3.create(), majorAxis, minorAxis);
  if (!(vec3.squaredLength(normal) > 0)) {
    if (!operationData.viewPlaneNormal) {
      return null;
    }
    vec3.copy(normal, operationData.viewPlaneNormal as vec3);
  }
  vec3.normalize(normal, normal);

  const center = vec3.lerp(
    vec3.create(),
    p0 as vec3,
    cornersWorld[2] as vec3,
    0.5
  ) as unknown as Types.Point3;

  return buildBrushFill({
    segmentationImageData,
    planePoint: center,
    viewPlaneNormal: normal as unknown as Types.Point3,
    centersWorld: [center],
    // The corners enclose the rectangle, but the bounds are taken from the
    // centre, so the half diagonal is how far the shape reaches past it.
    boundsMargin: Math.hypot(majorHalfLength, minorHalfLength),
    createShape: ({ volume, planePoint, viewPlaneNormal, centerWorld }) =>
      createRectangleShape({
        volume,
        planePoint,
        viewPlaneNormal,
        centerWorld,
        majorAxis: majorAxis as unknown as Types.Point3,
        majorHalfLength,
        minorHalfLength,
      }),
  });
}

/**
 * Visits every voxel of a brush fill, in the callback shape that
 * `VoxelManager.forEach` uses.
 *
 * The iterator already computes each voxel's world centre, so `pointLPS` costs
 * nothing beyond the copy - the previous fill transformed every index back to
 * world separately.
 */
export function forEachBrushFillVoxel(
  fill: BrushVoxelSlabFill,
  voxelManager: Types.IVoxelManager<number>,
  callback: (args: {
    value: number;
    index: number;
    pointIJK: Types.Point3;
    pointLPS: Types.Point3;
  }) => void
): void {
  const iteration = iterateVoxelsInShape({
    volume: fill.volume,
    planePoint: fill.planePoint,
    viewPlaneNormal: fill.viewPlaneNormal,
    referencePlaneThickness: fill.referencePlaneThickness,
    bounds: fill.bounds,
    getShapeRuns: fill.shape.getRuns,
  });

  for (const { ijk, center } of iteration) {
    // ijk and center are reused between iterations, so copy before the
    // callback, which records them in an undo memo.
    const pointIJK: Types.Point3 = [ijk[0], ijk[1], ijk[2]];
    const index = voxelManager.toIndex(pointIJK);

    callback({
      value: voxelManager.getAtIndex(index),
      index,
      pointIJK,
      pointLPS: [center[0], center[1], center[2]],
    });
  }
}
