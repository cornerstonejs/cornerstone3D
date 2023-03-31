import { Types } from '@cornerstonejs/core';
import { volumeLoader, utilities as csUtils } from '@cornerstonejs/core';

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

  const arrayType = (labelmap.getScalarData() as any).constructor;
  const outputData = new arrayType(labelmap.getScalarData().length);

  labelmaps.forEach((labelmap) => {
    const scalarData = labelmap.getScalarData();
    for (let i = 0; i < scalarData.length; i++) {
      if (scalarData[i] === segmentIndex) {
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

  const preventCache = true;
  // Todo: following should be async
  const mergedVolume = volumeLoader.createLocalVolume(
    options,
    volumeId,
    preventCache
  );

  return mergedVolume;
}

export default createMergedLabelmapForIndex;
