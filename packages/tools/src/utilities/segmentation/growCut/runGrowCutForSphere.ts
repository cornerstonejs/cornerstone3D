import { quat, vec3 } from 'gl-matrix';
import { utilities as csUtils, cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { run, type GrowCutOptions } from './runGrowCut';
import type { SphereBoundsInfo } from '../../getSphereBoundsInfo';
import { getSphereBoundsInfo } from '../../getSphereBoundsInfo';

const { transformWorldToIndex } = csUtils;

const POSITIVE_SEED_VALUE = 254;
const NEGATIVE_SEED_VALUE = 255;
const POSITIVE_SEED_VARIANCE = 0.1;
const NEGATIVE_SEED_VARIANCE = 0.8;

type SphereInfo = {
  center: Types.Point3;
  radius: number;
};

type GrowCutSphereBoundsInfo = SphereBoundsInfo & {
  topLeftIJK: Types.Point3;
  bottomRightIJK: Types.Point3;
};

function _getGrowCutSphereBoundsInfo(
  referencedVolume: Types.IImageVolume,
  sphereBoundsInfo: SphereBoundsInfo
): GrowCutSphereBoundsInfo {
  const { topLeftWorld, bottomRightWorld } = sphereBoundsInfo;
  const topLeftIJK = transformWorldToIndex(
    referencedVolume.imageData,
    topLeftWorld
  );
  const bottomRightIJK = transformWorldToIndex(
    referencedVolume.imageData,
    bottomRightWorld
  );

  return {
    ...sphereBoundsInfo,
    topLeftIJK,
    bottomRightIJK,
  };
}

function _getSphereBoundsInfo(
  referencedVolume: Types.IImageVolume,
  sphereInfo: SphereInfo
): SphereBoundsInfo {
  const direction = referencedVolume.imageData.getDirection();
  const vecColumn = vec3.fromValues(direction[3], direction[4], direction[5]);

  const { center: sphereCenterPoint, radius: sphereRadius } = sphereInfo;
  const refVolImageData = referencedVolume.imageData;

  const topCirclePoint = vec3.scaleAndAdd(
    vec3.create(),
    sphereCenterPoint,
    vecColumn,
    -sphereRadius
  ) as Types.Point3;

  const bottomCirclePoint = vec3.scaleAndAdd(
    vec3.create(),
    sphereCenterPoint,
    vecColumn,
    sphereRadius
  ) as Types.Point3;

  // Gets the sphere bounds info in acquired orientation (no viewport needed)
  const sphereBoundsInfo = getSphereBoundsInfo(
    [bottomCirclePoint, topCirclePoint],
    refVolImageData
  );

  return _getGrowCutSphereBoundsInfo(referencedVolume, sphereBoundsInfo);
}

function _createSubVolumeFromSphere(
  referencedVolume: Types.IImageVolume,
  sphereInfo: SphereInfo,
  viewport: Types.IViewport
) {
  const refVolImageData = referencedVolume.imageData;

  const camera = viewport.getCamera();
  const { ijkVecRowDir, ijkVecColDir } = csUtils.getVolumeDirectionVectors(
    refVolImageData,
    camera
  );

  // If two of the three vectors are aligned to X, Y or Z then the 3rd vector
  // is also aligned (non-oblique)
  const obliqueView = [ijkVecRowDir, ijkVecColDir].some(
    (vec) =>
      !csUtils.isEqual(Math.abs(vec[0]), 1) &&
      !csUtils.isEqual(Math.abs(vec[1]), 1) &&
      !csUtils.isEqual(Math.abs(vec[2]), 1)
  );

  if (obliqueView) {
    console.warn('Oblique view is not supported!');
    return;
  }

  const { boundsIJK: sphereBoundsIJK /*, topLeftWorld, bottomRightWorld */ } =
    _getSphereBoundsInfo(referencedVolume, sphereInfo);

  const subVolumeBoundsIJK: Types.AABB3 = {
    minX: sphereBoundsIJK[0][0],
    maxX: sphereBoundsIJK[0][1] + 1,
    minY: sphereBoundsIJK[1][0],
    maxY: sphereBoundsIJK[1][1] + 1,
    minZ: sphereBoundsIJK[2][0],
    maxZ: sphereBoundsIJK[2][1] + 1,
  };

  return csUtils.createSubVolume(
    referencedVolume.volumeId,
    subVolumeBoundsIJK,
    {
      targetBuffer: {
        type: 'Float32Array',
      },
    }
  );
}

function _setPositiveSeedValues(
  referencedVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  sphereInfo: SphereInfo,
  options?: GrowCutOptions
) {
  const refVolumePixelData =
    referencedVolume.voxelManager.getCompleteScalarDataArray();

  const worldStartPos = sphereInfo.center;
  const [width, height, numSlices] = referencedVolume.dimensions;

  const numPixelsPerSlice = width * height;
  const ijkStartPosition = transformWorldToIndex(
    referencedVolume.imageData,
    worldStartPos
  );
  const referencePixelValue =
    refVolumePixelData[
      ijkStartPosition[2] * numPixelsPerSlice +
        ijkStartPosition[1] * width +
        ijkStartPosition[0]
    ];

  const positiveSeedValue = options.positiveSeedValue ?? POSITIVE_SEED_VALUE;
  const positiveSeedVariance =
    options.positiveSeedVariance ?? POSITIVE_SEED_VARIANCE;
  const positiveSeedVarianceValue = Math.abs(
    referencePixelValue * positiveSeedVariance
  );
  const minPositivePixelValue = referencePixelValue - positiveSeedVarianceValue;
  const maxPositivePixelValue = referencePixelValue + positiveSeedVarianceValue;

  // Neighbors distance that will be visited for every pixel
  const neighborsCoordDelta = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];

  const startVoxelIndex =
    ijkStartPosition[2] * numPixelsPerSlice +
    ijkStartPosition[1] * width +
    ijkStartPosition[0];

  // Update the label map for the start voxel
  // labelmapData[startVoxelIndex] = positiveSeedValue;
  labelmap.voxelManager.setAtIndex(startVoxelIndex, positiveSeedValue);

  // Add the start point to the queue and traverse all neighbor pixels that are not visited yet and within the positive range
  const queue = [ijkStartPosition];

  // Run breadth first search in 3D space to update the positive and negative seed values
  while (queue.length) {
    const ijkVoxel = queue.shift();
    const [x, y, z] = ijkVoxel;

    for (let i = 0, len = neighborsCoordDelta.length; i < len; i++) {
      const neighborCoordDelta = neighborsCoordDelta[i];
      const nx = x + neighborCoordDelta[0];
      const ny = y + neighborCoordDelta[1];
      const nz = z + neighborCoordDelta[2];

      // Continue if it is out of bounds.
      if (
        nx < 0 ||
        nx >= width ||
        ny < 0 ||
        ny >= height ||
        nz < 0 ||
        nz >= numSlices
      ) {
        continue;
      }

      const neighborVoxelIndex = nz * numPixelsPerSlice + ny * width + nx;
      const neighborPixelValue = refVolumePixelData[neighborVoxelIndex];
      // const neighborLabelmapValue = labelmapData[neighborVoxelIndex];
      const neighborLabelmapValue =
        labelmap.voxelManager.getAtIndex(neighborVoxelIndex);

      if (
        neighborLabelmapValue === positiveSeedValue ||
        neighborPixelValue < minPositivePixelValue ||
        neighborPixelValue > maxPositivePixelValue
      ) {
        continue;
      }

      // labelmapData[neighborVoxelIndex] = positiveSeedValue;
      labelmap.voxelManager.setAtIndex(neighborVoxelIndex, positiveSeedValue);
      queue.push([nx, ny, nz]);
    }
  }
}

function _setNegativeSeedValues(
  subVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  sphereInfo: SphereInfo,
  viewport: Types.IViewport,
  options: GrowCutOptions
) {
  const subVolPixelData = subVolume.voxelManager.getCompleteScalarDataArray();

  const [columns, rows, numSlices] = labelmap.dimensions;
  const numPixelsPerSlice = columns * rows;

  // The camera has the same orientation for the labelmap volume because this
  // volume has the same orientation as the referenced volume and there is no
  // need to convert from refVolume to labelmap spaces.
  const { worldVecRowDir, worldVecSliceDir } =
    csUtils.getVolumeDirectionVectors(labelmap.imageData, viewport.getCamera());

  const ijkSphereCenter = transformWorldToIndex(
    subVolume.imageData,
    sphereInfo.center
  );
  const referencePixelValue =
    subVolPixelData[
      ijkSphereCenter[2] * columns * rows +
        ijkSphereCenter[1] * columns +
        ijkSphereCenter[0]
    ];

  const negativeSeedVariance =
    options.negativeSeedVariance ?? NEGATIVE_SEED_VARIANCE;
  const negativeSeedValue = options?.negativeSeedValue ?? NEGATIVE_SEED_VALUE;
  const negativeSeedVarianceValue = Math.abs(
    referencePixelValue * negativeSeedVariance
  );
  const minNegativePixelValue = referencePixelValue - negativeSeedVarianceValue;
  const maxNegativePixelValue = referencePixelValue + negativeSeedVarianceValue;

  const numCirclePoints = 360;
  const rotationAngle = (2 * Math.PI) / numCirclePoints;
  const worldQuat = quat.setAxisAngle(
    quat.create(),
    worldVecSliceDir,
    rotationAngle
  );

  const vecRotation = vec3.clone(worldVecRowDir);

  for (let i = 0; i < numCirclePoints; i++) {
    const worldCircleBorderPoint = vec3.scaleAndAdd(
      vec3.create(),
      sphereInfo.center,
      vecRotation,
      sphereInfo.radius
    );
    const ijkCircleBorderPoint = transformWorldToIndex(
      labelmap.imageData,
      worldCircleBorderPoint as Types.Point3
    );
    const [x, y, z] = ijkCircleBorderPoint;

    vec3.transformQuat(vecRotation, vecRotation, worldQuat);

    if (
      x < 0 ||
      x >= columns ||
      y < 0 ||
      y >= rows ||
      z < 0 ||
      z >= numSlices
    ) {
      continue;
    }

    const offset = x + y * columns + z * numPixelsPerSlice;
    const pixelValue = subVolPixelData[offset];

    if (
      pixelValue < minNegativePixelValue ||
      pixelValue > maxNegativePixelValue
    ) {
      // labelmapData[offset] = negativeSeedValue;
      labelmap.voxelManager.setAtIndex(offset, negativeSeedValue);
    }
  }
}

async function _createAndCacheSegmentationSubVolumeForSphere(
  subVolume: Types.IImageVolume,
  sphereInfo: SphereInfo,
  viewport: Types.IViewport,
  options?: GrowCutOptions
): Promise<Types.IImageVolume> {
  const labelmap = await volumeLoader.createAndCacheDerivedLabelmapVolume(
    subVolume.volumeId
  );

  _setPositiveSeedValues(subVolume, labelmap, sphereInfo, options);
  _setNegativeSeedValues(subVolume, labelmap, sphereInfo, viewport, options);

  return labelmap;
}

/**
 * Run grow cut for a given volume and a sphere. A new sub-volume is created
 * based on sphere's AABB, a labelmap is created for that sub-volume, some pixels
 * are set as positive/negative and the labelmap is then updated in the gpu. The
 * positive and negative seed pixels are set based on the center and radius of
 * the sphere where pixels close o the center of the sphere are set as positive
 * and up to 360 pixels at the border are set as negative.
 *
 * @param referencedVolumeId - Referenced volume id
 * @param sphereInfo - Sphere information (center and radius)
 * @param viewport - Viewport
 * @param options - Options
 * @returns A new labelmap created that shall have the size of the sphere's AABB
 */
async function runGrowCutForSphere(
  referencedVolumeId: string,
  sphereInfo: SphereInfo,
  viewport: Types.IViewport,
  options?: GrowCutOptions
): Promise<Types.IImageVolume> {
  const referencedVolume = cache.getVolume(referencedVolumeId);

  const subVolume = _createSubVolumeFromSphere(
    referencedVolume,
    sphereInfo,
    viewport
  );

  const labelmap = await _createAndCacheSegmentationSubVolumeForSphere(
    subVolume,
    sphereInfo,
    viewport,
    options
  );

  await run({
    referenceVolumeId: subVolume.volumeId,
    labelmapVolumeId: labelmap.volumeId,
  });

  return labelmap;
}

export { runGrowCutForSphere as default, runGrowCutForSphere };
export type { SphereInfo, GrowCutOptions as GrowCutSphereOptions };
