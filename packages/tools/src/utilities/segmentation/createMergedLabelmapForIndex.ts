import type { Types } from '@cornerstonejs/core';
import { volumeLoader, utilities as csUtils, cache } from '@cornerstonejs/core';

/**
 * Given a list of labelmaps (with the possibility of overlapping regions), and
 * a segmentIndex it creates a new labelmap with the same dimensions as the input labelmaps,
 * but merges them into a single labelmap for the segmentIndex. It wipes out
 * all other segment Indices. This is useful for calculating statistics regarding
 * a specific segment when there are overlapping regions between labelmap (e.g. TMTV)
 *
 * @param labelmaps - Array of labelmaps
 * @param segmentIndex - The segment index to merge
 * @returns Merged labelmap
 */
function createMergedLabelmapForIndex(
  labelmaps: Array<Types.IImageVolume>,
  segmentIndex = 1,
  volumeId = 'mergedLabelmap'
): Types.IImageVolume {
  labelmaps.forEach(({ direction, dimensions, origin, spacing }) => {
    if (
      !csUtils.isEqual(dimensions, labelmaps[0].dimensions) ||
      !csUtils.isEqual(direction, labelmaps[0].direction) ||
      !csUtils.isEqual(spacing, labelmaps[0].spacing) ||
      !csUtils.isEqual(origin, labelmaps[0].origin)
    ) {
      throw new Error('labelmaps must have the same size and shape');
    }
  });

  const labelmap = labelmaps[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arrayType = labelmap.voxelManager.getConstructor() as any;

  const outputData = new arrayType(labelmap.voxelManager.getScalarDataLength());

  labelmaps.forEach((labelmap) => {
    const voxelManager = labelmap.voxelManager;
    const scalarDataLength = voxelManager.getScalarDataLength();
    for (let i = 0; i < scalarDataLength; i++) {
      if (voxelManager.getAtIndex(i) === segmentIndex) {
        outputData[i] = segmentIndex;
      }
    }
  });

  const options = {
    scalarData: outputData,
    metadata: labelmap.metadata,
    spacing: labelmap.spacing,
    origin: labelmap.origin,
    direction: labelmap.direction,
    dimensions: labelmap.dimensions,
  };

  const cachedVolume = cache.getVolume(volumeId);

  let mergedVolume;
  if (cachedVolume) {
    mergedVolume = cachedVolume;
    mergedVolume.voxelManager.setCompleteScalarDataArray(outputData);
  } else {
    mergedVolume = volumeLoader.createLocalVolume(volumeId, options);
  }

  return mergedVolume;
}

export default createMergedLabelmapForIndex;
