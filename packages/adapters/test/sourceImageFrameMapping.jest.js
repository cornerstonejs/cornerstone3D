import { describe, it, expect } from '@jest/globals';
import { buildSopUIDImageIdIndexMap } from '../src/adapters/Cornerstone3D/Segmentation/labelmapImagesFromBuffer';
import { getImageIdOfSourceImageBySourceImageSequence } from '../src/adapters/Cornerstone/Segmentation_4X';

/**
 * Regression test for PR-2611: multiframe wadouri/dicomfile SEGs losing
 * `ReferencedFrameNumber`.
 *
 * A multiframe source series shares a single SOPInstanceUID across every frame.
 * `buildSopUIDImageIdIndexMap` must store an imageId from which
 * `getImageIdOfSourceImageBySourceImageSequence` can rebuild the per-frame id
 * for any `ReferencedFrameNumber` — i.e. every SEG frame must map back to the
 * matching source frame, not collapse onto frame 1.
 */

const SOP = '1.2.826.0.1.multiframe';

// A metadataProvider stub that returns the given SOPInstanceUID for every
// imageId in the multiframe source stack.
const makeMetadataProvider = (imageIdToSop) => ({
  get: (type, imageId) => {
    if (type === 'generalImageModule') {
      return { sopInstanceUID: imageIdToSop[imageId] };
    }
    return undefined;
  },
});

const resolveFrame = (referencedImageIds, frameNumber) => {
  const imageIdToSop = Object.fromEntries(
    referencedImageIds.map((id) => [id, SOP])
  );
  const map = buildSopUIDImageIdIndexMap(
    referencedImageIds,
    makeMetadataProvider(imageIdToSop)
  );
  return getImageIdOfSourceImageBySourceImageSequence(
    { ReferencedSOPInstanceUID: SOP, ReferencedFrameNumber: frameNumber },
    map
  );
};

describe('buildSopUIDImageIdIndexMap + source-image frame mapping', () => {
  it('maps every frame of a multiframe wadouri source (not just frame 1)', () => {
    const referencedImageIds = [
      'wadouri:https://x/seg.dcm?frame=1',
      'wadouri:https://x/seg.dcm?frame=2',
      'wadouri:https://x/seg.dcm?frame=3',
    ];

    expect(resolveFrame(referencedImageIds, 1)).toBe(referencedImageIds[0]);
    expect(resolveFrame(referencedImageIds, 2)).toBe(referencedImageIds[1]);
    expect(resolveFrame(referencedImageIds, 3)).toBe(referencedImageIds[2]);
  });

  it('maps every frame of a multiframe dicomfile source', () => {
    const referencedImageIds = [
      'dicomfile:42?frame=1',
      'dicomfile:42?frame=2',
      'dicomfile:42?frame=3',
    ];

    expect(resolveFrame(referencedImageIds, 1)).toBe(referencedImageIds[0]);
    expect(resolveFrame(referencedImageIds, 2)).toBe(referencedImageIds[1]);
    expect(resolveFrame(referencedImageIds, 3)).toBe(referencedImageIds[2]);
  });

  it('still maps every frame of a multiframe wadors source (control)', () => {
    const referencedImageIds = [
      'wadors:https://x/studies/1/series/2/instances/3/frames/1',
      'wadors:https://x/studies/1/series/2/instances/3/frames/2',
      'wadors:https://x/studies/1/series/2/instances/3/frames/3',
    ];

    expect(resolveFrame(referencedImageIds, 1)).toBe(referencedImageIds[0]);
    expect(resolveFrame(referencedImageIds, 2)).toBe(referencedImageIds[1]);
    expect(resolveFrame(referencedImageIds, 3)).toBe(referencedImageIds[2]);
  });
});
