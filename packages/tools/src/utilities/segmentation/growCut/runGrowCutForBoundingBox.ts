import { volumeLoader, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { run } from './runGrowCut';
import type { GrowCutOptions } from './runGrowCut';

const POSITIVE_SEED_VALUE = 254;
const NEGATIVE_SEED_VALUE = 255;

// Positive and negative threshold/range (defaults to CT hounsfield ranges)
// //www.sciencedirect.com/topics/medicine-and-dentistry/hounsfield-scale
const NEGATIVE_PIXEL_RANGE = [-Infinity, -995];
const POSITIVE_PIXEL_RANGE = [0, 1900];

type BoundingBoxInfo = {
  boundingBox: {
    ijkTopLeft: Types.Point3;
    ijkBottomRight: Types.Point3;
  };
};

type GrowCutBoundingBoxOptions = GrowCutOptions & {
  positiveSeedValue?: number;
  negativeSeedValue?: number;
  negativePixelRange?: [number, number];
  positivePixelRange?: [number, number];
};

function _setNegativeSeedValues(
  subVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  options?: GrowCutBoundingBoxOptions
) {
  const {
    negativeSeedValue = NEGATIVE_SEED_VALUE,
    negativePixelRange = NEGATIVE_PIXEL_RANGE,
  } = options;
  const subVolPixelData = subVolume.voxelManager.getCompleteScalarDataArray();
  const [width, height, numSlices] = labelmap.dimensions;
  const middleSliceIndex = Math.floor(numSlices / 2);
  const visited = new Array(width * height).fill(false);
  const sliceOffset = middleSliceIndex * width * height;

  // Run Breadth First Search to set some voxels to negative only for the current slice (performance).
  const bfs = (startX: number, startY: number) => {
    const queue = [[startX, startY]];

    while (queue.length) {
      const [x, y] = queue.shift();
      const slicePixelIndex = y * width + x;

      // Continue if it is out of bounds or it has been already visited.
      if (
        x < 0 ||
        x >= width ||
        y < 0 ||
        y >= height ||
        visited[slicePixelIndex]
      ) {
        continue;
      }

      // Mark the pixel as visited
      visited[slicePixelIndex] = true;

      const volumeVoxelIndex = sliceOffset + slicePixelIndex;
      const volumeVoxelValue = subVolPixelData[volumeVoxelIndex];

      // Does not do anything if it is not air or any value below (eg: minPixelValue)
      if (
        volumeVoxelValue < negativePixelRange[0] ||
        volumeVoxelValue > negativePixelRange[1]
      ) {
        continue;
      }

      labelmap.voxelManager.setAtIndex(volumeVoxelIndex, negativeSeedValue);

      queue.push([x - 1, y]);
      queue.push([x + 1, y]);
      queue.push([x, y - 1]);
      queue.push([x, y + 1]);
    }
  };

  // Check each pixel from left-right or right-left and stop once it reach a pixel value
  // that is greater than the threshold value
  const scanLine = (startX, limitX, incX, y) => {
    for (let x = startX; x !== limitX; x += incX) {
      const slicePixelIndex = y * width + x;
      const volumeVoxelIndex = sliceOffset + slicePixelIndex;
      const volumeVoxelValue = subVolPixelData[volumeVoxelIndex];

      if (
        volumeVoxelValue < negativePixelRange[0] ||
        volumeVoxelValue > negativePixelRange[1]
      ) {
        break;
      }

      if (!visited[slicePixelIndex]) {
        bfs(x, y);
      }
    }
  };

  for (let y = 0; y < height; y++) {
    scanLine(0, width - 1, 1, y);
    scanLine(width - 1, 0, -1, y);
  }
}

function _setPositiveSeedValues(
  subVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  options?: GrowCutBoundingBoxOptions
) {
  const {
    positiveSeedValue = POSITIVE_SEED_VALUE,
    positivePixelRange = POSITIVE_PIXEL_RANGE,
  } = options;
  const subVolPixelData = subVolume.voxelManager.getCompleteScalarDataArray();
  const labelmapData = labelmap.voxelManager.getCompleteScalarDataArray();
  const [width, height, numSlices] = labelmap.dimensions;
  const middleSliceIndex = Math.floor(numSlices / 2);
  const startSliceIndex = Math.max(middleSliceIndex - 3, 0);
  const stopSliceIndex = Math.max(startSliceIndex + 5, numSlices);
  const pixelsPerSlice = width * height;

  for (let z = startSliceIndex; z < stopSliceIndex; z++) {
    const zOffset = z * pixelsPerSlice;
    for (let y = 0; y < height; y++) {
      const yOffset = y * width;
      for (let x = 0; x < width; x++) {
        const index = zOffset + yOffset + x;
        const pixelValue = subVolPixelData[index];

        // CT specific values
        // https://www.sciencedirect.com/topics/medicine-and-dentistry/hounsfield-scale
        const isPositiveValue =
          pixelValue >= positivePixelRange[0] &&
          pixelValue <= positivePixelRange[1];

        if (isPositiveValue) {
          labelmap.voxelManager.setAtIndex(index, positiveSeedValue);
        }
      }
    }
  }
}

async function _createAndCacheSegmentationSubVolumeForBoundingBox(
  subVolume: Types.IImageVolume,
  options?: GrowCutBoundingBoxOptions
): Promise<Types.IImageVolume> {
  const labelmap = volumeLoader.createAndCacheDerivedLabelmapVolume(
    subVolume.volumeId
  );

  _setPositiveSeedValues(subVolume, labelmap, options);
  _setNegativeSeedValues(subVolume, labelmap, options);

  return labelmap;
}

/**
 * Run grow cut for a given volume and a bounding box whithin that volume. The
 * positive and negative seed values are set based on positive/negative pixel
 * value ranges that can be passed in the `options` (`positivePixelRange` and
 * `negativePixelRange`). By default it uses some CT pixel values ranges.
 *
 * @param referencedVolumeId - Referenced volume id
 * @param boundingBoxInfo - Bounding box (top-left and bottom-right corners)
 * @param options - Options
 * @returns A new labelmap created that shall have the size of the bounding box
 */
async function runGrowCutForBoundingBox(
  referencedVolumeId: string,
  boundingBoxInfo: BoundingBoxInfo,
  options?: GrowCutBoundingBoxOptions
): Promise<Types.IImageVolume> {
  const { boundingBox } = boundingBoxInfo;
  const { ijkTopLeft, ijkBottomRight } = boundingBox;
  const subVolumeBoundsIJK: Types.AABB3 = {
    minX: ijkTopLeft[0],
    maxX: ijkBottomRight[0],
    minY: ijkTopLeft[1],
    maxY: ijkBottomRight[1],
    minZ: ijkTopLeft[2],
    maxZ: ijkBottomRight[2],
  };

  const subVolume = csUtils.createSubVolume(
    referencedVolumeId,
    subVolumeBoundsIJK,
    {
      targetBuffer: {
        type: 'Float32Array',
      },
    }
  );

  const labelmap = await _createAndCacheSegmentationSubVolumeForBoundingBox(
    subVolume,
    options
  );

  await run(subVolume.volumeId, labelmap.volumeId);

  return labelmap;
}

export { runGrowCutForBoundingBox as default, runGrowCutForBoundingBox };
export type { BoundingBoxInfo, GrowCutBoundingBoxOptions };
