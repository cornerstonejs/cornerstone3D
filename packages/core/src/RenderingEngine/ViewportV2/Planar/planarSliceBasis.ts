/**
 * planarSliceBasis -- Builds the geometric basis that anchors a planar
 * slice in world space.
 *
 * A `PlanarSliceBasis` is the second tier of the three-tier camera pipeline:
 *   PlanarCamera (user model) -> PlanarSliceBasis (geometric basis) -> ICamera (render camera)
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
import { OrientationAxis } from '../../../enums';
import type { IImage, IImageVolume, Point3 } from '../../../types';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import { getCubeSizeInView } from '../../../utilities/getPlaneCubeIntersectionDimensions';
import getSpacingInNormalDirection from '../../../utilities/getSpacingInNormalDirection';
import {
  getCpuEquivalentParallelScale,
  getOrthogonalVolumeSliceGeometry,
} from './planarAdapterCoordinateTransforms';
import { getPlanarCameraVectors } from './planarOrientationVectors';
import { getSafeCanvasDimension, normalizePoint3 } from './planarMath';
import type { PlanarCamera } from './PlanarViewportTypes';

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
  cameraDistance: number;
}

const MIN_CAMERA_DISTANCE = 1;
const MIN_SLICE_SPACING = 1e-6;

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
  const { direction, dimensions, origin, spacing } =
    getImageDataMetadata(image);
  const rowVector = direction.slice(0, 3) as Point3;
  const columnVector = direction.slice(3, 6) as Point3;
  const viewPlaneNormal = direction
    .slice(6, 9)
    .map((value) => -value) as Point3;
  const viewUp = columnVector.map((value) => -value) as Point3;
  const sliceCenterWorld = [...origin] as Point3;
  // CPU and VTK image paths intentionally use different slice centers.
  // VTK uses the viewport-compatible middle pixel index, while CPU follows
  // the full displayed-area center used by canvas pixel transforms.
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
    rowOffset: Math.floor(dimensions[0] / 2) * spacing[0],
    columnOffset: Math.floor(dimensions[1] / 2) * spacing[1],
    rowsForFit: Math.max(image.rows - 1, 1),
    columnsForFit: Math.max(image.columns - 1, 1),
  });
}

/**
 * CPU fallback centers the image using the full displayed-area width/height
 * rather than the geometric center of the pixel-center lattice. This keeps
 * the semantic camera aligned with the actual CPU canvas transform.
 */
export function createPlanarCpuImageSliceBasis(args: {
  image: IImage;
  canvasWidth: number;
  canvasHeight: number;
}): PlanarSliceBasis {
  const { image } = args;
  const { dimensions, spacing } = getImageDataMetadata(image);

  return buildPlanarImageSliceBasis({
    ...args,
    rowOffset: (dimensions[0] * spacing[0]) / 2,
    columnOffset: (dimensions[1] * spacing[1]) / 2,
    rowsForFit: Math.max(image.rows, 1),
    columnsForFit: Math.max(image.columns, 1),
  });
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
 * Returns the world-space center of a volume, computed from the midpoint
 * of its index-space dimensions. Falls back to averaging the bounding-box
 * corners if vtkImageData is unavailable.
 */
function getGeometricImageVolumeCenter(imageVolume: IImageVolume): Point3 {
  const imageData = imageVolume.imageData;

  if (imageData) {
    const [dx, dy, dz] = imageData.getDimensions();

    return imageData.indexToWorld([
      (dx - 1) / 2,
      (dy - 1) / 2,
      (dz - 1) / 2,
    ]) as Point3;
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

function getViewportCompatibleImageVolumeCenter(
  imageVolume: IImageVolume
): Point3 {
  const imageData = imageVolume.imageData;

  if (imageData) {
    const [dx, dy, dz] = imageData.getDimensions();

    return imageData.indexToWorld([
      Math.floor(dx / 2),
      Math.floor(dy / 2),
      Math.floor(dz / 2),
    ]) as Point3;
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
 * Computes the min/max projections of a volume's corners onto the
 * viewPlaneNormal, along with the spacing between adjacent slices and
 * the maximum valid slice index.
 *
 * These metrics are used by `createPlanarVolumeSliceBasis` to position
 * the sliceCenterWorld at the correct depth for a given imageIdIndex.
 */
function getSliceMetrics(args: {
  imageVolume: IImageVolume;
  viewPlaneNormal: Point3;
}) {
  const { imageVolume, viewPlaneNormal } = args;
  const corners = buildImageVolumeCorners(imageVolume);
  const spacingInNormalDirection = Math.max(
    getSpacingInNormalDirection(imageVolume, viewPlaneNormal),
    MIN_SLICE_SPACING
  );

  if (!corners.length) {
    return {
      min: 0,
      max: 0,
      spacingInNormalDirection,
      maxImageIdIndex: 0,
    };
  }

  const projectedValues = corners.map((corner) =>
    vec3.dot(corner as unknown as vec3, viewPlaneNormal as unknown as vec3)
  );
  const min = Math.min(...projectedValues);
  const max = Math.max(...projectedValues);
  const maxImageIdIndex = Math.max(
    0,
    Math.round((max - min) / spacingInNormalDirection)
  );

  return {
    min,
    max,
    spacingInNormalDirection,
    maxImageIdIndex,
  };
}

/**
 * Clamps an imageIdIndex to [0, maxImageIdIndex]. If the index is undefined
 * (no slice has been selected yet), defaults to the middle slice.
 */
function clampImageIdIndex(
  imageIdIndex: number | undefined,
  maxImageIdIndex: number
): number {
  if (typeof imageIdIndex !== 'number') {
    return Math.round(maxImageIdIndex / 2);
  }

  return Math.min(Math.max(0, imageIdIndex), maxImageIdIndex);
}

export function resolvePlanarVolumeImageIdIndex(args: {
  camera?: PlanarCamera;
  fallbackImageIdIndex?: number;
}): number | undefined {
  const { camera, fallbackImageIdIndex } = args;

  if (typeof camera?.imageIdIndex === 'number') {
    return camera.imageIdIndex;
  }

  if (camera?.orientation === OrientationAxis.ACQUISITION) {
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
function getCpuVolumeParallelScale(args: {
  imageVolume: IImageVolume;
  viewPlaneNormal: Point3;
  viewUp: Point3;
  canvasWidth: number;
  canvasHeight: number;
}) {
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
    return getCpuEquivalentParallelScale({
      canvasHeight: getSafeCanvasDimension(canvasHeight),
      canvasWidth: getSafeCanvasDimension(canvasWidth),
      columnPixelSpacing: geometry.columnPixelSpacing,
      columns: Math.max(geometry.columns, 1),
      rowPixelSpacing: geometry.rowPixelSpacing,
      rows: Math.max(geometry.rows, 1),
    });
  }

  const imageData = imageVolume.imageData;

  if (imageData) {
    let { widthWorld, heightWorld } = getCubeSizeInView(
      imageData,
      viewPlaneNormal,
      viewUp
    );
    const spacing = imageData.getSpacing();
    const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
    const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);

    if (widthWorld > 0 && heightWorld > 0) {
      const boundsAspectRatio = widthWorld / heightWorld;
      const canvasAspectRatio = safeCanvasWidth / safeCanvasHeight;
      const scaleFactor = boundsAspectRatio / canvasAspectRatio;

      return scaleFactor < 1
        ? heightWorld / 2
        : (heightWorld * scaleFactor) / 2;
    }
  }

  return MIN_CAMERA_DISTANCE;
}

function getPlanarVolumeParallelScale(args: {
  imageVolume: IImageVolume;
  viewPlaneNormal: Point3;
  viewUp: Point3;
  canvasWidth: number;
  canvasHeight: number;
}) {
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
    return getCpuEquivalentParallelScale({
      canvasHeight: getSafeCanvasDimension(canvasHeight),
      canvasWidth: getSafeCanvasDimension(canvasWidth),
      columnPixelSpacing: geometry.columnPixelSpacing,
      columns: Math.max(geometry.columns - 1, 1),
      rowPixelSpacing: geometry.rowPixelSpacing,
      rows: Math.max(geometry.rows - 1, 1),
    });
  }

  const imageData = imageVolume.imageData;

  if (imageData) {
    let { widthWorld, heightWorld } = getCubeSizeInView(
      imageData,
      viewPlaneNormal,
      viewUp
    );
    const spacing = imageData.getSpacing();
    const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
    const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);

    widthWorld = Math.max(spacing[0], widthWorld - spacing[0]);
    heightWorld = Math.max(spacing[1], heightWorld - spacing[1]);

    if (widthWorld > 0 && heightWorld > 0) {
      const boundsAspectRatio = widthWorld / heightWorld;
      const canvasAspectRatio = safeCanvasWidth / safeCanvasHeight;
      const scaleFactor = boundsAspectRatio / canvasAspectRatio;

      return scaleFactor < 1
        ? heightWorld / 2
        : (heightWorld * scaleFactor) / 2;
    }
  }

  return MIN_CAMERA_DISTANCE;
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
  orientation?: PlanarCamera['orientation'];
  center: Point3;
  fitParallelScale: number;
}): {
  sliceBasis: PlanarSliceBasis;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
} {
  const {
    canvasWidth,
    canvasHeight,
    center,
    fitParallelScale,
    imageIdIndex,
    imageVolume,
    orientation,
  } = args;
  const cameraValues = getPlanarCameraVectors({
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
        cameraDistance: MIN_CAMERA_DISTANCE,
      },
      currentImageIdIndex: 0,
      maxImageIdIndex: 0,
    };
  }

  const viewPlaneNormal = normalizePoint3(cameraValues.viewPlaneNormal);
  const viewUp = normalizePoint3(cameraValues.viewUp);
  const { max, maxImageIdIndex, min, spacingInNormalDirection } =
    getSliceMetrics({
      imageVolume,
      viewPlaneNormal,
    });
  const currentImageIdIndex = clampImageIdIndex(imageIdIndex, maxImageIdIndex);

  // Project volume center onto the viewing direction to compute the
  // scalar offset needed to reach the target slice depth.
  const centerProjection = vec3.dot(
    center as unknown as vec3,
    viewPlaneNormal as unknown as vec3
  );
  const targetProjection = Math.min(
    max,
    min + currentImageIdIndex * spacingInNormalDirection
  );
  const scalarOffset = targetProjection - centerProjection;
  const sliceCenterWorld = vec3.scaleAndAdd(
    vec3.create(),
    center as unknown as vec3,
    viewPlaneNormal as unknown as vec3,
    scalarOffset
  ) as Point3;

  // cameraDistance spans the full volume depth so the clipping range
  // can capture the entire volume when needed.
  const cameraDistance = Math.max(max - min, spacingInNormalDirection, 1);

  return {
    sliceBasis: {
      sliceCenterWorld,
      viewPlaneNormal,
      viewUp,
      fitParallelScale,
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
  orientation?: PlanarCamera['orientation'];
}): {
  sliceBasis: PlanarSliceBasis;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
} {
  const { imageVolume, orientation } = args;
  const cameraValues = getPlanarCameraVectors({
    imageVolume,
    orientation,
  });

  return buildPlanarVolumeSliceBasis({
    ...args,
    center: getViewportCompatibleImageVolumeCenter(imageVolume),
    fitParallelScale: cameraValues
      ? getPlanarVolumeParallelScale({
          ...args,
          viewPlaneNormal: cameraValues.viewPlaneNormal,
          viewUp: cameraValues.viewUp,
        })
      : MIN_CAMERA_DISTANCE,
  });
}

export function createPlanarCpuVolumeSliceBasis(args: {
  canvasWidth: number;
  canvasHeight: number;
  imageIdIndex?: number;
  imageVolume: IImageVolume;
  orientation?: PlanarCamera['orientation'];
}): {
  sliceBasis: PlanarSliceBasis;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
} {
  const { imageVolume, orientation } = args;
  const cameraValues = getPlanarCameraVectors({
    imageVolume,
    orientation,
  });

  return buildPlanarVolumeSliceBasis({
    ...args,
    center: getGeometricImageVolumeCenter(imageVolume),
    fitParallelScale: cameraValues
      ? getCpuVolumeParallelScale({
          ...args,
          viewPlaneNormal: cameraValues.viewPlaneNormal,
          viewUp: cameraValues.viewUp,
        })
      : MIN_CAMERA_DISTANCE,
  });
}
