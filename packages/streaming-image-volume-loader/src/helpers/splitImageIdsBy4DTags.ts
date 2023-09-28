import { metaData } from '@cornerstonejs/core';

// TODO: add support for other 4D tags as listed below
// Supported 4D Tags
//   (0018,1060) Trigger Time                   [NOK]
//   (0018,0081) Echo Time                      [NOK]
//   (0018,0086) Echo Number                    [NOK]
//   (0020,0100) Temporal Position Identifier   [NOK]
//   (0054,1300) FrameReferenceTime             [OK]

interface MappedFrameReferenceTime {
  imageId: string;
  frameReferenceTime: number;
}

const groupBy = (array, key) => {
  return array.reduce((rv, x) => {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};

function splitFramesByFrameReferenceTime(imageIds: string[]): string[][] {
  const framesMetadata: Array<MappedFrameReferenceTime> = imageIds.map(
    (imageId: string): MappedFrameReferenceTime => {
      const petImageModule = metaData.get('petImageModule', imageId);
      const { frameReferenceTime = 0 } = petImageModule ?? {};
      return { imageId, frameReferenceTime };
    }
  );

  const framesGroups = groupBy(framesMetadata, 'frameReferenceTime');
  const sortedFrameReferenceTimes = Object.keys(framesGroups)
    .map(Number.parseFloat)
    .sort((a, b) => a - b);

  const imageIdsGroups = sortedFrameReferenceTimes.map((key) =>
    framesGroups[key].map((item) => item.imageId)
  );

  return imageIdsGroups;
}

/**
 * Split the imageIds array by 4D tags into groups. Each group must have the
 * same number of imageIds or the same imageIds array passed in is returned.
 * @param imageIds - array of imageIds
 * @returns imageIds grouped by 4D tags
 */
function splitImageIdsBy4DTags(imageIds: string[]): string[][] {
  const fncList = [splitFramesByFrameReferenceTime];

  for (let i = 0; i < fncList.length; i++) {
    const framesGroups = fncList[i](imageIds);

    if (!framesGroups || framesGroups.length <= 1) {
      // imageIds could not be split into groups
      continue;
    }

    const framesPerGroup = framesGroups[0].length;
    const groupsHaveSameLength = framesGroups.every(
      (g) => g.length === framesPerGroup
    );

    if (groupsHaveSameLength) {
      return framesGroups;
    }
  }

  // return the same imagesIds for non-4D volumes
  return [imageIds];
}

export default splitImageIdsBy4DTags;
