import { describe, it, expect } from '@jest/globals';
import { getImageIdOfSourceImageBySourceImageSequence } from '../src/adapters/Cornerstone/Segmentation_4X';

/**
 * Unit tests for getImageIdOfSourceImageBySourceImageSequence with a
 * SOPInstanceUID → imageId[] map (one imageId per frame, in frame order),
 * plus backwards compatibility with a SOPInstanceUID → imageId string map.
 */

const SOP = '1.2.3.4.5';

const resolve = (mapValue, ReferencedFrameNumber) =>
  getImageIdOfSourceImageBySourceImageSequence(
    ReferencedFrameNumber === undefined
      ? { ReferencedSOPInstanceUID: SOP }
      : { ReferencedSOPInstanceUID: SOP, ReferencedFrameNumber },
    { [SOP]: mapValue }
  );

describe('getImageIdOfSourceImageBySourceImageSequence', () => {
  describe('array-valued map (baseImageIds)', () => {
    it('returns the imageId at ReferencedFrameNumber - 1', () => {
      const ids = ['custom:a', 'custom:b', 'custom:c'];
      expect(resolve(ids, 1)).toBe('custom:a');
      expect(resolve(ids, 2)).toBe('custom:b');
      expect(resolve(ids, 3)).toBe('custom:c');
    });

    it('returns the first imageId unchanged without ReferencedFrameNumber', () => {
      expect(resolve(['custom:a', 'custom:b'])).toBe('custom:a');
      expect(resolve(['wadors:https://x/instances/1'])).toBe(
        'wadors:https://x/instances/1'
      );
    });

    it('prefers the frame rewrite over the list lookup for known schemes', () => {
      expect(
        resolve(['wadouri:https://x/a.dcm?frame=1', 'wadouri:other'], 2)
      ).toBe('wadouri:https://x/a.dcm?frame=2');
      expect(resolve(['wadors:https://x/instances/1'], 1)).toBe(
        'wadors:https://x/instances/1/frames/1'
      );
    });

    describe('rewrites the frame number of the first imageId', () => {
      it('rewrites frames/N', () => {
        expect(resolve(['wadors:https://x/instances/1/frames/1'], 4)).toBe(
          'wadors:https://x/instances/1/frames/4'
        );
      });

      it('rewrites dicomfile frame=N (1-based)', () => {
        expect(resolve(['dicomfile:42?frame=1'], 3)).toBe(
          'dicomfile:42?frame=3'
        );
      });

      it('rewrites wadouri ?frame=N', () => {
        expect(resolve(['wadouri:https://x/a.dcm?frame=1'], 5)).toBe(
          'wadouri:https://x/a.dcm?frame=5'
        );
      });

      it('rewrites &frame=N', () => {
        expect(resolve(['local:https://x/a.dcm?x=1&frame=1'], 2)).toBe(
          'local:https://x/a.dcm?x=1&frame=2'
        );
      });

      it('appends /frames/N for a wadors base without frames', () => {
        expect(resolve(['wadors:https://x/instances/1'], 2)).toBe(
          'wadors:https://x/instances/1/frames/2'
        );
      });

      it('appends ?frame=N for other schemes', () => {
        expect(resolve(['custom:abc'], 2)).toBe('custom:abc?frame=2');
      });

      it('uses the first imageId as the base, not a later one', () => {
        expect(resolve(['dicomfile:1?frame=1', 'dicomfile:2?frame=2'], 3)).toBe(
          'dicomfile:1?frame=3'
        );
      });
    });
  });

  describe('string-valued map (backwards compatibility)', () => {
    it('returns the imageId itself for frame 1', () => {
      expect(resolve('wadouri:https://x/a.dcm?frame=1', 1)).toBe(
        'wadouri:https://x/a.dcm?frame=1'
      );
    });

    it('rewrites the frame for later frames', () => {
      expect(resolve('wadouri:https://x/a.dcm?frame=1', 3)).toBe(
        'wadouri:https://x/a.dcm?frame=3'
      );
      expect(resolve('wadors:https://x/instances/1', 2)).toBe(
        'wadors:https://x/instances/1/frames/2'
      );
    });
  });

  describe('missing references', () => {
    it('returns undefined for an unknown SOPInstanceUID', () => {
      expect(
        getImageIdOfSourceImageBySourceImageSequence(
          { ReferencedSOPInstanceUID: 'unknown', ReferencedFrameNumber: 1 },
          { [SOP]: ['custom:a'] }
        )
      ).toBeUndefined();
    });

    it('returns undefined for an empty imageId list', () => {
      expect(resolve([], 1)).toBeUndefined();
    });
  });
});
