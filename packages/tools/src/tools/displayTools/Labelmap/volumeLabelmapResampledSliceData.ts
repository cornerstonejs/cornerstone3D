import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { Enums, type Types, utilities } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import {
  createSliceImageData,
  getSliceRenderingCamera,
  getVolumeAxes,
  matchAxis,
  type SliceRenderingViewport,
} from './volumeLabelmapSliceData';

const MAX_RESAMPLED_SLICE_SIZE = 2048;
const SLICE_INDEX_EPSILON = 1e-6;
const MINIMUM_PLANE_INTERSECTION_POINTS = 3;
const EXACT_SLICE_ALIGNMENT = 1 - 1e-8;

type ResampledSliceGeometry = {
  origin: Types.Point3;
  xDirection: Types.Point3;
  yDirection: Types.Point3;
  zDirection: Types.Point3;
  spacing: Types.Point2;
  width: number;
  height: number;
  sliceIndex: number;
};

type PlanarSliceImageData = {
  imageData: vtkImageData;
  sliceIndex: number;
};

/**
 * Returns an empty vector that holds double precision numbers. A vector from
 * vec3.create() holds single precision, which is too coarse for a world
 * position and for the test of an exact alignment.
 */
function createVector(): vec3 {
  return [0, 0, 0] as unknown as vec3;
}

/**
 * Returns the volume axis that the view normal follows so closely that the
 * view plane stays inside one slice of voxels across the whole volume.
 * Returns undefined for any other view, also for a view with a small tilt
 * against the slices, which has to be sampled on its own plane.
 */
function getExactSliceAxis(
  volume: Types.IImageVolume,
  viewPlaneNormal: Types.Point3
): number | undefined {
  const axes = getVolumeAxes(volume);
  const sliceAxis = matchAxis(viewPlaneNormal, axes);

  if (!sliceAxis) {
    return;
  }

  const axisDirection = axes[sliceAxis.axis] as unknown as vec3;
  const alignment =
    Math.abs(vec3.dot(viewPlaneNormal as unknown as vec3, axisDirection)) /
    (vec3.length(viewPlaneNormal as unknown as vec3) *
      vec3.length(axisDirection));

  return alignment >= EXACT_SLICE_ALIGNMENT ? sliceAxis.axis : undefined;
}

/**
 * Returns the point reached from a start point after a step along a direction.
 */
function stepAlong(
  start: Types.Point3,
  direction: Types.Point3,
  distance: number
): Types.Point3 {
  return vec3.scaleAndAdd(
    createVector(),
    start as unknown as vec3,
    direction as unknown as vec3,
    distance
  ) as Types.Point3;
}

/**
 * Returns the points where a plane crosses the edges of the box that holds
 * every voxel of the volume. Fewer than three points mean that the plane does
 * not cut the volume.
 */
function getPlaneVolumeIntersectionPoints(
  volume: Types.IImageVolume,
  planePoint: Types.Point3,
  planeNormal: Types.Point3
): Types.Point3[] {
  const { dimensions, imageData } = volume;
  const corners: Types.Point3[] = [];
  const distances: number[] = [];

  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
    const corner = utilities.transformIndexToWorld(imageData, [
      cornerIndex & 1 ? dimensions[0] - 0.5 : -0.5,
      cornerIndex & 2 ? dimensions[1] - 0.5 : -0.5,
      cornerIndex & 4 ? dimensions[2] - 0.5 : -0.5,
    ]) as Types.Point3;

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

  const points: Types.Point3[] = [];

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
          ) as Types.Point3
        );
      }
    }
  }

  return points;
}

/**
 * Geometry of the slice when the view normal follows a volume axis but the
 * view is rotated in its own plane. The slice keeps the voxel grid of the
 * volume, so its pixels are an exact copy of one slice of voxels. Each row of
 * the slice runs along the lower of the two volume axes of the plane, so that
 * a row is read from one slice image where that is possible. The rows are in
 * the order that gives the image the same handedness as an aligned slice.
 */
function getInPlaneRotatedSliceGeometry(
  volume: Types.IImageVolume,
  focalPoint: Types.Point3,
  viewPlaneNormal: Types.Point3,
  sliceAxis: number
): ResampledSliceGeometry | undefined {
  const { dimensions, imageData, spacing } = volume;
  const axes = getVolumeAxes(volume);
  const continuousIndex = utilities.transformWorldToIndexContinuous(
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
  const originIndex: Types.Point3 = [0, 0, 0];

  originIndex[sliceAxis] = sliceIndex;
  originIndex[yAxis] = rowsFollowAxis ? 0 : dimensions[yAxis] - 1;

  return {
    origin: utilities.transformIndexToWorld(
      imageData,
      originIndex
    ) as Types.Point3,
    xDirection: axes[xAxis],
    yDirection: rowsFollowAxis
      ? axes[yAxis]
      : (vec3.negate(
          createVector(),
          axes[yAxis] as unknown as vec3
        ) as Types.Point3),
    zDirection: viewPlaneNormal,
    spacing: [spacing[xAxis], spacing[yAxis]],
    width: dimensions[xAxis],
    height: dimensions[yAxis],
    sliceIndex,
  };
}

/**
 * Geometry of the slice when the view plane is oblique to the volume. The
 * slice covers the part of the view plane that cuts the volume, with a pixel
 * size close to the voxel size along each direction of the plane. Each row of
 * the slice is the line where the view plane meets one slice of the volume,
 * so a row is read from one slice image, which keeps the reads close together
 * in memory. The rows depend only on the plane, so the slice stays the same
 * when the view turns in its own plane.
 */
function getObliqueSliceGeometry(
  volume: Types.IImageVolume,
  focalPoint: Types.Point3,
  viewPlaneNormal: Types.Point3
): ResampledSliceGeometry | undefined {
  const { dimensions, imageData } = volume;
  const sliceAxisDirection = getVolumeAxes(volume)[2];
  const xDirection = vec3.normalize(
    createVector(),
    vec3.cross(
      createVector(),
      sliceAxisDirection as unknown as vec3,
      viewPlaneNormal as unknown as vec3
    )
  ) as Types.Point3;
  const yDirection = vec3.normalize(
    createVector(),
    vec3.cross(
      createVector(),
      xDirection as unknown as vec3,
      viewPlaneNormal as unknown as vec3
    )
  ) as Types.Point3;
  const points = getPlaneVolumeIntersectionPoints(
    volume,
    focalPoint,
    viewPlaneNormal
  );

  if (points.length < MINIMUM_PLANE_INTERSECTION_POINTS) {
    return;
  }

  const extent = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };

  points.forEach((point) => {
    const offset = vec3.subtract(
      createVector(),
      point as unknown as vec3,
      focalPoint as unknown as vec3
    );
    const x = vec3.dot(offset, xDirection as unknown as vec3);
    const y = vec3.dot(offset, yDirection as unknown as vec3);

    extent.minX = Math.min(extent.minX, x);
    extent.maxX = Math.max(extent.maxX, x);
    extent.minY = Math.min(extent.minY, y);
    extent.maxY = Math.max(extent.maxY, y);
  });

  const extentX = extent.maxX - extent.minX;
  const extentY = extent.maxY - extent.minY;
  const width = Math.min(
    MAX_RESAMPLED_SLICE_SIZE,
    Math.max(
      1,
      Math.ceil(
        extentX /
          utilities.getEffectiveSpacingAlongDirection(volume, xDirection)
      )
    )
  );
  const height = Math.min(
    MAX_RESAMPLED_SLICE_SIZE,
    Math.max(
      1,
      Math.ceil(
        extentY /
          utilities.getEffectiveSpacingAlongDirection(volume, yDirection)
      )
    )
  );
  const pixelSpacing: Types.Point2 = [extentX / width, extentY / height];

  if (!(pixelSpacing[0] > 0) || !(pixelSpacing[1] > 0)) {
    return;
  }

  const origin = stepAlong(
    stepAlong(focalPoint, xDirection, extent.minX + pixelSpacing[0] / 2),
    yDirection,
    extent.minY + pixelSpacing[1] / 2
  );
  const continuousIndex = utilities.transformWorldToIndexContinuous(
    imageData,
    focalPoint
  );

  return {
    origin,
    xDirection,
    yDirection,
    zDirection: viewPlaneNormal,
    spacing: pixelSpacing,
    width,
    height,
    sliceIndex: Math.min(
      Math.max(Math.round(continuousIndex[2]), 0),
      dimensions[2] - 1
    ),
  };
}

/**
 * Returns the geometry of the labelmap slice for a view that is not aligned
 * with the rows and columns of the volume, or undefined when the view plane
 * does not cut the volume.
 */
function getResampledSliceGeometry(
  viewport: SliceRenderingViewport,
  volume: Types.IImageVolume
): ResampledSliceGeometry | undefined {
  const camera = getSliceRenderingCamera(viewport);

  if (!camera) {
    return;
  }

  const viewPlaneNormal = vec3.normalize(
    createVector(),
    camera.viewPlaneNormal as unknown as vec3
  ) as Types.Point3;
  const sliceAxis = getExactSliceAxis(volume, viewPlaneNormal);

  if (sliceAxis !== undefined) {
    return getInPlaneRotatedSliceGeometry(
      volume,
      camera.focalPoint,
      viewPlaneNormal,
      sliceAxis
    );
  }

  return getObliqueSliceGeometry(volume, camera.focalPoint, viewPlaneNormal);
}

/**
 * Fills the pixels of the slice with the value of the nearest voxel, through
 * the volume grid sampler of the core that the CPU volume rendering also uses.
 * A pixel outside the volume gets the value 0.
 */
function sampleResampledSlice(
  volume: Types.IImageVolume,
  geometry: ResampledSliceGeometry
): Types.PixelDataTypedArray {
  const { imageData, voxelManager } = volume;
  const { origin, xDirection, yDirection, spacing, width, height } = geometry;
  const SliceDataConstructor = voxelManager.getConstructor();
  const pixelData = new SliceDataConstructor(width * height);
  const startIndex = utilities.transformWorldToIndexContinuous(
    imageData,
    origin
  );
  const afterColumn = utilities.transformWorldToIndexContinuous(
    imageData,
    stepAlong(origin, xDirection, spacing[0])
  );
  const afterRow = utilities.transformWorldToIndexContinuous(
    imageData,
    stepAlong(origin, yDirection, spacing[1])
  );

  utilities.sampleVolumeGrid({
    volume,
    pixelData,
    width,
    height,
    startIndex,
    columnStep: [0, 1, 2].map(
      (axis) => afterColumn[axis] - startIndex[axis]
    ) as Types.Point3,
    rowStep: [0, 1, 2].map(
      (axis) => afterRow[axis] - startIndex[axis]
    ) as Types.Point3,
    interpolationType: Enums.InterpolationType.NEAREST,
  });

  return pixelData;
}

/**
 * Creates the labelmap slice image for a view that is not aligned with the
 * rows and columns of the volume: a view rotated in its own plane, or an
 * oblique view. The image lies in the view plane, in world coordinates.
 */
function createResampledSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport
): PlanarSliceImageData | undefined {
  const geometry = getResampledSliceGeometry(viewport, volume);

  if (!geometry) {
    return;
  }

  const pixelData = sampleResampledSlice(volume, geometry);
  const dataType = vtkDataArray.getDataType(pixelData as never);
  const scalarArray = vtkDataArray.newInstance({
    dataType,
    name: 'Pixels',
    numberOfComponents: 1,
    values: pixelData,
  });
  const imageData = vtkImageData.newInstance();

  imageData.set({ dataType, numberOfComponents: 1 }, true);
  imageData.setDimensions(geometry.width, geometry.height, 1);
  imageData.setSpacing([geometry.spacing[0], geometry.spacing[1], 1]);
  imageData.setDirection(
    new Float32Array([
      ...geometry.xDirection,
      ...geometry.yDirection,
      ...geometry.zDirection,
    ])
  );
  imageData.setOrigin(geometry.origin);
  imageData.getPointData().setScalars(scalarArray);
  imageData.modified();

  return {
    imageData,
    sliceIndex: geometry.sliceIndex,
  };
}

/**
 * Whether the view plane of the viewport stays inside one slice of voxels of
 * the volume, so that a copy of that slice is exact.
 */
function isViewOnVoxelSlice(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport
): boolean {
  const camera = getSliceRenderingCamera(viewport);

  return (
    !!camera && getExactSliceAxis(volume, camera.viewPlaneNormal) !== undefined
  );
}

/**
 * Creates the labelmap slice image for a planar viewport. A view aligned with
 * the rows and columns of the volume copies one slice of voxels. Any other
 * view takes the nearest voxel for each pixel of the view plane, also a view
 * with a small tilt that the aligned copy would accept.
 */
function createPlanarSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport
): PlanarSliceImageData | undefined {
  const alignedSlice = isViewOnVoxelSlice(volume, viewport)
    ? createSliceImageData(volume, viewport)
    : undefined;

  if (alignedSlice) {
    return {
      imageData: alignedSlice.imageData,
      sliceIndex: alignedSlice.state.sliceIndex,
    };
  }

  return createResampledSliceImageData(volume, viewport);
}

/**
 * Whether a planar viewport can show a labelmap slice of the volume in a view
 * that is not aligned with the rows and columns of the volume.
 */
function canCreateResampledSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport
): boolean {
  return !!getResampledSliceGeometry(viewport, volume);
}

export {
  canCreateResampledSliceImageData,
  createPlanarSliceImageData,
  createResampledSliceImageData,
  getResampledSliceGeometry,
};
export type { PlanarSliceImageData, ResampledSliceGeometry };
