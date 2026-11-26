/**
 * planarSliceBasis -- Builds the geometric basis that anchors a planar
 * slice in world space.
 *
 * A `PlanarSliceBasis` is the second tier of the three-tier camera pipeline:
 *   PlanarViewState (user model) -> PlanarSliceBasis (geometric basis) -> ICamera (render camera)
 *
 * It encapsulates the properties of a specific cross-section through an image
 * or volume -- its center, orientation, and the scale at which the slice fits
 * the canvas exactly (zoom = 1). Downstream modules (`planarRenderCamera`)
 * combine a PlanarSliceBasis with user-level pan/zoom/rotation to produce a
 * renderer-ready ICamera.
 *
 * Two factory functions are provided:
 *   - `createPlanarImageSliceBasis` -- for single-image (stack) paths.
 *   - `createPlanarVolumeSliceBasis` -- for volume-slice paths (arbitrary
 *     orthogonal orientations with per-slice indexing).
 */
import { vec3 } from 'gl-matrix';
import { InterpolationType, OrientationAxis } from '../../../enums';
import type {
  ActorSliceRange,
  IImage,
  IImageVolume,
  Point3,
} from '../../../types';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import { getCubeSizeInView } from '../../../utilities/getPlaneCubeIntersectionDimensions';
import {
  getDefaultGridSliceIndex,
  getGridSliceIndex,
  getGridSliceProjection,
  getSliceGrid,
  getSliceStepAlongNormal,
} from '../../../utilities/volumeSliceGrid';
import type { VolumeSliceGrid } from '../../../utilities/volumeSliceGrid';
import {
  getCpuEquivalentParallelScale,
  getOrthogonalVolumeSliceGeometry,
} from './planarAdapterCoordinateTransforms';
import { getPlanarViewStateVectors } from './planarOrientationVectors';
import { getSafeCanvasDimension, normalizePoint3 } from './planarMath';
import type { PlanarViewState } from './PlanarViewportTypes';

/**
 * The geometric basis for a single planar cross-section through image data.
 *
 * @property sliceCenterWorld - The world-space center of this slice (the default
 *   focal point when pan is zero).
 * @property viewPlaneNormal - Unit vector perpendicular to the slice plane,
 *   pointing toward the camera.
 * @property viewUp - Unit vector defining the "up" direction in the slice
 *   plane (before user rotation is applied).
 * @property fitParallelScale - The parallelScale value at which the full
 *   slice exactly fits the canvas (i.e. zoom = 1). Computed from image
 *   dimensions, spacing, and canvas aspect ratio.
 * @property sliceWidthWorld - Width of the displayed slice in world units
 *   before canvas aspect-ratio fitting is applied.
 * @property sliceHeightWorld - Height of the displayed slice in world units
 *   before canvas aspect-ratio fitting is applied.
 * @property cameraDistance - Distance from the focal point to the camera
 *   position along the viewPlaneNormal. For single images this is a nominal
 *   value (1); for volumes it spans the full depth so clipping captures the
 *   entire volume.
 */
export interface PlanarSliceBasis {
  sliceCenterWorld: Point3;
  viewPlaneNormal: Point3;
  viewUp: Point3;
  fitParallelScale: number;
  sliceWidthWorld: number;
  sliceHeightWorld: number;
  cameraDistance: number;
}

const MIN_CAMERA_DISTANCE = 1;
const MIN_SLICE_SPACING = 1e-6;
const ORTHONORMAL_EPSILON = 1e-6;

type VolumeSliceFitMetrics = {
  fitParallelScale: number;
  sliceWidthWorld: number;
  sliceHeightWorld: number;
};

/**
 * The parallel scale that fits a slice of a world width and height into a
 * canvas.
 */
export function getFitParallelScaleFromWorldSize(args: {
  canvasWidth: number;
  canvasHeight: number;
  widthWorld: number;
  heightWorld: number;
}): number {
  const { canvasHeight, canvasWidth, heightWorld, widthWorld } = args;
  const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
  const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);
  const safeWidthWorld = Math.max(widthWorld, MIN_SLICE_SPACING);
  const safeHeightWorld = Math.max(heightWorld, MIN_SLICE_SPACING);
  const sliceAspectRatio = safeWidthWorld / safeHeightWorld;
  const canvasAspectRatio = safeCanvasWidth / safeCanvasHeight;
  const scaleFactor = sliceAspectRatio / canvasAspectRatio;

  return scaleFactor < 1
    ? safeHeightWorld / 2
    : (safeHeightWorld * scaleFactor) / 2;
}

/**
 * The vertical scale, against the plain fit of a slice, at which the slice
 * stretched horizontally by `stretch` fits into a canvas. It is 1 for a
 * stretch of 1.
 */
export function getStretchedFitRatio(args: {
  canvasWidth: number;
  canvasHeight: number;
  widthWorld: number;
  heightWorld: number;
  stretch: number;
}): number {
  const { canvasHeight, canvasWidth, heightWorld, stretch, widthWorld } = args;
  const getFit = (widthStretch: number) =>
    getFitParallelScaleFromWorldSize({
      canvasWidth,
      canvasHeight,
      widthWorld: widthWorld * widthStretch,
      heightWorld,
    });

  return getFit(1) / getFit(stretch);
}

function createFallbackVolumeSliceFitMetrics(): VolumeSliceFitMetrics {
  return {
    fitParallelScale: MIN_CAMERA_DISTANCE,
    sliceWidthWorld: MIN_CAMERA_DISTANCE * 2,
    sliceHeightWorld: MIN_CAMERA_DISTANCE * 2,
  };
}

function isOne(value: number): boolean {
  return Math.abs(Math.abs(value) - 1) < ORTHONORMAL_EPSILON;
}

function isUnitAxis(direction: ArrayLike<number>, offset: number): boolean {
  return (
    isOne(direction[offset]) ||
    isOne(direction[offset + 1]) ||
    isOne(direction[offset + 2])
  );
}

function isOrthonormalDirection(direction: ArrayLike<number>): boolean {
  return (
    isUnitAxis(direction, 0) &&
    isUnitAxis(direction, 3) &&
    isUnitAxis(direction, 6)
  );
}

/**
 * Creates a section basis for a single DICOM image (stack path).
 *
 * The slice plane is derived from the image's direction cosines:
 *   - Row vector = first 3 elements of the direction matrix.
 *   - Column vector = next 3 elements.
 *   - viewPlaneNormal = negated normal (row x column), pointing toward camera.
 *   - viewUp = negated column vector (DICOM column runs top-to-bottom,
 *     but screen Y runs bottom-to-top in VTK convention).
 *
 * sliceCenterWorld is the geometric center of the image in world space,
 * computed by offsetting the origin by half the image extent along each axis.
 *
 * @param args.image - The decoded DICOM image providing geometry metadata.
 * @param args.canvasWidth - Current canvas width in CSS pixels.
 * @param args.canvasHeight - Current canvas height in CSS pixels.
 * @returns A PlanarSliceBasis anchored to this image's plane.
 */
function buildPlanarImageSliceBasis(args: {
  image: IImage;
  canvasWidth: number;
  canvasHeight: number;
  rowOffset: number;
  columnOffset: number;
  rowsForFit: number;
  columnsForFit: number;
}): PlanarSliceBasis {
  const {
    canvasHeight,
    canvasWidth,
    columnOffset,
    columnsForFit,
    image,
    rowOffset,
    rowsForFit,
  } = args;
  const { direction, origin } = getImageDataMetadata(image);
  const rowVector = direction.slice(0, 3) as Point3;
  const columnVector = direction.slice(3, 6) as Point3;
  const viewPlaneNormal = direction
    .slice(6, 9)
    .map((value) => -value) as Point3;
  const viewUp = columnVector.map((value) => -value) as Point3;
  const sliceCenterWorld = [...origin] as Point3;
  const sliceWidthWorld =
    Math.max(columnsForFit, 1) * (image.columnPixelSpacing || 1);
  const sliceHeightWorld =
    Math.max(rowsForFit, 1) * (image.rowPixelSpacing || 1);
  // Stack images must resolve the same slice basis regardless of whether the
  // pixels are drawn through VTK or the CPU fallback. Keeping the center and
  // fit geometry shared prevents render-mode switches from nudging the camera.
  vec3.scaleAndAdd(
    sliceCenterWorld as unknown as vec3,
    sliceCenterWorld as unknown as vec3,
    rowVector as unknown as vec3,
    rowOffset
  );
  vec3.scaleAndAdd(
    sliceCenterWorld as unknown as vec3,
    sliceCenterWorld as unknown as vec3,
    columnVector as unknown as vec3,
    columnOffset
  );

  return {
    sliceCenterWorld,
    viewPlaneNormal: vec3.clone(viewPlaneNormal as unknown as vec3) as Point3,
    viewUp,
    fitParallelScale: getCpuEquivalentParallelScale({
      canvasHeight,
      canvasWidth,
      columnPixelSpacing: image.columnPixelSpacing || 1,
      columns: columnsForFit,
      rowPixelSpacing: image.rowPixelSpacing || 1,
      rows: rowsForFit,
    }),
    sliceWidthWorld,
    sliceHeightWorld,
    cameraDistance: 1,
  };
}

export function createPlanarImageSliceBasis(args: {
  image: IImage;
  canvasWidth: number;
  canvasHeight: number;
}): PlanarSliceBasis {
  const { image } = args;
  const { dimensions, spacing } = getImageDataMetadata(image);

  return buildPlanarImageSliceBasis({
    ...args,
    rowOffset: ((dimensions[0] - 1) / 2) * spacing[0],
    columnOffset: ((dimensions[1] - 1) / 2) * spacing[1],
    rowsForFit: Math.max(image.rows, 1),
    columnsForFit: Math.max(image.columns, 1),
  });
}

/**
 * CPU stack rendering reuses the VTK-compatible image slice basis so that the
 * semantic camera is invariant across render modes.
 */
export function createPlanarCpuImageSliceBasis(args: {
  image: IImage;
  canvasWidth: number;
  canvasHeight: number;
}): PlanarSliceBasis {
  return createPlanarImageSliceBasis(args);
}

/**
 * Computes the 8 world-space corners of a volume's bounding box.
 * Used by `getSliceMetrics` to determine the range of slice positions
 * along an arbitrary viewing direction.
 */
function buildImageVolumeCorners(imageVolume: IImageVolume): Point3[] {
  const imageData = imageVolume.imageData;

  if (!imageData) {
    return [];
  }

  const direction = imageData.getDirection();

  if (isOrthonormalDirection(direction)) {
    const bounds = imageData.extentToBounds(imageData.getExtent());

    return [
      [bounds[0], bounds[2], bounds[4]],
      [bounds[0], bounds[2], bounds[5]],
      [bounds[0], bounds[3], bounds[4]],
      [bounds[0], bounds[3], bounds[5]],
      [bounds[1], bounds[2], bounds[4]],
      [bounds[1], bounds[2], bounds[5]],
      [bounds[1], bounds[3], bounds[4]],
      [bounds[1], bounds[3], bounds[5]],
    ];
  }

  const [dx, dy, dz] = imageData.getDimensions();
  const cornersIdx = [
    [0, 0, 0],
    [dx - 1, 0, 0],
    [0, dy - 1, 0],
    [dx - 1, dy - 1, 0],
    [0, 0, dz - 1],
    [dx - 1, 0, dz - 1],
    [0, dy - 1, dz - 1],
    [dx - 1, dy - 1, dz - 1],
  ] as Point3[];

  return cornersIdx.map((it) => imageData.indexToWorld(it)) as Point3[];
}

/**
 * The range of a volume along a view plane normal, as `getSliceRange` gives
 * it for the actor of the volume: the smallest and the largest projection of
 * the corners of the volume onto the normal, and the projection of the focal
 * point. It reads the volume, not an actor, so it does not depend on the
 * render path that draws the volume.
 *
 * @internal
 */
export function getPlanarVolumeSliceRange(
  imageVolume: IImageVolume,
  viewPlaneNormal: Point3,
  focalPoint: Point3
): ActorSliceRange | undefined {
  const corners = buildImageVolumeCorners(imageVolume);

  if (!corners.length) {
    return;
  }

  const projections = corners.map((corner) =>
    vec3.dot(corner as unknown as vec3, viewPlaneNormal as unknown as vec3)
  );

  return {
    actor: undefined,
    viewPlaneNormal,
    focalPoint,
    min: Math.min(...projections),
    max: Math.max(...projections),
    current: vec3.dot(
      focalPoint as unknown as vec3,
      viewPlaneNormal as unknown as vec3
    ),
  };
}

/**
 * Returns the world-space center of a volume, computed from the midpoint
 * of the voxel-center index domain. Falls back to averaging the bounding-box
 * corners if vtkImageData is unavailable. Only its position across the view
 * counts: the slice basis moves it along the normal onto the slice.
 */
function getGeometricImageVolumeCenter(imageVolume: IImageVolume): Point3 {
  const imageData = imageVolume.imageData;

  if (imageData) {
    const ijk = imageData.getDimensions().map((d) => (d - 1) / 2);

    return imageData.indexToWorld(ijk as [number, number, number]) as Point3;
  }

  const corners = buildImageVolumeCorners(imageVolume);

  if (!corners.length) {
    return [0, 0, 0];
  }

  const center = vec3.create();

  for (const corner of corners) {
    vec3.add(center, center, corner as unknown as vec3);
  }

  return vec3.scale(center, center, 1 / corners.length) as Point3;
}

/**
 * World-space center of the volume slice that backs `imageVolume.imageIds[k]`.
 *
 * Volumes are constructed so `imageIds[k]` is IJK slice k, so the exact slice
 * center is `indexToWorld([centerI, centerJ, k])`. This is the ordering-safe
 * way to anchor a slice for an index expressed in the volume's imageId list:
 * the alternative — walking `min + k * spacing` along the viewPlaneNormal in
 * `buildPlanarVolumeSliceBasis` — counts slices in CAMERA order, and for the
 * acquisition orientation the camera normal is the negated scan axis, so an
 * imageId-list index fed into that walk lands on the mirrored slice (and on
 * oblique volumes drifts off slice centers, since the corner projections span
 * the voxel bounding box rather than slice centers).
 */
export function getVolumeImageIdIndexWorldPoint(
  imageVolume: IImageVolume | undefined,
  imageIdIndex: number
): Point3 | undefined {
  const imageData = imageVolume?.imageData;

  if (!imageData) {
    return;
  }

  const dimensions = imageData.getDimensions();
  // Dynamic (4D) volumes flatten their imageIds across dimension groups while
  // dimensions[2] is the slice count of a SINGLE group, so an image from any
  // later group has a flattened index >= dimensions[2] — clamping that raw
  // index would pin every such image to the final slice. Map it to its
  // group-local slice first (the k axis repeats per group).
  const flatToGroupLocal = (
    imageVolume as {
      flatImageIdIndexToImageIdIndex?: (flatImageIdIndex: number) => number;
    }
  ).flatImageIdIndexToImageIdIndex;
  const groupLocalIndex =
    typeof flatToGroupLocal === 'function'
      ? flatToGroupLocal.call(imageVolume, Math.max(0, imageIdIndex))
      : imageIdIndex;
  const k = Math.min(Math.max(0, groupLocalIndex), dimensions[2] - 1);

  return imageData.indexToWorld([
    (dimensions[0] - 1) / 2,
    (dimensions[1] - 1) / 2,
    k,
  ]) as Point3;
}

/**
 * The slice grid of a volume along a view plane normal (see
 * `utilities/volumeSliceGrid`): the range is spanned by the projections of
 * the centres of the corner voxels, the step is the slice step of
 * `rendering.sliceStepMeasure`. Every index and every slice position of a
 * planar view of the volume comes from it.
 *
 * @internal
 */
export function getPlanarVolumeSliceGrid(
  imageVolume: IImageVolume,
  viewPlaneNormal: Point3
): VolumeSliceGrid {
  const corners = buildImageVolumeCorners(imageVolume);
  const step = Math.max(
    getSliceStepAlongNormal(imageVolume, viewPlaneNormal),
    MIN_SLICE_SPACING
  );

  if (!corners.length) {
    return getSliceGrid(0, 0, step);
  }

  const projectedValues = corners.map(
    (corner) =>
      corner[0] * viewPlaneNormal[0] +
      corner[1] * viewPlaneNormal[1] +
      corner[2] * viewPlaneNormal[2]
  );

  return getSliceGrid(
    Math.min(...projectedValues),
    Math.max(...projectedValues),
    step
  );
}

export function resolvePlanarVolumeImageIdIndex(args: {
  viewState?: PlanarViewState;
  fallbackImageIdIndex?: number;
}): number | undefined {
  const { viewState, fallbackImageIdIndex } = args;
  const slice = viewState?.slice;

  if (slice?.kind === 'volumePoint') {
    return;
  }

  if (slice?.kind === 'stackIndex') {
    return slice.imageIdIndex;
  }

  if (viewState?.orientation === OrientationAxis.ACQUISITION) {
    return fallbackImageIdIndex;
  }
}

/**
 * Computes the `fitParallelScale` for a volume slice viewed from a given
 * orientation. Uses `getOrthogonalVolumeSliceGeometry` to determine the
 * effective rows/columns/spacing of the visible cross-section, then
 * delegates to `getCpuEquivalentParallelScale` for aspect-ratio-aware
 * scale computation.
 */
function getCpuVolumeSliceFitMetrics(args: {
  imageVolume: IImageVolume;
  viewPlaneNormal: Point3;
  viewUp: Point3;
  canvasWidth: number;
  canvasHeight: number;
}): VolumeSliceFitMetrics {
  const { imageVolume, viewPlaneNormal, viewUp, canvasWidth, canvasHeight } =
    args;
  const geometry = getOrthogonalVolumeSliceGeometry({
    dimensions: imageVolume.dimensions,
    direction: imageVolume.direction,
    spacing: imageVolume.spacing,
    viewPlaneNormal,
    viewUp,
  });

  if (geometry) {
    const columns = Math.max(geometry.columns, 1);
    const rows = Math.max(geometry.rows, 1);
    const sliceWidthWorld = columns * geometry.columnPixelSpacing;
    const sliceHeightWorld = rows * geometry.rowPixelSpacing;

    return {
      fitParallelScale: getCpuEquivalentParallelScale({
        canvasHeight: getSafeCanvasDimension(canvasHeight),
        canvasWidth: getSafeCanvasDimension(canvasWidth),
        columnPixelSpacing: geometry.columnPixelSpacing,
        columns,
        rowPixelSpacing: geometry.rowPixelSpacing,
        rows,
      }),
      sliceWidthWorld,
      sliceHeightWorld,
    };
  }

  const imageData = imageVolume.imageData;

  if (imageData) {
    const { widthWorld, heightWorld } = getCubeSizeInView(
      imageData,
      viewPlaneNormal,
      viewUp
    );

    if (widthWorld > 0 && heightWorld > 0) {
      return {
        fitParallelScale: getFitParallelScaleFromWorldSize({
          canvasHeight,
          canvasWidth,
          widthWorld,
          heightWorld,
        }),
        sliceWidthWorld: widthWorld,
        sliceHeightWorld: heightWorld,
      };
    }
  }

  return createFallbackVolumeSliceFitMetrics();
}

/**
 * Creates a section basis for a volume viewed from an orthogonal orientation.
 *
 * The orientation (axial, sagittal, coronal, or custom) determines the
 * viewPlaneNormal and viewUp vectors. The imageIdIndex selects which slice
 * along the normal to display.
 *
 * Slice positioning works by:
 *   1. Computing the volume's bounding box projection onto the viewPlaneNormal.
 *   2. Mapping `imageIdIndex` to a depth within [min, max] at `spacingInNormalDirection` intervals.
 *   3. Offsetting the volume center along the normal to reach that depth.
 *
 * @param args.canvasWidth - Current canvas width in CSS pixels.
 * @param args.canvasHeight - Current canvas height in CSS pixels.
 * @param args.imageIdIndex - Desired slice index; defaults to the middle slice if undefined.
 * @param args.imageVolume - The loaded volume providing geometry and vtkImageData.
 * @param args.orientation - Orientation axis or custom orientation vectors.
 * @returns The section basis, the clamped slice index, and the maximum valid index.
 */
function buildPlanarVolumeSliceBasis(args: {
  canvasWidth: number;
  canvasHeight: number;
  imageIdIndex?: number;
  imageVolume: IImageVolume;
  orientation?: PlanarViewState['orientation'];
  viewState?: PlanarViewState;
  center: Point3;
  fitParallelScale: number;
  sliceWidthWorld: number;
  sliceHeightWorld: number;
}): {
  sliceBasis: PlanarSliceBasis;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
} {
  const {
    center,
    fitParallelScale,
    imageVolume,
    orientation,
    sliceHeightWorld,
    sliceWidthWorld,
    viewState,
  } = args;
  const cameraValues = getPlanarViewStateVectors({
    imageVolume,
    orientation,
  });

  if (!cameraValues) {
    return {
      sliceBasis: {
        sliceCenterWorld: [0, 0, 0],
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, -1, 0],
        fitParallelScale: MIN_CAMERA_DISTANCE,
        sliceWidthWorld: MIN_CAMERA_DISTANCE * 2,
        sliceHeightWorld: MIN_CAMERA_DISTANCE * 2,
        cameraDistance: MIN_CAMERA_DISTANCE,
      },
      currentImageIdIndex: 0,
      maxImageIdIndex: 0,
    };
  }

  const viewPlaneNormal = normalizePoint3(cameraValues.viewPlaneNormal);
  const viewUp = normalizePoint3(cameraValues.viewUp);
  const grid = getPlanarVolumeSliceGrid(imageVolume, viewPlaneNormal);
  const { max, maxSliceIndex: maxImageIdIndex, min, step } = grid;
  const project = (point: Point3) =>
    point[0] * viewPlaneNormal[0] +
    point[1] * viewPlaneNormal[1] +
    point[2] * viewPlaneNormal[2];
  const volumePoint =
    viewState?.slice?.kind === 'volumePoint'
      ? viewState.slice.sliceWorldPoint
      : undefined;
  const imageIdIndex =
    args.imageIdIndex ??
    (volumePoint ? undefined : getDefaultGridSliceIndex(grid));
  const currentImageIdIndex =
    typeof imageIdIndex === 'number'
      ? Math.min(Math.max(0, imageIdIndex), maxImageIdIndex)
      : getGridSliceIndex(grid, project(volumePoint));
  const first = Math.min(min, getGridSliceProjection(grid, 0));
  const last = Math.max(max, getGridSliceProjection(grid, maxImageIdIndex));
  const targetProjection =
    typeof imageIdIndex === 'number'
      ? getGridSliceProjection(grid, currentImageIdIndex)
      : Math.min(last, Math.max(first, project(volumePoint)));
  const scalarOffset = targetProjection - project(center);
  const sliceCenterWorld = [0, 1, 2].map(
    (axis) => center[axis] + viewPlaneNormal[axis] * scalarOffset
  ) as Point3;

  // cameraDistance spans the full volume depth so the clipping range
  // can capture the entire volume when needed.
  const cameraDistance = Math.max(max - min, step, 1);

  return {
    sliceBasis: {
      sliceCenterWorld,
      viewPlaneNormal,
      viewUp,
      fitParallelScale,
      sliceWidthWorld,
      sliceHeightWorld,
      cameraDistance,
    },
    currentImageIdIndex,
    maxImageIdIndex,
  };
}

export function createPlanarVolumeSliceBasis(args: {
  canvasWidth: number;
  canvasHeight: number;
  imageIdIndex?: number;
  imageVolume: IImageVolume;
  orientation?: PlanarViewState['orientation'];
  viewState?: PlanarViewState;
}): {
  sliceBasis: PlanarSliceBasis;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
} {
  const { imageVolume, orientation } = args;
  const cameraValues = getPlanarViewStateVectors({
    imageVolume,
    orientation,
  });
  const sliceFitMetrics = cameraValues
    ? getCpuVolumeSliceFitMetrics({
        ...args,
        viewPlaneNormal: cameraValues.viewPlaneNormal,
        viewUp: cameraValues.viewUp,
      })
    : createFallbackVolumeSliceFitMetrics();

  return buildPlanarVolumeSliceBasis({
    ...args,
    center: getGeometricImageVolumeCenter(imageVolume),
    ...sliceFitMetrics,
  });
}

export function createPlanarCpuVolumeSliceBasis(args: {
  canvasWidth: number;
  canvasHeight: number;
  imageIdIndex?: number;
  imageVolume: IImageVolume;
  orientation?: PlanarViewState['orientation'];
  viewState?: PlanarViewState;
}): {
  sliceBasis: PlanarSliceBasis;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
} {
  return createPlanarVolumeSliceBasis(args);
}

export function shouldUsePlanarCpuVolumeSliceBasis(
  interpolationType: InterpolationType = InterpolationType.LINEAR
): boolean {
  return interpolationType === InterpolationType.NEAREST;
}
