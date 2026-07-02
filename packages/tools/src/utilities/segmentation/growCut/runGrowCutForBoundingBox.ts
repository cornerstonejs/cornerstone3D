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
  negativePixelRange?: [number, number];
  positivePixelRange?: [number, number];
};

/**
 * Gets the labelmap and sub-volume backing arrays for a given slice, so seeds
 * can be written directly to the labelmap pixel data. Falls back to per-voxel
 * access through the voxel managers when a backing array is not available.
 */
function _getSlicePixelData(
  subVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  sliceIndex: number
) {
  const pixelsPerSlice = labelmap.dimensions[0] * labelmap.dimensions[1];
  const sliceOffset = sliceIndex * pixelsPerSlice;
  const subVolSliceData =
    subVolume.voxelManager.getSliceBackingArray(sliceIndex);
  const labelmapSliceData =
    labelmap.voxelManager.getSliceBackingArray(sliceIndex);

  const readSubVolume = subVolSliceData
    ? (i: number) => subVolSliceData[i]
    : (i: number) =>
        subVolume.voxelManager.getAtIndex(sliceOffset + i) as number;

  const writeLabelmap = labelmapSliceData
    ? (i: number, value: number) => {
        labelmapSliceData[i] = value;
      }
    : (i: number, value: number) => {
        labelmap.voxelManager.setAtIndex(sliceOffset + i, value);
      };

  return { readSubVolume, writeLabelmap, hasBackingArray: !!labelmapSliceData };
}

function _setNegativeSeedValues(
  subVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  options?: GrowCutBoundingBoxOptions
) {
  const {
    negativeSeedValue = NEGATIVE_SEED_VALUE,
    negativePixelRange = NEGATIVE_PIXEL_RANGE,
  } = options;
  const [width, height, numSlices] = labelmap.dimensions;
  const middleSliceIndex = Math.floor(numSlices / 2);
  const visited = new Uint8Array(width * height);
  const { readSubVolume, writeLabelmap, hasBackingArray } = _getSlicePixelData(
    subVolume,
    labelmap,
    middleSliceIndex
  );

  // Run Breadth First Search to set some voxels to negative only for the current slice (performance).
  const bfs = (startX: number, startY: number) => {
    const queue = [startY * width + startX];
    let head = 0;

    while (head < queue.length) {
      const slicePixelIndex = queue[head++];
      const x = slicePixelIndex % width;
      const y = Math.floor(slicePixelIndex / width);

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
      visited[slicePixelIndex] = 1;

      const volumeVoxelValue = readSubVolume(slicePixelIndex);

      // Does not do anything if it is not air or any value below (eg: minPixelValue)
      if (
        volumeVoxelValue < negativePixelRange[0] ||
        volumeVoxelValue > negativePixelRange[1]
      ) {
        continue;
      }

      writeLabelmap(slicePixelIndex, negativeSeedValue);

      if (x > 0) {
        queue.push(slicePixelIndex - 1);
      }
      if (x < width - 1) {
        queue.push(slicePixelIndex + 1);
      }
      queue.push(slicePixelIndex - width);
      queue.push(slicePixelIndex + width);
    }
  };

  // Check each pixel from left-right or right-left and stop once it reach a pixel value
  // that is greater than the threshold value
  const scanLine = (startX, limitX, incX, y) => {
    for (let x = startX; x !== limitX; x += incX) {
      const slicePixelIndex = y * width + x;
      const volumeVoxelValue = readSubVolume(slicePixelIndex);

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

  if (hasBackingArray) {
    labelmap.voxelManager.addModifiedRegion([
      [0, width - 1],
      [0, height - 1],
      [middleSliceIndex, middleSliceIndex],
    ]);
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
  const [width, height, numSlices] = labelmap.dimensions;
  const middleSliceIndex = Math.floor(numSlices / 2);
  const startSliceIndex = Math.max(middleSliceIndex - 3, 0);
  const stopSliceIndex = Math.max(startSliceIndex + 5, numSlices);
  const pixelsPerSlice = width * height;
  let anySliceWithBackingArray = false;

  for (let z = startSliceIndex; z < stopSliceIndex; z++) {
    const { readSubVolume, writeLabelmap, hasBackingArray } =
      _getSlicePixelData(subVolume, labelmap, z);

    anySliceWithBackingArray ||= hasBackingArray;

    for (let i = 0; i < pixelsPerSlice; i++) {
      const pixelValue = readSubVolume(i);

      // CT specific values
      // https://www.sciencedirect.com/topics/medicine-and-dentistry/hounsfield-scale
      const isPositiveValue =
        pixelValue >= positivePixelRange[0] &&
        pixelValue <= positivePixelRange[1];

      if (isPositiveValue) {
        writeLabelmap(i, positiveSeedValue);
      }
    }
  }

  if (anySliceWithBackingArray) {
    labelmap.voxelManager.addModifiedRegion([
      [0, width - 1],
      [0, height - 1],
      [startSliceIndex, stopSliceIndex - 1],
    ]);
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
