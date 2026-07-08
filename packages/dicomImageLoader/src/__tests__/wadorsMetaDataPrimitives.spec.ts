import { Enums } from '@cornerstonejs/core';

import getValue from '../imageLoader/wadors/metaData/getValue';
import getNumberValue from '../imageLoader/wadors/metaData/getNumberValue';
import getNumberValues from '../imageLoader/wadors/metaData/getNumberValues';
import getNumberString from '../imageLoader/wadors/metaData/getNumberString';
import getSequenceItems from '../imageLoader/wadors/metaData/getSequenceItems';
import { getFirstNumberValue } from '../imageLoader/wadors/metaData/getFirstNumberValue';
import getTagValue from '../imageLoader/wadors/getTagValue';
import { getImageQualityStatus } from '../imageLoader/wadors/getImageQualityStatus';
import { getUSEnhancedRegions } from '../imageLoader/wadors/metaData/USHelpers';
import {
  isNMModality,
  getImageTypeSubItemFromMetadata,
  extractOrientationFromNMMultiframeMetadata,
  extractPositionFromNMMultiframeMetadata,
} from '../imageLoader/wadors/metaData/NMHelpers';
import {
  extractOrientationFromMetadata,
  extractPositionFromMetadata,
} from '../imageLoader/wadors/metaData/extractPositioningFromMetadata';
import { combineFrameInstance } from '../imageLoader/wadors/combineFrameInstance';
import metaDataManager from '../imageLoader/wadors/metaDataManager';

describe('wadors metadata primitives', () => {
  describe('getValue', () => {
    it('returns the default value when the element is missing', () => {
      expect(getValue(undefined, 0, 'fallback')).toBe('fallback');
      expect(getValue(null, 0, 'fallback')).toBe('fallback');
    });

    it('returns the default value when Value is not present (zero length attribute)', () => {
      expect(getValue({ Value: undefined }, 0, 'fallback')).toBe('fallback');
    });

    it('returns the default value when the index is out of bounds', () => {
      expect(getValue({ Value: ['a', 'b'] }, 5, 'fallback')).toBe('fallback');
    });

    it('defaults the index to 0 when not provided', () => {
      expect(getValue({ Value: ['first', 'second'] })).toBe('first');
    });

    it('returns the value at the requested index', () => {
      expect(getValue({ Value: ['first', 'second'] }, 1)).toBe('second');
    });

    it('returns undefined when no default value is supplied and element is missing', () => {
      expect(getValue(undefined)).toBeUndefined();
    });
  });

  describe('getNumberValue', () => {
    it('returns undefined when the underlying value is undefined', () => {
      expect(getNumberValue(undefined)).toBeUndefined();
      expect(getNumberValue({ Value: undefined })).toBeUndefined();
    });

    it('parses a DS-style string value at the default index', () => {
      expect(getNumberValue({ Value: ['0.7', '0.8'] })).toBeCloseTo(0.7);
    });

    it('parses the value at the requested index', () => {
      expect(getNumberValue({ Value: ['0.7', '0.8'] }, 1)).toBeCloseTo(0.8);
    });

    it('coerces a numeric value through parseFloat', () => {
      // parseFloat() coerces its argument to a string first, so numeric
      // Values (not just DS strings) are also handled.
      expect(getNumberValue({ Value: [42] } as never)).toBe(42);
    });
  });

  describe('getNumberValues', () => {
    it('returns undefined when the element is missing', () => {
      expect(getNumberValues(undefined)).toBeUndefined();
    });

    it('returns undefined when Value is missing', () => {
      expect(getNumberValues({ Value: undefined })).toBeUndefined();
    });

    it('returns undefined when Value is not an array', () => {
      expect(
        getNumberValues({ Value: { foo: 'bar' } } as never)
      ).toBeUndefined();
    });

    it('gates on minimumLength, returning undefined when too short', () => {
      expect(getNumberValues({ Value: ['1', '2'] }, 3)).toBeUndefined();
    });

    it('returns the parsed values when length satisfies minimumLength', () => {
      const result = getNumberValues({ Value: ['1', '2', '3'] }, 3);
      expect(result).toHaveLength(3);
      result.forEach((value, index) => {
        expect(value).toBeCloseTo(index + 1);
      });
    });

    it('returns parsed values when minimumLength is not supplied, including empty arrays', () => {
      expect(getNumberValues({ Value: ['0.7', '0.7'] })).toEqual([0.7, 0.7]);
      expect(getNumberValues({ Value: [] })).toEqual([]);
    });
  });

  describe('getNumberString', () => {
    it('returns undefined when there is no element and no default value', () => {
      expect(getNumberString(undefined, 0, undefined)).toBeUndefined();
    });

    it('falls back to the default value and parses it', () => {
      // getValue() returns the raw defaultValue (5) since element is missing,
      // then getNumberString runs it through parseFloat(String(value)).
      expect(getNumberString(undefined, 0, 5)).toBe(5);
    });

    it('parses a string value at the given index', () => {
      expect(getNumberString({ Value: ['1.5', '2.5'] }, 1, 0)).toBeCloseTo(2.5);
    });
  });

  describe('getSequenceItems', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('returns an empty array when the element is missing', () => {
      expect(getSequenceItems(undefined)).toEqual([]);
    });

    it('returns an empty array when Value has zero length', () => {
      expect(getSequenceItems({ Value: [] })).toEqual([]);
    });

    it('returns the array as-is when Value is already an array', () => {
      const items = [{ a: 1 }, { b: 2 }];
      expect(getSequenceItems({ Value: items })).toBe(items);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns an empty array (without warning) for a plain object Value with no length property', () => {
      // Suspected product bug / dead branch: the leading guard
      // `if (!element?.Value?.length) return [];` short-circuits before the
      // "wrap object in array" branch is ever reached, because an ordinary
      // object like this has no `.length` property (undefined is falsy).
      // A single-item DICOMweb sequence returned as a bare object (the
      // exact case this function's warning claims to handle) is therefore
      // silently dropped to [] instead of being encapsulated + warned about.
      const item = { '00280030': { Value: ['1', '1'] } };
      const result = getSequenceItems({ Value: item });

      expect(result).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('wraps a non-array, array-like object Value (truthy .length) in an array and warns', () => {
      // Only an array-like object -- one that carries its own truthy
      // `.length` -- passes the leading guard and reaches the warn branch.
      const item = {
        length: 1,
        0: { '00280030': { Value: ['1', '1'] } },
      };
      const result = getSequenceItems({ Value: item });

      expect(result).toEqual([item]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('Value should be an array');
    });

    it('returns an empty array when Value is a non-object primitive with a truthy length', () => {
      // A non-empty string has a truthy `.length` (passes the leading
      // guard) but `typeof 'string' !== 'object'`, so it falls through to
      // the final `return []`.
      expect(getSequenceItems({ Value: 'not-an-array-or-object' })).toEqual([]);
    });
  });

  describe('getFirstNumberValue', () => {
    it('returns null when the key is entirely missing', () => {
      expect(getFirstNumberValue({}, 'missingKey')).toBeNull();
    });

    it('returns undefined (not null) when Value is an empty array', () => {
      // getNumberValues() returns [] (truthy) for an empty Value array, so
      // the `values ? values[0] : null` guard picks values[0] === undefined
      // rather than falling back to null.
      expect(
        getFirstNumberValue({ someKey: { Value: [] } }, 'someKey')
      ).toBeUndefined();
    });

    it('returns the first parsed number for a populated sequence', () => {
      expect(
        getFirstNumberValue({ someKey: { Value: ['1.5', '2.5'] } }, 'someKey')
      ).toBeCloseTo(1.5);
    });
  });

  describe('getTagValue', () => {
    it('returns the tag itself when it is falsy', () => {
      expect(getTagValue(undefined)).toBeUndefined();
      expect(getTagValue(null)).toBeNull();
    });

    it('returns the tag itself when Value is missing', () => {
      const tag = { vr: 'US' };
      expect(getTagValue(tag)).toBe(tag);
    });

    it('returns the first element by default (justElement=true)', () => {
      expect(getTagValue({ Value: ['A', 'B'] })).toBe('A');
    });

    it('returns the whole Value array when justElement is false', () => {
      expect(getTagValue({ Value: ['A', 'B'] }, false)).toEqual(['A', 'B']);
    });

    it('falls back to the whole array when the first element is falsy, even with justElement=true', () => {
      // `tag.Value[0] && justElement` short-circuits when Value[0] is a
      // falsy value like 0, so the full array is returned instead of the
      // single (falsy) element. This is surprising behavior pinned here.
      expect(getTagValue({ Value: [0, 5] })).toEqual([0, 5]);
      expect(getTagValue({ Value: ['', 'x'] })).toEqual(['', 'x']);
    });
  });

  describe('getImageQualityStatus', () => {
    it('returns SUBRESOLUTION when done is false, regardless of retrieveOptions', () => {
      expect(
        getImageQualityStatus(
          { imageQualityStatus: Enums.ImageQualityStatus.FULL_RESOLUTION },
          false
        )
      ).toBe(Enums.ImageQualityStatus.SUBRESOLUTION);
    });

    it('returns the retrieveOptions.imageQualityStatus when done is true', () => {
      expect(
        getImageQualityStatus(
          { imageQualityStatus: Enums.ImageQualityStatus.LOSSY },
          true
        )
      ).toBe(Enums.ImageQualityStatus.LOSSY);
    });

    it('defaults to FULL_RESOLUTION when done is true and no status is set', () => {
      expect(getImageQualityStatus({})).toBe(
        Enums.ImageQualityStatus.FULL_RESOLUTION
      );
    });

    it('defaults the done parameter to true', () => {
      expect(getImageQualityStatus({})).toBe(
        Enums.ImageQualityStatus.FULL_RESOLUTION
      );
    });
  });

  describe('USHelpers.getUSEnhancedRegions', () => {
    it('returns null when there is no Sequence of Ultrasound Regions', () => {
      expect(getUSEnhancedRegions({})).toBeNull();
    });

    it('returns null when the sequence is present but empty', () => {
      expect(getUSEnhancedRegions({ '00186011': { Value: [] } })).toBeNull();
    });

    it('extracts each region field via getFirstNumberValue', () => {
      const region = {
        '0018601A': { Value: ['0'] }, // regionLocationMinY0 (sic: Y in the loader, but tag is MinX0 per DICOM - value pinned as returned by source)
        '0018601E': { Value: ['100'] }, // regionLocationMaxY1
        '00186018': { Value: ['1'] }, // regionLocationMinX0
        '0018601C': { Value: ['101'] }, // regionLocationMaxX1
        '00186020': { Value: ['2'] }, // referencePixelX0
        '00186022': { Value: ['3'] }, // referencePixelY0
        '0018602C': { Value: ['0.5'] }, // physicalDeltaX
        '0018602E': { Value: ['0.6'] }, // physicalDeltaY
        '00186024': { Value: ['3'] }, // physicalUnitsXDirection
        '00186026': { Value: ['4'] }, // physicalUnitsYDirection
        '0018602A': { Value: ['5'] }, // referencePhysicalPixelValueY
        '00186028': { Value: ['6'] }, // referencePhysicalPixelValueX
        '00186012': { Value: ['1'] }, // regionSpatialFormat
        '00186014': { Value: ['2'] }, // regionDataType
        '00186016': { Value: ['0'] }, // regionFlags
        '00186030': { Value: ['3500000'] }, // transducerFrequency
      };

      const metadata = { '00186011': { Value: [region] } };
      const regions = getUSEnhancedRegions(metadata);

      expect(regions).toHaveLength(1);
      const r = regions[0];

      expect(r.regionLocationMinY0).toBe(0);
      expect(r.regionLocationMaxY1).toBe(100);
      expect(r.regionLocationMinX0).toBe(1);
      expect(r.regionLocationMaxX1).toBe(101);
      expect(r.referencePixelX0).toBe(2);
      expect(r.referencePixelY0).toBe(3);
      expect(r.physicalDeltaX).toBeCloseTo(0.5);
      expect(r.physicalDeltaY).toBeCloseTo(0.6);
      expect(r.physicalUnitsXDirection).toBe(3);
      expect(r.physicalUnitsYDirection).toBe(4);
      expect(r.referencePhysicalPixelValueY).toBe(5);
      expect(r.referencePhysicalPixelValueX).toBe(6);
      expect(r.regionSpatialFormat).toBe(1);
      expect(r.regionDataType).toBe(2);
      expect(r.regionFlags).toBe(0);
      expect(r.transducerFrequency).toBe(3500000);
    });

    it('returns undefined fields (not null/throw) for missing sub-tags', () => {
      const metadata = { '00186011': { Value: [{}] } };
      const regions = getUSEnhancedRegions(metadata);

      expect(regions).toHaveLength(1);
      // Every sub-tag lookup goes through getFirstNumberValue, which
      // returns null when the key is absent entirely.
      expect(regions[0].physicalDeltaX).toBeNull();
      expect(regions[0].regionSpatialFormat).toBeNull();
    });

    it('handles multiple regions', () => {
      const metadata = {
        '00186011': {
          Value: [
            { '00186012': { Value: ['1'] } },
            { '00186012': { Value: ['2'] } },
          ],
        },
      };
      const regions = getUSEnhancedRegions(metadata);

      expect(regions).toHaveLength(2);
      expect(regions[0].regionSpatialFormat).toBe(1);
      expect(regions[1].regionSpatialFormat).toBe(2);
    });
  });

  describe('NMHelpers', () => {
    describe('isNMModality', () => {
      it('returns true when Modality contains NM', () => {
        expect(isNMModality({ '00080060': { Value: ['NM'] } })).toBe(true);
      });

      it('returns false for a non-NM modality', () => {
        expect(isNMModality({ '00080060': { Value: ['CT'] } })).toBe(false);
      });

      it('throws when the Modality tag is absent (suspected product bug)', () => {
        // getValue() returns undefined (no default supplied), and the
        // source calls `.includes('NM')` on it unconditionally, so a
        // missing 00080060 tag throws a TypeError instead of returning
        // false. Pinning this actual (buggy) behavior rather than the
        // caller's assumption.
        expect(() => isNMModality({})).toThrow(TypeError);
      });
    });

    describe('getImageTypeSubItemFromMetadata', () => {
      it('returns undefined when Image Type tag is missing', () => {
        expect(getImageTypeSubItemFromMetadata({}, 2)).toBeUndefined();
      });

      it('returns the sub-item at the requested index', () => {
        const metaData = {
          '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'RECON TOMO'] },
        };
        expect(getImageTypeSubItemFromMetadata(metaData, 2)).toBe('RECON TOMO');
        expect(getImageTypeSubItemFromMetadata(metaData, 0)).toBe('ORIGINAL');
      });
    });

    describe('extractOrientationFromNMMultiframeMetadata', () => {
      it('returns undefined when the image sub-type is not reconstructable', () => {
        const metaData = {
          '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'TOMO'] },
        };
        expect(
          extractOrientationFromNMMultiframeMetadata(metaData)
        ).toBeUndefined();
      });

      it('returns undefined when reconstructable but no detector information sequence', () => {
        const metaData = {
          '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'RECON TOMO'] },
        };
        expect(
          extractOrientationFromNMMultiframeMetadata(metaData)
        ).toBeUndefined();
      });

      it('derives orientation from the Detector Information Sequence for RECON TOMO', () => {
        const metaData = {
          '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'RECON TOMO'] },
          '00540022': {
            Value: [
              {
                '00200037': {
                  Value: ['1', '0', '0', '0', '1', '0'],
                },
              },
            ],
          },
        };

        expect(extractOrientationFromNMMultiframeMetadata(metaData)).toEqual([
          1, 0, 0, 0, 1, 0,
        ]);
      });

      it('also works for RECON GATED TOMO', () => {
        const metaData = {
          '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'RECON GATED TOMO'] },
          '00540022': {
            Value: [
              {
                '00200037': {
                  Value: ['0', '1', '0', '0', '0', '-1'],
                },
              },
            ],
          },
        };

        expect(extractOrientationFromNMMultiframeMetadata(metaData)).toEqual([
          0, 1, 0, 0, 0, -1,
        ]);
      });
    });

    describe('extractPositionFromNMMultiframeMetadata', () => {
      it('derives position from the Detector Information Sequence for RECON TOMO', () => {
        const metaData = {
          '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'RECON TOMO'] },
          '00540022': {
            Value: [
              {
                '00200032': { Value: ['10', '20', '30'] },
              },
            ],
          },
        };

        expect(extractPositionFromNMMultiframeMetadata(metaData)).toEqual([
          10, 20, 30,
        ]);
      });

      it('returns undefined when not reconstructable', () => {
        const metaData = {
          '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'AXIAL'] },
          '00540022': {
            Value: [{ '00200032': { Value: ['10', '20', '30'] } }],
          },
        };

        expect(
          extractPositionFromNMMultiframeMetadata(metaData)
        ).toBeUndefined();
      });
    });
  });

  describe('extractPositioningFromMetadata', () => {
    it('prefers the direct Image Orientation Patient tag when present', () => {
      const metaData = {
        '00200037': { Value: ['1', '0', '0', '0', '1', '0'] },
      };
      expect(extractOrientationFromMetadata(metaData)).toEqual([
        1, 0, 0, 0, 1, 0,
      ]);
    });

    it('prefers the direct Image Position Patient tag when present', () => {
      const metaData = {
        '00200032': { Value: ['1', '2', '3'] },
      };
      expect(extractPositionFromMetadata(metaData)).toEqual([1, 2, 3]);
    });

    it('falls back to NM Detector Information Sequence orientation when direct tag is absent', () => {
      const metaData = {
        '00080060': { Value: ['NM'] },
        '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'RECON TOMO'] },
        '00540022': {
          Value: [{ '00200037': { Value: ['1', '0', '0', '0', '1', '0'] } }],
        },
      };
      expect(extractOrientationFromMetadata(metaData)).toEqual([
        1, 0, 0, 0, 1, 0,
      ]);
    });

    it('falls back to NM Detector Information Sequence position when direct tag is absent', () => {
      const metaData = {
        '00080060': { Value: ['NM'] },
        '00080008': { Value: ['ORIGINAL', 'PRIMARY', 'RECON TOMO'] },
        '00540022': {
          Value: [{ '00200032': { Value: ['10', '20', '30'] } }],
        },
      };
      expect(extractPositionFromMetadata(metaData)).toEqual([10, 20, 30]);
    });

    it('throws when neither the direct tag nor Modality is present (suspected product bug)', () => {
      // With no 00200037/00200032 and no 00080060, the fallback branch
      // calls isNMModality(), which throws on `.includes` (see NMHelpers
      // suite above). This propagates all the way up through
      // extractOrientationFromMetadata/extractPositionFromMetadata.
      expect(() => extractOrientationFromMetadata({})).toThrow(TypeError);
      expect(() => extractPositionFromMetadata({})).toThrow(TypeError);
    });

    it('does not throw when Modality is present but not NM, returning undefined', () => {
      const metaData = { '00080060': { Value: ['CT'] } };
      expect(extractOrientationFromMetadata(metaData)).toBeUndefined();
      expect(extractPositionFromMetadata(metaData)).toBeUndefined();
    });
  });

  describe('combineFrameInstance', () => {
    // Builds a fresh multiframe instance fixture so mutation performed by
    // combineFrameInstance() (it assigns into the passed-in instance) never
    // leaks between test cases.
    function buildInstance() {
      return {
        '00280010': { vr: 'US', Value: [512] },
        // Shared Functional Groups Sequence: one shared group item whose
        // macro ('00289110' - Pixel Measures Sequence) contains a single
        // Pixel Spacing ('00280030') value applied to every frame unless
        // overridden per-frame.
        '52009229': {
          Value: [
            {
              '00289110': {
                Value: [{ '00280030': { vr: 'DS', Value: ['1', '1'] } }],
              },
            },
          ],
        },
        // Per-Frame Functional Groups Sequence: 3 frames, each overriding
        // Pixel Spacing with a distinct value so we can assert
        // frameNumber-1 indexing.
        '52009230': {
          Value: [
            {
              '00209113': {
                Value: [{ '00280030': { vr: 'DS', Value: ['2', '2'] } }],
              },
            },
            {
              '00209113': {
                Value: [{ '00280030': { vr: 'DS', Value: ['3', '3'] } }],
              },
            },
            {
              '00209113': {
                Value: [{ '00280030': { vr: 'DS', Value: ['4', '4'] } }],
              },
            },
          ],
        },
        '00280008': { vr: 'IS', Value: [3] },
      } as never;
    }

    it('returns the instance unchanged when there is no per-frame data and NumberOfFrames <= 1', () => {
      const instance = { '00280010': { Value: [512] } } as never;
      const result = combineFrameInstance(1, instance);

      expect(result).toBe(instance);
    });

    it('uses frameNumber-1 indexing to select the per-frame override (frame 1 -> index 0)', () => {
      const instance = buildInstance();
      const result = combineFrameInstance(1, instance);

      expect(result['00280030'].Value).toEqual(['2', '2']);
      expect(result.frameNumber).toBe(1);
    });

    it('uses frameNumber-1 indexing to select the per-frame override (frame 3 -> index 2)', () => {
      const instance = buildInstance();
      const result = combineFrameInstance(3, instance);

      expect(result['00280030'].Value).toEqual(['4', '4']);
      expect(result.frameNumber).toBe(3);
    });

    it('applies the shared functional group first, then lets per-frame override it', () => {
      const instance = buildInstance();
      const result = combineFrameInstance(2, instance);

      // Per-frame value ('3','3') wins over the shared value ('1','1').
      expect(result['00280030'].Value).toEqual(['3', '3']);
    });

    it('falls back to the shared functional group value when no per-frame override exists for that key', () => {
      // Per-frame group only carries 00280030; other shared-only keys
      // should still surface via the shared merge step.
      const instance = buildInstance();
      instance['52009229'].Value[0]['00289110'].Value[0]['00280034'] = {
        vr: 'IS',
        Value: ['1', '1'],
      };
      const result = combineFrameInstance(2, instance);

      expect(result['00280034'].Value).toEqual(['1', '1']);
    });

    it('preserves non-multiframe keys unrelated to the functional groups', () => {
      const instance = buildInstance();
      const result = combineFrameInstance(2, instance);

      expect(result['00280010']).toEqual({ vr: 'US', Value: [512] });
    });

    it('mutates the passed-in instance object (Object.assign semantics) but returns a distinct object', () => {
      const instance = buildInstance();
      const result = combineFrameInstance(2, instance);

      // combineFrameInstance mutates `instance` in place (adds frameNumber
      // and overrides macro keys directly on it) ...
      expect((instance as never)['frameNumber']).toBe(2);
      expect((instance as never)['00280030'].Value).toEqual(['3', '3']);
      // ... yet the returned value is a different object identity (the
      // `rest` object built from destructuring), not `instance` itself.
      expect(result).not.toBe(instance);
    });

    it('retains the raw 52009229/52009230 sequence tags on the combined result', () => {
      // Pinning actual behavior: although 52009229/52009230 are destructured
      // out of `rest`, the final `Object.assign(rest, ..., newInstance)`
      // step re-merges them back in because `newInstance` is the same
      // object reference as the (still-intact) `instance`. So the combined
      // per-frame result is NOT stripped of the raw sequence tags.
      const instance = buildInstance();
      const result = combineFrameInstance(2, instance);

      expect(result['52009229']).toBeDefined();
      expect(result['52009230']).toBeDefined();
    });

    it('leaves 00280008 as the original tag element, not the resolved NumberOfFrames number (pinned quirk)', () => {
      // getMultiframeInformation() resolves NumberOfFrames to the raw
      // number (3) via getTagValue(), and combineFrameInstance() does
      // `Object.assign(rest, { '00280008': NumberOfFrames }, newInstance)`
      // intending to set 00280008 to that resolved number. But
      // `newInstance` is the very same object reference as `instance`,
      // whose own '00280008' property was only read into a local variable
      // (never deleted/overwritten on `instance` itself). Because
      // `newInstance` is merged in last, its still-original '00280008' tag
      // element clobbers the resolved number that was just set. Net
      // effect: 00280008 on the combined result is unchanged from the
      // input instance's raw tag object, not the plain number.
      const instance = buildInstance();
      const result = combineFrameInstance(2, instance);

      expect(result['00280008']).toEqual({ vr: 'IS', Value: [3] });
    });
  });

  describe('metaDataManager', () => {
    beforeEach(() => {
      metaDataManager.purge();
    });

    it('add/get roundtrips single-frame metadata by exact reference', () => {
      const metadata = { '00280010': { Value: [512] } } as never;
      metaDataManager.add(
        'wadors:http://server/study/1/series/1/instances/1',
        metadata
      );

      const result = metaDataManager.get(
        'wadors:http://server/study/1/series/1/instances/1'
      );

      expect(result).toBe(metadata);
    });

    it('marks isMultiframe as a non-enumerable property', () => {
      // Use an explicit NumberOfFrames of 1 so isMultiframe() resolves to a
      // real boolean `false` (see note below on the all-tags-absent case).
      const metadata = { '00280008': { Value: [1] } } as never;
      metaDataManager.add(
        'wadors:http://server/study/1/series/1/instances/1',
        metadata
      );

      expect((metadata as never)['isMultiframe']).toBe(false);
      expect(Object.keys(metadata)).not.toContain('isMultiframe');
      expect(JSON.stringify(metadata)).not.toContain('isMultiframe');
    });

    it('isMultiframe resolves to undefined (falsy, not strictly false) when no relevant tags exist at all', () => {
      // isMultiframe() returns `numberOfFrames && numberOfFrames > 1`. When
      // 00280008/52009229/52009230 are all absent, getValue() yields
      // undefined, and `undefined && ...` short-circuits to undefined
      // rather than false. Pinning this actual (loosely-typed) behavior.
      const metadata = { '00280010': { Value: [512] } } as never;
      metaDataManager.add(
        'wadors:http://server/study/1/series/1/instances/1',
        metadata
      );

      expect((metadata as never)['isMultiframe']).toBeUndefined();
    });

    it('keys metadata by URI, ignoring the imageId scheme prefix', () => {
      const metadata = { '00280010': { Value: [512] } } as never;
      metaDataManager.add(
        'wadors:http://server/study/1/series/1/instances/1',
        metadata
      );

      // Different scheme, same URI suffix after the first colon.
      const result = metaDataManager.get(
        'dicomweb:http://server/study/1/series/1/instances/1'
      );

      expect(result).toBe(metadata);
    });

    it('returns undefined for an imageId that was never added', () => {
      expect(
        metaDataManager.get('wadors:http://server/never/added')
      ).toBeUndefined();
    });

    it('remove() clears the metadata for an imageId', () => {
      const metadata = { '00280010': { Value: [512] } } as never;
      const imageId = 'wadors:http://server/study/1/series/1/instances/1';
      metaDataManager.add(imageId, metadata);

      metaDataManager.remove(imageId);

      expect(metaDataManager.get(imageId)).toBeUndefined();
    });

    it('purge() clears all metadata', () => {
      const metadataA = { '00280010': { Value: [512] } } as never;
      const metadataB = { '00280010': { Value: [256] } } as never;
      metaDataManager.add('wadors:http://server/a', metadataA);
      metaDataManager.add('wadors:http://server/b', metadataB);

      metaDataManager.purge();

      expect(metaDataManager.get('wadors:http://server/a')).toBeUndefined();
      expect(metaDataManager.get('wadors:http://server/b')).toBeUndefined();
    });

    describe('multiframe synthesis', () => {
      function buildFrame1Metadata() {
        return {
          '00280010': { vr: 'US', Value: [512] },
          '52009229': {
            Value: [
              {
                '00289110': {
                  Value: [{ '00280030': { vr: 'DS', Value: ['1', '1'] } }],
                },
              },
            ],
          },
          '52009230': {
            Value: [
              {
                '00209113': {
                  Value: [{ '00280030': { vr: 'DS', Value: ['2', '2'] } }],
                },
              },
              {
                '00209113': {
                  Value: [{ '00280030': { vr: 'DS', Value: ['3', '3'] } }],
                },
              },
              {
                '00209113': {
                  Value: [{ '00280030': { vr: 'DS', Value: ['4', '4'] } }],
                },
              },
            ],
          },
          '00280008': { vr: 'IS', Value: [3] },
        } as never;
      }

      const frame1Id =
        'wadors:http://server/studies/1/series/1/instances/1/frames/1';
      const frame2Id =
        'wadors:http://server/studies/1/series/1/instances/1/frames/2';
      const frame3Id =
        'wadors:http://server/studies/1/series/1/instances/1/frames/3';

      it('detects multiframe via presence of 52009230/52009229', () => {
        const metadata = buildFrame1Metadata();
        metaDataManager.add(frame1Id, metadata);

        expect((metadata as never)['isMultiframe']).toBe(true);
      });

      it('detects multiframe via NumberOfFrames > 1 even without functional group sequences', () => {
        const metadata = { '00280008': { Value: [2] } } as never;
        metaDataManager.add(frame1Id, metadata);

        expect((metadata as never)['isMultiframe']).toBe(true);
      });

      it('does not flag single-frame (NumberOfFrames == 1) metadata as multiframe', () => {
        const metadata = { '00280008': { Value: [1] } } as never;
        metaDataManager.add(frame1Id, metadata);

        expect((metadata as never)['isMultiframe']).toBe(false);
      });

      it('synthesizes frame N metadata from the frame-1 entry via combineFrameInstance', () => {
        metaDataManager.add(frame1Id, buildFrame1Metadata());

        const frame2 = metaDataManager.get(frame2Id);
        const frame3 = metaDataManager.get(frame3Id);

        expect(frame2['00280030'].Value).toEqual(['3', '3']); // index 1
        expect(frame2.frameNumber).toBe(2);
        expect(frame3['00280030'].Value).toEqual(['4', '4']); // index 2
        expect(frame3.frameNumber).toBe(3);
      });

      it('reuses the cached combined metadata object on repeated get() calls', () => {
        metaDataManager.add(frame1Id, buildFrame1Metadata());

        const first = metaDataManager.get(frame2Id);
        const second = metaDataManager.get(frame2Id);

        expect(first).toBe(second);
      });

      it('does not cross-contaminate cached frames when multiple frames are requested', () => {
        metaDataManager.add(frame1Id, buildFrame1Metadata());

        const frame2 = metaDataManager.get(frame2Id);
        // Fetching frame 3 mutates the shared frame-1 instance internally;
        // frame2's previously cached/returned object must still read back
        // its own frame-2 values afterward.
        metaDataManager.get(frame3Id);

        expect(frame2['00280030'].Value).toEqual(['3', '3']);
        expect(frame2.frameNumber).toBe(2);
      });

      it('returns undefined when requesting a frame whose frame-1 metadata was never registered', () => {
        const orphanFrameId =
          'wadors:http://server/studies/9/series/9/instances/9/frames/5';

        expect(metaDataManager.get(orphanFrameId)).toBeUndefined();
      });
    });
  });
});
