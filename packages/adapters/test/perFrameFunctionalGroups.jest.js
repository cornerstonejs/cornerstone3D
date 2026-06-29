import { describe, it, expect } from '@jest/globals';
import {
  getReferencedFrameNumber,
  getReferencedSourceImageSequenceItem,
  applyPerFrameFunctionalGroups,
  normalizeSharedFunctionalGroupsSequence,
} from '../src/adapters/Cornerstone3D/Segmentation/perFrameFunctionalGroups';

// Metadata stub whose getFrameInformationFromURL understands every imageId shape
// the host produces (wadors /frames/N as well as ?frame=N / &frame=N), so the
// helper never has to fall back to the core FrameRange parser.
const metadata = {
  get: (_module, imageId) => ({ SOPInstanceUID: `SOP:${imageId}` }),
  getFrameInformationFromURL: (imageId) => {
    const match =
      imageId.match(/[?&]frame=(\d+)/) || imageId.match(/\/frames\/(\d+)/);
    return match ? Number(match[1]) : undefined;
  },
};

describe('getReferencedFrameNumber', () => {
  it('returns undefined for a missing imageId', () => {
    expect(getReferencedFrameNumber(undefined, metadata)).toBeUndefined();
  });

  it('extracts the frame from a wadors /frames/N imageId (the regressed form)', () => {
    expect(
      getReferencedFrameNumber('wadors:https://x/studies/1/frames/7', metadata)
    ).toBe(7);
  });

  it('extracts the frame from a ?frame=N / &frame=N imageId', () => {
    expect(getReferencedFrameNumber('wadouri:blob:abc?frame=4', metadata)).toBe(
      4
    );
    expect(
      getReferencedFrameNumber('wadouri:blob:abc?x=1&frame=9', metadata)
    ).toBe(9);
  });
});

describe('getReferencedSourceImageSequenceItem', () => {
  it('includes ReferencedFrameNumber for a multiframe wadors imageId', () => {
    const item = getReferencedSourceImageSequenceItem(
      { imageId: 'wadors:https://x/studies/1/frames/3' },
      metadata
    );

    expect(item.ReferencedSOPInstanceUID).toBe(
      'SOP:wadors:https://x/studies/1/frames/3'
    );
    expect(item.ReferencedFrameNumber).toBe(3);
  });

  it('omits ReferencedFrameNumber when none can be resolved', () => {
    const item = getReferencedSourceImageSequenceItem(
      { imageId: 'wadors:https://x/instance' },
      metadata
    );

    expect(item.ReferencedSOPInstanceUID).toBe('SOP:wadors:https://x/instance');
    expect('ReferencedFrameNumber' in item).toBe(false);
  });
});

describe('normalizeSharedFunctionalGroupsSequence', () => {
  it('unwraps an array-wrapped shared sequence', () => {
    const dataset = { SharedFunctionalGroupsSequence: [{ a: 1 }] };
    normalizeSharedFunctionalGroupsSequence(dataset);
    expect(dataset.SharedFunctionalGroupsSequence).toEqual({ a: 1 });
  });

  it('creates an empty object when missing', () => {
    const dataset = {};
    normalizeSharedFunctionalGroupsSequence(dataset);
    expect(dataset.SharedFunctionalGroupsSequence).toEqual({});
  });
});

describe('applyPerFrameFunctionalGroups', () => {
  it('builds per-frame groups for valid frames and sets NumberOfFrames', () => {
    const dataset = {};
    applyPerFrameFunctionalGroups(dataset, [
      {
        referencedSegmentNumber: 1,
        sourceImageSequenceItem: {
          ReferencedSOPInstanceUID: 'SOP-A',
          ReferencedFrameNumber: 2,
        },
      },
      {
        referencedSegmentNumber: 1,
        sourceImageSequenceItem: { ReferencedSOPInstanceUID: 'SOP-B' },
      },
    ]);

    expect(dataset.NumberOfFrames).toBe(2);
    expect(dataset.PerFrameFunctionalGroupsSequence).toHaveLength(2);

    const [first] = dataset.PerFrameFunctionalGroupsSequence;
    expect(first.SegmentIdentificationSequence.ReferencedSegmentNumber).toBe(1);
    expect(
      first.DerivationImageSequence[0].SourceImageSequence[0]
        .ReferencedSOPInstanceUID
    ).toBe('SOP-A');
  });

  it('drops frames without a referenced SOP instance UID', () => {
    const dataset = {};
    applyPerFrameFunctionalGroups(dataset, [
      {
        referencedSegmentNumber: 1,
        sourceImageSequenceItem: { ReferencedSOPInstanceUID: 'SOP-A' },
      },
      { referencedSegmentNumber: 1, sourceImageSequenceItem: {} },
    ]);

    expect(dataset.NumberOfFrames).toBe(1);
    expect(dataset.PerFrameFunctionalGroupsSequence).toHaveLength(1);
  });
});
