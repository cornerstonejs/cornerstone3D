import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { findReferenceSourceImageId } from '../src/adapters/Cornerstone/Segmentation_4X';

/**
 * findReferenceSourceImageId resolves a SEG frame to its source imageId using,
 * in order of precedence:
 *   1. PerFrameFunctionalGroupsSequence[frame] DerivationImageSequence
 *      (or the functional group's own SourceImageSequence)
 *   2. SharedFunctionalGroupsSequence DerivationImageSequence / SourceImageSequence,
 *      indexed by the frame
 *   3. Top-level SourceImageSequence[frame]
 *   4. Geometry match via ReferencedSeriesSequence (only with a per-frame group)
 */

const sopUIDImageIdIndexMap = {
  'sop.1': 'wadors:https://x/instances/sop.1',
  'sop.2': 'wadors:https://x/instances/sop.2',
  'sop.3': 'wadors:https://x/instances/sop.3',
};
const imageIds = Object.values(sopUIDImageIdIndexMap);

const ref = (sop) => ({ ReferencedSOPInstanceUID: sop });

const resolve = (multiframe, frameSegment = 0, metadataProvider = undefined) =>
  findReferenceSourceImageId(
    multiframe,
    frameSegment,
    imageIds,
    metadataProvider,
    1e-3,
    sopUIDImageIdIndexMap
  );

describe('findReferenceSourceImageId', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns undefined when no multiframe is given', () => {
    expect(resolve(undefined)).toBeUndefined();
  });

  describe('per-frame functional groups', () => {
    it('uses DerivationImageSequence[0].SourceImageSequence[0]', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [
          {
            DerivationImageSequence: [
              { SourceImageSequence: [ref('sop.2'), ref('sop.3')] },
            ],
          },
        ],
      };

      expect(resolve(multiframe, 0)).toBe(sopUIDImageIdIndexMap['sop.2']);
    });

    it('accepts non-array (naturalized single item) sequences', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [
          {
            DerivationImageSequence: {
              SourceImageSequence: ref('sop.3'),
            },
          },
        ],
      };

      expect(resolve(multiframe, 0)).toBe(sopUIDImageIdIndexMap['sop.3']);
    });

    it('falls back to the functional group SourceImageSequence', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [
          { SourceImageSequence: [ref('sop.1')] },
          { SourceImageSequence: [ref('sop.2')] },
        ],
      };

      expect(resolve(multiframe, 1)).toBe(sopUIDImageIdIndexMap['sop.2']);
    });

    it('takes precedence over shared and top-level sequences', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [
          {
            DerivationImageSequence: [{ SourceImageSequence: [ref('sop.1')] }],
          },
        ],
        SharedFunctionalGroupsSequence: {
          DerivationImageSequence: [{ SourceImageSequence: [ref('sop.2')] }],
        },
        SourceImageSequence: [ref('sop.3')],
      };

      expect(resolve(multiframe, 0)).toBe(sopUIDImageIdIndexMap['sop.1']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('preserves ReferencedFrameNumber for multiframe sources', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [
          {
            DerivationImageSequence: [
              {
                SourceImageSequence: [
                  {
                    ReferencedSOPInstanceUID: 'sop.1',
                    ReferencedFrameNumber: 4,
                  },
                ],
              },
            ],
          },
        ],
      };

      expect(resolve(multiframe, 0)).toBe(
        'wadors:https://x/instances/sop.1/frames/4'
      );
    });
  });

  describe('shared functional groups', () => {
    it('is used when there are no per-frame functional groups', () => {
      const multiframe = {
        SharedFunctionalGroupsSequence: {
          DerivationImageSequence: [
            {
              SourceImageSequence: [ref('sop.1'), ref('sop.2'), ref('sop.3')],
            },
          ],
        },
      };

      expect(resolve(multiframe, 0)).toBe(sopUIDImageIdIndexMap['sop.1']);
      expect(resolve(multiframe, 1)).toBe(sopUIDImageIdIndexMap['sop.2']);
      expect(resolve(multiframe, 2)).toBe(sopUIDImageIdIndexMap['sop.3']);
      expect(warnSpy).toHaveBeenCalledWith(
        'Using SharedFunctionalGroupsSequence SourceImageSequence.'
      );
    });

    it('is used when the per-frame group has no source reference', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [{}, {}],
        SharedFunctionalGroupsSequence: {
          SourceImageSequence: [ref('sop.1'), ref('sop.2')],
        },
      };

      expect(resolve(multiframe, 1)).toBe(sopUIDImageIdIndexMap['sop.2']);
    });

    it('takes precedence over the top-level SourceImageSequence', () => {
      const multiframe = {
        SharedFunctionalGroupsSequence: {
          SourceImageSequence: [ref('sop.2')],
        },
        SourceImageSequence: [ref('sop.3')],
      };

      expect(resolve(multiframe, 0)).toBe(sopUIDImageIdIndexMap['sop.2']);
    });
  });

  describe('top-level SourceImageSequence', () => {
    it('is used when no functional group references a source', () => {
      const multiframe = {
        SourceImageSequence: [ref('sop.1'), ref('sop.2'), ref('sop.3')],
      };

      expect(resolve(multiframe, 2)).toBe(sopUIDImageIdIndexMap['sop.3']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('using top-level SourceImageSequence')
      );
    });

    it('is used when PerFrameFunctionalGroupsSequence is empty', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [],
        SourceImageSequence: [ref('sop.1')],
      };

      expect(resolve(multiframe, 0)).toBe(sopUIDImageIdIndexMap['sop.1']);
    });

    it('is ignored when empty', () => {
      expect(resolve({ SourceImageSequence: [] }, 0)).toBeUndefined();
    });
  });

  describe('unresolvable references', () => {
    it('returns undefined when the referenced SOP is not loaded', () => {
      const multiframe = {
        PerFrameFunctionalGroupsSequence: [
          {
            DerivationImageSequence: [
              { SourceImageSequence: [ref('missing')] },
            ],
          },
        ],
      };

      expect(resolve(multiframe, 0)).toBeUndefined();
    });

    it('returns undefined for an empty multiframe', () => {
      expect(resolve({}, 0)).toBeUndefined();
    });
  });

  describe('geometry fallback (ReferencedSeriesSequence)', () => {
    const position = [0, 0, 5];
    const metadataProvider = {
      get: (type, imageId) => {
        if (type === 'generalSeriesModule') {
          return { seriesInstanceUID: 'series.1' };
        }
        if (type === 'imagePlaneModule') {
          return {
            frameOfReferenceUID: 'for.1',
            imagePositionPatient:
              imageId === sopUIDImageIdIndexMap['sop.2']
                ? position
                : [0, 0, 99],
          };
        }
        return undefined;
      },
    };

    const geometryMultiframe = (perFrame) => ({
      FrameOfReferenceUID: 'for.1',
      ReferencedSeriesSequence: { SeriesInstanceUID: 'series.1' },
      PerFrameFunctionalGroupsSequence: perFrame,
    });

    it('is not attempted without a per-frame functional group', () => {
      const getSpy = jest.fn(metadataProvider.get);

      expect(
        resolve(geometryMultiframe(undefined), 0, { get: getSpy })
      ).toBeUndefined();
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('is not attempted when the frame index has no per-frame group', () => {
      const getSpy = jest.fn(metadataProvider.get);
      const multiframe = geometryMultiframe([
        { PlanePositionSequence: [{ ImagePositionPatient: position }] },
      ]);

      expect(resolve(multiframe, 5, { get: getSpy })).toBeUndefined();
      expect(getSpy).not.toHaveBeenCalled();
    });
  });
});
