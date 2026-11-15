import { vec3 } from 'gl-matrix';
import type { ICamera, IImageVolume, Point2, Point3 } from '../types';
import getEffectiveSpacingAlongDirection from './getEffectiveSpacingAlongDirection';
import transformIndexToWorld from './transformIndexToWorld';
import { transformWorldToIndexContinuous } from './transformWorldToIndex';

const DEFAULT_MAX_SLICE_SIZE = 2048;
const SLICE_INDEX_EPSILON = 1e-6;
const MINIMUM_PLANE_INTERSECTION_POINTS = 3;
const EXACT_SLICE_ALIGNMENT = 1 - 1e-8;

type VolumeSliceCamera = Pick<
  ICamera,
  'focalPoint' | 'viewPlaneNormal' | 'viewUp'
>;

type VolumeSliceGeometry = {
  /** World position of the centre of the first pixel. */
  origin: Point3;
  /** Unit vector along a row of the slice. */
  xDirection: Point3;
  /** Unit vector from one row to the next. */
  yDirection: Point3;
  /** Unit vector along the view plane normal. */
  zDirection: Point3;
  /** World size of one pixel along x and along y. */
  spacing: Point2;
  width: number;
  height: number;
  /** Index of the nearest slice of voxels, as the labelmap code computes it today. */
  sliceIndex: number;
};

type VolumeSliceGeometryOptions = {
  /**
   * When the view normal follows a volume axis: true puts the slice on the centre of the
   * nearest slice of voxels (what labelmaps do today), false keeps it on the plane of
   * the focal point. Default true.
   */
  snapToSlice?: boolean;
  /** World size of a pixel of an oblique slice. Default: the voxel size along each direction. */
  pixelSpacing?: number;
  /** Largest width or height in pixels. Default 2048. */
  maxSize?: number;
};

type SliceVolume = Pick<
  IImageVolume,
  'dimensions' | 'direction' | 'spacing' | 'imageData'
>;

/**
 * Returns an empty vector that holds double precision numbers. A vector from
 * vec3.create() holds single precision, which is too coarse for a world
 * position and for the test of an exact alignment.
 */
function createVector(): vec3 {
  return [0, 0, 0] as unknown as vec3;
}

/**
 * Returns the unit vectors of the volume axes i, j and k in world space.
 */
function getVolumeAxes(volume: SliceVolume): Point3[] {
  const { direction } = volume;

  return [
    [direction[0], direction[1], direction[2]],
    [direction[3], direction[4], direction[5]],
    [direction[6], direction[7], direction[8]],
  ] as Point3[];
}

/**
 * Returns the volume axis that the view normal follows so closely that the
 * view plane stays inside one slice of voxels across the whole volume.
 * Returns undefined for any other view, also for a view with a small tilt
 * against the slices, which has to be sampled on its own plane. The view
 * normal does not need to be a unit vector.
 *
 * The candidate is the axis with the largest absolute dot product with the
 * normal, and it is accepted when the normalized dot product of the two is at
 * least EXACT_SLICE_ALIGNMENT. The other axes are not tested, so a volume
 * whose axes are not orthogonal still has a slice axis.
 */
function getExactSliceAxis(
  volume: SliceVolume,
  viewPlaneNormal: Point3
): number | undefined {
  const normal = vec3.normalize(
    createVector(),
    viewPlaneNormal as unknown as vec3
  );
  const axes = getVolumeAxes(volume);
  const dots = axes.map((axis) =>
    Math.abs(vec3.dot(normal, axis as unknown as vec3))
  );
  const sliceAxis = dots.indexOf(Math.max(...dots));
  const axisLength = vec3.length(axes[sliceAxis] as unknown as vec3);

  if (!(dots[sliceAxis] > 0) || !(axisLength > 0)) {
    return;
  }

  return dots[sliceAxis] / axisLength >= EXACT_SLICE_ALIGNMENT
    ? sliceAxis
    : undefined;
}

/**
 * Returns the point reached from a start point after a step along a direction.
 */
function stepAlong(start: Point3, direction: Point3, distance: number): Point3 {
  return vec3.scaleAndAdd(
    createVector(),
    start as unknown as vec3,
    direction as unknown as vec3,
    distance
  ) as Point3;
}

/**
 * Returns the points where a plane crosses the edges of the box that holds
 * every voxel of the volume. Fewer than three points mean that the plane does
 * not cut the volume.
 */
function getPlaneVolumeIntersectionPoints(
  volume: SliceVolume,
  planePoint: Point3,
  planeNormal: Point3
): Point3[] {
  const { dimensions, imageData } = volume;
  const corners: Point3[] = [];
  const distances: number[] = [];

  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
    const corner = transformIndexToWorld(imageData, [
      cornerIndex & 1 ? dimensions[0] - 0.5 : -0.5,
      cornerIndex & 2 ? dimensions[1] - 0.5 : -0.5,
      cornerIndex & 4 ? dimensions[2] - 0.5 : -0.5,
    ]) as Point3;

    corners.push(corner);
    distances.push(
      vec3.dot(
        vec3.subtract(
          createVector(),
          corner as unknown as vec3,
          planePoint as unknown as vec3
        ),
        planeNormal as unknown as vec3
      )
    );
  }

  const points: Point3[] = [];

  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
    for (let axisBit = 1; axisBit <= 4; axisBit <<= 1) {
      if (cornerIndex & axisBit) {
        continue;
      }

      const otherIndex = cornerIndex | axisBit;
      const startDistance = distances[cornerIndex];
      const endDistance = distances[otherIndex];

      if (startDistance === 0) {
        points.push(corners[cornerIndex]);
      }

      if (endDistance === 0) {
        points.push(corners[otherIndex]);
      }

      if (startDistance * endDistance < 0) {
        points.push(
          vec3.lerp(
            createVector(),
            corners[cornerIndex] as unknown as vec3,
            corners[otherIndex] as unknown as vec3,
            startDistance / (startDistance - endDistance)
          ) as Point3
        );
      }
    }
  }

  return points;
}

/**
 * Geometry of the slice when the view normal follows a volume axis. The slice
 * keeps the voxel grid of the volume, so with snapToSlice its pixels are an
 * exact copy of one slice of voxels. Without snapToSlice the slice keeps the
 * same rows and columns but lies on the plane through the focal point. Each
 * row of the slice runs along the lower of the two volume axes of the plane,
 * so that a row is read from one slice image where that is possible. The rows
 * are in the order that gives the image the same handedness as an aligned
 * slice. The view may be rotated in its own plane, the slice does not follow.
 */
function getAxisSliceGeometry(
  volume: SliceVolume,
  focalPoint: Point3,
  viewPlaneNormal: Point3,
  sliceAxis: number,
  snapToSlice: boolean
): VolumeSliceGeometry | undefined {
  const { dimensions, imageData, spacing } = volume;
  const axes = getVolumeAxes(volume);
  const continuousIndex = transformWorldToIndexContinuous(
    imageData,
    focalPoint
  );
  const sliceIndex = Math.floor(
    continuousIndex[sliceAxis] + 0.5 - SLICE_INDEX_EPSILON
  );

  if (sliceIndex < 0 || sliceIndex >= dimensions[sliceAxis]) {
    return;
  }

  const [xAxis, yAxis] = [0, 1, 2].filter((axis) => axis !== sliceAxis);
  const handedness = vec3.dot(
    vec3.cross(
      createVector(),
      axes[xAxis] as unknown as vec3,
      axes[yAxis] as unknown as vec3
    ),
    viewPlaneNormal as unknown as vec3
  );
  const rowsFollowAxis = handedness < 0;
  const originIndex: Point3 = [0, 0, 0];

  originIndex[sliceAxis] = snapToSlice
    ? sliceIndex
    : continuousIndex[sliceAxis];
  originIndex[yAxis] = rowsFollowAxis ? 0 : dimensions[yAxis] - 1;

  return {
    origin: transformIndexToWorld(imageData, originIndex) as Point3,
    xDirection: axes[xAxis],
    yDirection: rowsFollowAxis
      ? axes[yAxis]
      : (vec3.negate(createVector(), axes[yAxis] as unknown as vec3) as Point3),
    zDirection: viewPlaneNormal,
    spacing: [spacing[xAxis], spacing[yAxis]],
    width: dimensions[xAxis],
    height: dimensions[yAxis],
    sliceIndex,
  };
}

/**
 * Returns the number of pixels that cover an extent with pixels of about the
 * given size, at least one and at most maxSize.
 */
function getPixelCount(
  extent: number,
  pixelSize: number,
  maxSize: number
): number {
  return Math.min(maxSize, Math.max(1, Math.ceil(extent / pixelSize)));
}

/**
 * Geometry of the slice when the view plane is oblique to the volume. The
 * slice covers the part of the view plane that cuts the volume, with a pixel
 * size close to pixelSpacing, or to the voxel size along each direction of the
 * plane when pixelSpacing is not given. Each row of the slice is the line
 * where the view plane meets one slice of the volume, so a row is read from
 * one slice image, which keeps the reads close together in memory. The rows
 * depend only on the plane, so the slice stays the same when the view turns
 * in its own plane.
 */
function getObliqueSliceGeometry(
  volume: SliceVolume,
  focalPoint: Point3,
  viewPlaneNormal: Point3,
  pixelSpacing: number | undefined,
  maxSize: number
): VolumeSliceGeometry | undefined {
  const { dimensions, imageData } = volume;
  const sliceAxisDirection = getVolumeAxes(volume)[2];
  const xDirection = vec3.normalize(
    createVector(),
    vec3.cross(
      createVector(),
      sliceAxisDirection as unknown as vec3,
      viewPlaneNormal as unknown as vec3
    )
  ) as Point3;
  const yDirection = vec3.normalize(
    createVector(),
    vec3.cross(
      createVector(),
      xDirection as unknown as vec3,
      viewPlaneNormal as unknown as vec3
    )
  ) as Point3;
  const points = getPlaneVolumeIntersectionPoints(
    volume,
    focalPoint,
    viewPlaneNormal
  );

  if (points.length < MINIMUM_PLANE_INTERSECTION_POINTS) {
    return;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    const offset = vec3.subtract(
      createVector(),
      point as unknown as vec3,
      focalPoint as unknown as vec3
    );
    const x = vec3.dot(offset, xDirection as unknown as vec3);
    const y = vec3.dot(offset, yDirection as unknown as vec3);

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const width = getPixelCount(
    extentX,
    pixelSpacing ??
      getEffectiveSpacingAlongDirection(volume as IImageVolume, xDirection),
    maxSize
  );
  const height = getPixelCount(
    extentY,
    pixelSpacing ??
      getEffectiveSpacingAlongDirection(volume as IImageVolume, yDirection),
    maxSize
  );
  const spacing: Point2 = [extentX / width, extentY / height];

  if (!(spacing[0] > 0) || !(spacing[1] > 0)) {
    return;
  }

  const origin = stepAlong(
    stepAlong(focalPoint, xDirection, minX + spacing[0] / 2),
    yDirection,
    minY + spacing[1] / 2
  );
  const continuousIndex = transformWorldToIndexContinuous(
    imageData,
    focalPoint
  );

  return {
    origin,
    xDirection,
    yDirection,
    zDirection: viewPlaneNormal,
    spacing,
    width,
    height,
    sliceIndex: Math.min(
      Math.max(Math.round(continuousIndex[2]), 0),
      dimensions[2] - 1
    ),
  };
}

/**
 * Returns the geometry of the slice of a volume that lies in the view plane
 * of a camera: the world position of its first pixel, the directions of its
 * rows and columns, its pixel size and its size in pixels.
 *
 * When the view normal follows a volume axis, the slice keeps the voxel grid
 * of the volume: one pixel per voxel, whatever the rotation of the view in
 * its plane. snapToSlice (default true) puts it on the centre of the nearest
 * slice of voxels, so a nearest sample copies that slice. With snapToSlice
 * false it lies on the plane through the focal point, which a linear sample
 * between two slices of voxels needs.
 *
 * For any other view plane the slice covers the part of the plane that cuts
 * the volume. The pixel size is pixelSpacing, or by default the voxel size
 * along each direction of the plane, made a little smaller so that a whole
 * number of pixels covers the cut. Width and height are at most maxSize.
 *
 * World positions are computed in double precision.
 *
 * @returns The geometry, or undefined when the plane does not cut the volume.
 */
function getVolumeSliceGeometry(
  volume: IImageVolume,
  camera: VolumeSliceCamera,
  options: VolumeSliceGeometryOptions = {}
): VolumeSliceGeometry | undefined {
  const {
    snapToSlice = true,
    pixelSpacing,
    maxSize = DEFAULT_MAX_SLICE_SIZE,
  } = options;

  if (!camera?.focalPoint || !camera.viewPlaneNormal) {
    return;
  }

  const viewPlaneNormal = vec3.normalize(
    createVector(),
    camera.viewPlaneNormal as unknown as vec3
  ) as Point3;

  if (!(vec3.length(viewPlaneNormal as unknown as vec3) > 0)) {
    return;
  }

  const sliceAxis = getExactSliceAxis(volume, viewPlaneNormal);

  if (sliceAxis !== undefined) {
    return getAxisSliceGeometry(
      volume,
      camera.focalPoint,
      viewPlaneNormal,
      sliceAxis,
      snapToSlice
    );
  }

  return getObliqueSliceGeometry(
    volume,
    camera.focalPoint,
    viewPlaneNormal,
    pixelSpacing > 0 ? pixelSpacing : undefined,
    maxSize
  );
}

export {
  getVolumeSliceGeometry as default,
  getVolumeSliceGeometry,
  getExactSliceAxis,
};
export type {
  VolumeSliceCamera,
  VolumeSliceGeometry,
  VolumeSliceGeometryOptions,
};
