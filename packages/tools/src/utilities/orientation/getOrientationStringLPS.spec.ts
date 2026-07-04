import { describe, expect, it } from '@jest/globals';
import getOrientationStringLPS from './getOrientationStringLPS';
import invertOrientationStringLPS from './invertOrientationStringLPS';
import {
  BIPED_ORIENTATION_LABELS,
  QUADRUPED_ORIENTATION_LABELS,
} from './orientationLabels';

describe('getOrientationStringLPS', () => {
  describe('biped (default, human)', () => {
    it('maps each patient axis to its anatomical designator', () => {
      expect(getOrientationStringLPS([1, 0, 0])).toBe('L'); // +X Left
      expect(getOrientationStringLPS([-1, 0, 0])).toBe('R'); // -X Right
      expect(getOrientationStringLPS([0, 1, 0])).toBe('P'); // +Y Posterior
      expect(getOrientationStringLPS([0, -1, 0])).toBe('A'); // -Y Anterior
      expect(getOrientationStringLPS([0, 0, 1])).toBe('H'); // +Z Head
      expect(getOrientationStringLPS([0, 0, -1])).toBe('F'); // -Z Foot
    });

    it('combines designators for oblique directions', () => {
      expect(getOrientationStringLPS([1, 1, 0])).toBe('LP');
      expect(getOrientationStringLPS([1, 0, 1])).toBe('LH');
    });

    it('matches the explicitly passed biped labels', () => {
      expect(getOrientationStringLPS([1, 0, 0], BIPED_ORIENTATION_LABELS)).toBe(
        'L'
      );
    });
  });

  describe('quadruped (veterinary)', () => {
    it('maps each patient axis to its veterinary designator', () => {
      expect(
        getOrientationStringLPS([1, 0, 0], QUADRUPED_ORIENTATION_LABELS)
      ).toBe('LE'); // +X Left
      expect(
        getOrientationStringLPS([-1, 0, 0], QUADRUPED_ORIENTATION_LABELS)
      ).toBe('RT'); // -X Right
      expect(
        getOrientationStringLPS([0, 1, 0], QUADRUPED_ORIENTATION_LABELS)
      ).toBe('D'); // +Y Dorsal
      expect(
        getOrientationStringLPS([0, -1, 0], QUADRUPED_ORIENTATION_LABELS)
      ).toBe('V'); // -Y Ventral
      expect(
        getOrientationStringLPS([0, 0, 1], QUADRUPED_ORIENTATION_LABELS)
      ).toBe('CR'); // +Z Cranial
      expect(
        getOrientationStringLPS([0, 0, -1], QUADRUPED_ORIENTATION_LABELS)
      ).toBe('CD'); // -Z Caudal
    });

    it('combines multi-letter designators without delimiters', () => {
      // Left + Ventral, matching the DICOM "LEV" style example.
      expect(
        getOrientationStringLPS([1, -1, 0], QUADRUPED_ORIENTATION_LABELS)
      ).toBe('LEV');
    });
  });
});

describe('invertOrientationStringLPS', () => {
  describe('biped (default, human)', () => {
    it('swaps each designator for its opposite', () => {
      expect(invertOrientationStringLPS('L')).toBe('R');
      expect(invertOrientationStringLPS('P')).toBe('A');
      expect(invertOrientationStringLPS('H')).toBe('F');
      expect(invertOrientationStringLPS('LPS')).toBe('RAS');
      expect(invertOrientationStringLPS('HF')).toBe('FH');
    });
  });

  describe('quadruped (veterinary)', () => {
    it('swaps single- and multi-letter designators for their opposites', () => {
      expect(
        invertOrientationStringLPS('LE', QUADRUPED_ORIENTATION_LABELS)
      ).toBe('RT');
      expect(
        invertOrientationStringLPS('D', QUADRUPED_ORIENTATION_LABELS)
      ).toBe('V');
      expect(
        invertOrientationStringLPS('CR', QUADRUPED_ORIENTATION_LABELS)
      ).toBe('CD');
      expect(
        invertOrientationStringLPS('LECD', QUADRUPED_ORIENTATION_LABELS)
      ).toBe('RTCR');
    });
  });
});
