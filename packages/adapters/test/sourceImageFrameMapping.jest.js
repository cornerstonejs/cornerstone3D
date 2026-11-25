import { describe, it, expect, jest } from '@jest/globals';
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

describe('buildSopUIDImageIdIndexMap', () => {
  const build = (imageIdToSop) =>
    buildSopUIDImageIdIndexMap(
      Object.keys(imageIdToSop),
      makeMetadataProvider(imageIdToSop)
    );

  it('returns an empty map for no imageIds', () => {
    expect(buildSopUIDImageIdIndexMap([], makeMetadataProvider({}))).toEqual(
      {}
    );
  });

  it('stores a single-element array for a single-frame instance', () => {
    expect(build({ 'wadors:https://x/instances/1': '1.1' })).toEqual({
      1.1: ['wadors:https://x/instances/1'],
    });
  });

  it('collects every frame of a multiframe instance in input order', () => {
    const ids = [
      'wadouri:https://x/a.dcm?frame=1',
      'wadouri:https://x/a.dcm?frame=2',
      'wadouri:https://x/a.dcm?frame=3',
    ];
    const map = build(Object.fromEntries(ids.map((id) => [id, SOP])));

    expect(map).toEqual({ [SOP]: ids });
  });

  it('groups imageIds by SOPInstanceUID across interleaved instances', () => {
    const map = build({
      'custom:a1': '1.A',
      'custom:b1': '1.B',
      'custom:a2': '1.A',
      'custom:b2': '1.B',
      'custom:c1': '1.C',
    });

    expect(map).toEqual({
      '1.A': ['custom:a1', 'custom:a2'],
      '1.B': ['custom:b1', 'custom:b2'],
      '1.C': ['custom:c1'],
    });
  });

  it('queries generalImageModule once per imageId', () => {
    const ids = ['custom:a', 'custom:b', 'custom:c'];
    const get = jest.fn(() => ({ sopInstanceUID: SOP }));

    buildSopUIDImageIdIndexMap(ids, { get });

    expect(get).toHaveBeenCalledTimes(ids.length);
    ids.forEach((id) =>
      expect(get).toHaveBeenCalledWith('generalImageModule', id)
    );
  });

  it('does not throw when metadata is missing for an imageId', () => {
    expect(() =>
      buildSopUIDImageIdIndexMap(['custom:none'], { get: () => undefined })
    ).not.toThrow();
  });
});
