import { describe, it, expect } from '@jest/globals';
import {
  getReferencedFrameNumber,
  getReferencedSourceImageSequenceItem,
  applyPerFrameFunctionalGroups,
  normalizeSharedFunctionalGroupsSequence,
  setPlaneOrientations,
} from '../src/adapters/Cornerstone3D/Segmentation/perFrameFunctionalGroups';

const AXIAL = [1, 0, 0, 0, 1, 0];
const TILTED = [1, 0, 0, 0, 0.8, 0.6];
const orientationOf = (sequence) => sequence?.ImageOrientationPatient;

describe('setPlaneOrientations', () => {
  it('moves one orientation to the shared group and removes the per-frame copies', () => {
    // dcmjs copies a per-frame orientation from a multiframe source.
    const dataset = {
      SharedFunctionalGroupsSequence: {},
      PerFrameFunctionalGroupsSequence: [
        { PlaneOrientationSequence: { ImageOrientationPatient: TILTED } },
        { PlaneOrientationSequence: { ImageOrientationPatient: TILTED } },
      ],
    };

    setPlaneOrientations(dataset, [AXIAL, AXIAL]);

    expect(
      orientationOf(
        dataset.SharedFunctionalGroupsSequence.PlaneOrientationSequence
      )
    ).toEqual(AXIAL);
    dataset.PerFrameFunctionalGroupsSequence.forEach((group) =>
      expect(group.PlaneOrientationSequence).toBeUndefined()
    );
  });

  it('keeps the known orientations per frame when one frame has none', () => {
    const dataset = {
      SharedFunctionalGroupsSequence: {
        PlaneOrientationSequence: { ImageOrientationPatient: AXIAL },
      },
      PerFrameFunctionalGroupsSequence: [{}, {}, {}],
    };

    setPlaneOrientations(dataset, [AXIAL, undefined, TILTED]);

    expect(
      dataset.SharedFunctionalGroupsSequence.PlaneOrientationSequence
    ).toBeUndefined();
    expect(
      dataset.PerFrameFunctionalGroupsSequence.map((group) =>
        orientationOf(group.PlaneOrientationSequence)
      )
    ).toEqual([AXIAL, AXIAL, TILTED]);
  });
});

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

  it('omits SegmentIdentificationSequence on the LABELMAP path (no referencedSegmentNumber)', () => {
    const dataset = {};
    applyPerFrameFunctionalGroups(dataset, [
      {
        // LABELMAP: no referencedSegmentNumber
        sourceImageSequenceItem: { ReferencedSOPInstanceUID: 'SOP-A' },
      },
    ]);

    const [group] = dataset.PerFrameFunctionalGroupsSequence;
    expect('SegmentIdentificationSequence' in group).toBe(false);
    expect(
      group.DerivationImageSequence[0].SourceImageSequence[0]
        .ReferencedSOPInstanceUID
    ).toBe('SOP-A');
  });

  it('strips an inherited SegmentIdentificationSequence when none is provided', () => {
    const dataset = {
      PerFrameFunctionalGroupsSequence: [
        {
          SegmentIdentificationSequence: { ReferencedSegmentNumber: 7 },
          PlanePositionSequence: { ImagePositionPatient: [0, 0, 0] },
        },
      ],
    };
    applyPerFrameFunctionalGroups(dataset, [
      {
        sourceImageSequenceItem: { ReferencedSOPInstanceUID: 'SOP-A' },
      },
    ]);

    const [group] = dataset.PerFrameFunctionalGroupsSequence;
    expect('SegmentIdentificationSequence' in group).toBe(false);
    // Other inherited fields are preserved.
    expect(group.PlanePositionSequence.ImagePositionPatient).toEqual([0, 0, 0]);
  });

  it('falls back to the frame module for a multiframe custom scheme', () => {
    const frameMetadata = (numberOfFrames) => ({
      get: (type) =>
        type === 'frameModule' ? { frameNumber: 3, numberOfFrames } : undefined,
    });

    expect(getReferencedFrameNumber('custom://abc', frameMetadata(5))).toBe(3);
    expect(
      getReferencedFrameNumber('custom://abc', frameMetadata(1))
    ).toBeUndefined();
  });

  describe('frame module fallback (!Number.isFinite(frameNumber))', () => {
    // Records every metadata.get call so tests can assert whether the fallback
    // branch ran (it is the only place get() is called).
    const makeMetadata = ({ providerFrame, instance, frameModule } = {}) => {
      const calls = [];
      const md = {
        calls,
        get: (type, imageId) => {
          calls.push(type);
          if (type === 'instance') {
            return instance;
          }
          if (type === 'frameModule') {
            return frameModule;
          }
          return undefined;
        },
      };
      if (providerFrame !== undefined) {
        md.getFrameInformationFromURL = () => providerFrame;
      }
      return md;
    };

    describe('skips the fallback when a finite frame is resolved', () => {
      it('uses the provider frame without consulting the frame module', () => {
        const md = makeMetadata({
          providerFrame: 6,
          frameModule: { frameNumber: 99, numberOfFrames: 100 },
        });

        expect(getReferencedFrameNumber('custom://abc', md)).toBe(6);
        expect(md.calls).toEqual([]);
      });

      it('coerces a numeric-string provider frame and skips the fallback', () => {
        const md = makeMetadata({
          providerFrame: '5',
          frameModule: { frameNumber: 99, numberOfFrames: 100 },
        });

        expect(getReferencedFrameNumber('custom://abc', md)).toBe(5);
        expect(md.calls).toEqual([]);
      });

      it('uses FrameRange (/frames/N) when the provider has no frame extractor', () => {
        const md = makeMetadata({
          frameModule: { frameNumber: 99, numberOfFrames: 100 },
        });

        expect(
          getReferencedFrameNumber('wadors:https://x/studies/1/frames/8', md)
        ).toBe(8);
        expect(md.calls).toEqual([]);
      });

      it('uses FrameRange (frameNumber=N) when the provider returns null', () => {
        const md = makeMetadata({
          providerFrame: null,
          frameModule: { frameNumber: 99, numberOfFrames: 100 },
        });

        expect(getReferencedFrameNumber('custom://abc?frameNumber=2', md)).toBe(
          2
        );
        expect(md.calls).toEqual([]);
      });
    });

    describe('enters the fallback when no finite frame is resolved', () => {
      it('enters when FrameRange finds no frame (null) and uses the frame module', () => {
        const md = makeMetadata({
          frameModule: { frameNumber: 4, numberOfFrames: 10 },
        });

        expect(getReferencedFrameNumber('custom://abc', md)).toBe(4);
        expect(md.calls).toEqual(['frameModule', 'instance']);
      });

      it('enters when the provider frame is non-numeric (NaN)', () => {
        const md = makeMetadata({
          providerFrame: 'abc',
          frameModule: { frameNumber: 2, numberOfFrames: 3 },
        });

        expect(getReferencedFrameNumber('custom://abc', md)).toBe(2);
        expect(md.calls).toContain('frameModule');
      });

      it('prefers instance NumberOfFrames over frameModule.numberOfFrames', () => {
        const md = makeMetadata({
          instance: { NumberOfFrames: '12' },
          frameModule: { frameNumber: 7, numberOfFrames: 1 },
        });

        expect(getReferencedFrameNumber('custom://abc', md)).toBe(7);
      });

      it('returns undefined for a single-frame instance', () => {
        const md = makeMetadata({
          instance: { NumberOfFrames: 1 },
          frameModule: { frameNumber: 1, numberOfFrames: 1 },
        });

        expect(getReferencedFrameNumber('custom://abc', md)).toBeUndefined();
        expect(md.calls).toContain('frameModule');
      });

      it('returns undefined when NumberOfFrames is unknown', () => {
        const md = makeMetadata({ frameModule: { frameNumber: 3 } });

        expect(getReferencedFrameNumber('custom://abc', md)).toBeUndefined();
      });

      it('returns undefined for a multiframe instance without a frameNumber', () => {
        const md = makeMetadata({ frameModule: { numberOfFrames: 5 } });

        expect(getReferencedFrameNumber('custom://abc', md)).toBeUndefined();
      });

      it('returns undefined without throwing when metadata is missing', () => {
        expect(
          getReferencedFrameNumber('custom://abc', undefined)
        ).toBeUndefined();
      });
    });
  });
});
