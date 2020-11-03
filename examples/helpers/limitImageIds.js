/**
 * Returns a sliced portion of the `imageIds` array of length `limitFrames`.
 * The slices portion is taken from the middle of the array.
 *
 * If `limitFrames` > `imageIds.length`, returns the original `imageIds` array.
 *
 * @param {string[]} imageIds An array of imageIds
 * @param {number} limitFrames The number of frames to slice.
 *
 * @returns {string[]} The sliced imageIds array.
 */
export default function limitImageIds(imageIds, limitFrames) {
  const imageIdsLength = imageIds.length;

  if (limitFrames < imageIdsLength) {
    const middleFrame = Math.floor(imageIdsLength / 2);
    const firstFrameOfSequence = Math.max(
      Math.floor(middleFrame - Math.ceil(limitFrames / 2)),
      0
    );

    return imageIds.slice(
      firstFrameOfSequence,
      firstFrameOfSequence + limitFrames
    );
  }

  return imageIds;
}
