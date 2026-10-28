import { describe, expect, it } from '@jest/globals';
import getOrientationStringLPS from './getOrientationStringLPS';
import invertOrientationStringLPS from './invertOrientationStringLPS';
import {
  BIPED_ORIENTATION_LABELS,
  QUADRUPED_TRUNK_ORIENTATION_LABELS,
  QUADRUPED_HEAD_ORIENTATION_LABELS,
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

  describe('quadruped trunk (veterinary)', () => {
    it('maps the Z axis to cranial/caudal', () => {
      expect(
        getOrientationStringLPS([0, 0, 1], QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('CR'); // +Z Cranial
      expect(
        getOrientationStringLPS([0, 0, -1], QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('CD'); // -Z Caudal
    });

    it('shares left/right and dorsal/ventral with the head frame', () => {
      expect(
        getOrientationStringLPS([1, 0, 0], QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('LE'); // +X Left
      expect(
        getOrientationStringLPS([0, -1, 0], QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('V'); // -Y Ventral
    });

    it('combines multi-letter designators without delimiters', () => {
      // Left + Ventral, matching the DICOM "LEV" style example.
      expect(
        getOrientationStringLPS([1, -1, 0], QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('LEV');
    });
  });

  describe('quadruped head (veterinary)', () => {
    it('maps the Z axis to rostral/caudal instead of cranial/caudal', () => {
      expect(
        getOrientationStringLPS([0, 0, 1], QUADRUPED_HEAD_ORIENTATION_LABELS)
      ).toBe('R'); // +Z Rostral (toward the nose)
      expect(
        getOrientationStringLPS([0, 0, -1], QUADRUPED_HEAD_ORIENTATION_LABELS)
      ).toBe('CD'); // -Z Caudal
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

  describe('quadruped trunk (veterinary)', () => {
    it('swaps single- and multi-letter designators for their opposites', () => {
      expect(
        invertOrientationStringLPS('LE', QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('RT');
      expect(
        invertOrientationStringLPS('D', QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('V');
      expect(
        invertOrientationStringLPS('CR', QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('CD');
      expect(
        invertOrientationStringLPS('LECD', QUADRUPED_TRUNK_ORIENTATION_LABELS)
      ).toBe('RTCR');
    });
  });

  describe('quadruped head (veterinary)', () => {
    it('swaps rostral and caudal', () => {
      expect(
        invertOrientationStringLPS('R', QUADRUPED_HEAD_ORIENTATION_LABELS)
      ).toBe('CD');
      expect(
        invertOrientationStringLPS('CD', QUADRUPED_HEAD_ORIENTATION_LABELS)
      ).toBe('R');
    });
  });
});
