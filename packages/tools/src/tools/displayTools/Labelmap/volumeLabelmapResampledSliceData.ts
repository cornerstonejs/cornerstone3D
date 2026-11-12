import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { cache, type Types, utilities } from '@cornerstonejs/core';
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

type SliceArray = Types.PixelDataTypedArray | null;

/**
 * Returns the point reached from a start point after a step along a direction.
 */
function stepAlong(
  start: Types.Point3,
  direction: Types.Point3,
  distance: number
): Types.Point3 {
  return vec3.scaleAndAdd(
    vec3.create(),
    start as unknown as vec3,
    direction as unknown as vec3,
    distance
  ) as Types.Point3;
}

/**
 * Returns the distance along a world direction that crosses one voxel of the
 * volume. Along a volume axis this is the spacing of that axis.
 */
function getSpacingAlongDirection(
  direction: Types.Point3,
  axes: Types.Point3[],
  spacing: Types.Point3
): number {
  let squaredVoxelsPerUnit = 0;

  axes.forEach((axis, axisIndex) => {
    const voxelsPerUnit =
      vec3.dot(direction as unknown as vec3, axis as unknown as vec3) /
      spacing[axisIndex];

    squaredVoxelsPerUnit += voxelsPerUnit * voxelsPerUnit;
  });

  return 1 / Math.sqrt(squaredVoxelsPerUnit);
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
          vec3.create(),
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
            vec3.create(),
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
 * volume, so its pixels are an exact copy of one slice of voxels.
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

  const inPlaneAxes = [0, 1, 2].filter((axis) => axis !== sliceAxis);
  const handedness = vec3.dot(
    vec3.cross(
      vec3.create(),
      axes[inPlaneAxes[0]] as unknown as vec3,
      axes[inPlaneAxes[1]] as unknown as vec3
    ),
    viewPlaneNormal as unknown as vec3
  );
  const [xAxis, yAxis] = handedness < 0 ? inPlaneAxes : inPlaneAxes.reverse();
  const originIndex: Types.Point3 = [0, 0, 0];

  originIndex[sliceAxis] = sliceIndex;

  return {
    origin: utilities.transformIndexToWorld(
      imageData,
      originIndex
    ) as Types.Point3,
    xDirection: axes[xAxis],
    yDirection: axes[yAxis],
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
 * size close to the voxel size along each direction of the plane. The columns
 * of the slice follow the volume axis that lies closest to the view plane, so
 * the slice stays the same when the view turns in its own plane.
 */
function getObliqueSliceGeometry(
  volume: Types.IImageVolume,
  focalPoint: Types.Point3,
  viewPlaneNormal: Types.Point3
): ResampledSliceGeometry | undefined {
  const { dimensions, imageData, spacing } = volume;
  const axes = getVolumeAxes(volume);
  const alignment = (axis: Types.Point3) =>
    Math.abs(
      vec3.dot(axis as unknown as vec3, viewPlaneNormal as unknown as vec3)
    );
  const closestAxis = axes.reduce((closest, axis) =>
    alignment(axis) < alignment(closest) ? axis : closest
  );
  const xDirection = vec3.normalize(
    vec3.create(),
    vec3.scaleAndAdd(
      vec3.create(),
      closestAxis as unknown as vec3,
      viewPlaneNormal as unknown as vec3,
      -vec3.dot(
        closestAxis as unknown as vec3,
        viewPlaneNormal as unknown as vec3
      )
    )
  ) as Types.Point3;
  const yDirection = vec3.normalize(
    vec3.create(),
    vec3.cross(
      vec3.create(),
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
      vec3.create(),
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
      Math.ceil(extentX / getSpacingAlongDirection(xDirection, axes, spacing))
    )
  );
  const height = Math.min(
    MAX_RESAMPLED_SLICE_SIZE,
    Math.max(
      1,
      Math.ceil(extentY / getSpacingAlongDirection(yDirection, axes, spacing))
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
    vec3.create(),
    camera.viewPlaneNormal as unknown as vec3
  ) as Types.Point3;
  const sliceAxis = matchAxis(viewPlaneNormal, getVolumeAxes(volume));

  if (sliceAxis) {
    return getInPlaneRotatedSliceGeometry(
      volume,
      camera.focalPoint,
      viewPlaneNormal,
      sliceAxis.axis
    );
  }

  return getObliqueSliceGeometry(volume, camera.focalPoint, viewPlaneNormal);
}

/**
 * Returns the pixel array of one slice image of the volume when the image
 * keeps its voxels in a typed array of the size of the slice. Returns null
 * for an image that is missing, that stores its voxels another way, or that
 * has a different size, so that the caller reads those voxels one at a time.
 */
function getSliceArray(
  volume: Types.IImageVolume,
  sliceIndex: number
): SliceArray {
  const imageId = volume.imageIds?.[sliceIndex];

  if (!imageId) {
    return null;
  }

  const scalarData = cache
    .getImage(imageId)
    ?.voxelManager?.getWritableScalarData?.();

  return scalarData?.length === volume.dimensions[0] * volume.dimensions[1]
    ? scalarData
    : null;
}

/**
 * Fills the pixels of the slice with the value of the nearest voxel. A pixel
 * outside the volume keeps the value 0.
 */
function sampleResampledSlice(
  volume: Types.IImageVolume,
  geometry: ResampledSliceGeometry
): Types.PixelDataTypedArray {
  const { dimensions, imageData, voxelManager } = volume;
  const [columns, rows, slices] = dimensions;
  const { origin, xDirection, yDirection, spacing, width, height } = geometry;
  const SliceDataConstructor = voxelManager.getConstructor();
  const pixelData = new SliceDataConstructor(width * height);
  const start = utilities.transformWorldToIndexContinuous(imageData, origin);
  const afterColumn = utilities.transformWorldToIndexContinuous(
    imageData,
    stepAlong(origin, xDirection, spacing[0])
  );
  const afterRow = utilities.transformWorldToIndexContinuous(
    imageData,
    stepAlong(origin, yDirection, spacing[1])
  );
  const columnStep = [0, 1, 2].map((axis) => afterColumn[axis] - start[axis]);
  const rowStep = [0, 1, 2].map((axis) => afterRow[axis] - start[axis]);
  const sliceArrays = new Array<SliceArray | undefined>(slices);

  for (let row = 0; row < height; row++) {
    let i = start[0] + row * rowStep[0] + 0.5;
    let j = start[1] + row * rowStep[1] + 0.5;
    let k = start[2] + row * rowStep[2] + 0.5;
    const rowOffset = row * width;

    for (let column = 0; column < width; column++) {
      const voxelI = Math.floor(i);
      const voxelJ = Math.floor(j);
      const voxelK = Math.floor(k);

      if (
        voxelI >= 0 &&
        voxelI < columns &&
        voxelJ >= 0 &&
        voxelJ < rows &&
        voxelK >= 0 &&
        voxelK < slices
      ) {
        let sliceArray = sliceArrays[voxelK];

        if (sliceArray === undefined) {
          sliceArray = getSliceArray(volume, voxelK);
          sliceArrays[voxelK] = sliceArray;
        }

        pixelData[rowOffset + column] = sliceArray
          ? sliceArray[voxelJ * columns + voxelI]
          : Number(voxelManager.getAtIJK(voxelI, voxelJ, voxelK));
      }

      i += columnStep[0];
      j += columnStep[1];
      k += columnStep[2];
    }
  }

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
 * Creates the labelmap slice image for a planar viewport. A view aligned with
 * the rows and columns of the volume copies one slice of voxels. Any other
 * view takes the nearest voxel for each pixel of the view plane.
 */
function createPlanarSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport
): PlanarSliceImageData | undefined {
  const alignedSlice = createSliceImageData(volume, viewport);

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
