import { describe, it, expect } from '@jest/globals';
import modalityScaleNifti from '../src/helpers/modalityScaleNifti';
import {
  NIFTI_TYPE_UINT8,
  NIFTI_TYPE_INT8,
  NIFTI_TYPE_INT16,
  NIFTI_TYPE_UINT16,
  NIFTI_TYPE_FLOAT32,
} from '../src/helpers/niftiConstants';

function scale(datatypeCode, TypedArray, values, scl_slope, scl_inter) {
  const header = { datatypeCode, scl_slope, scl_inter };
  const buffer = TypedArray.from(values).buffer;
  return modalityScaleNifti(header, buffer);
}

describe('modalityScaleNifti', () => {
  describe('applies scl_slope and scl_inter when only one of them is set', () => {
    it('adds scl_inter when scl_slope is 1', () => {
      // Unsigned CT stored with a -1024 offset to Hounsfield units.
      const { scalarData } = scale(
        NIFTI_TYPE_UINT16,
        Uint16Array,
        [0, 1024, 2048],
        1,
        -1024
      );

      expect(Array.from(scalarData)).toEqual([-1024, 0, 1024]);
    });

    it('multiplies by scl_slope when scl_inter is 0', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_FLOAT32,
        Float32Array,
        [0, 2, 10],
        0.5,
        0
      );

      expect(Array.from(scalarData)).toEqual([0, 1, 5]);
    });

    it('multiplies by an integer scl_slope when scl_inter is 0', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_INT16,
        Int16Array,
        [-3, 0, 100],
        2,
        0
      );

      expect(scalarData).toBeInstanceOf(Int16Array);
      expect(Array.from(scalarData)).toEqual([-6, 0, 200]);
    });

    it('multiplies by scl_slope when scl_inter is NaN', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_FLOAT32,
        Float32Array,
        [1, 4],
        0.25,
        NaN
      );

      expect(Array.from(scalarData)).toEqual([0.25, 1]);
    });
  });

  describe('does not wrap scaled values that do not fit an integer array', () => {
    it('uint8 with scl_inter 10 keeps 250 + 10 = 260', () => {
      const { scalarData, pixelRepresentation } = scale(
        NIFTI_TYPE_UINT8,
        Uint8Array,
        [0, 250],
        1,
        10
      );

      expect(Array.from(scalarData)).toEqual([10, 260]);
      expect(scalarData).toBeInstanceOf(Float32Array);
      expect(pixelRepresentation).toBe(1);
    });

    it('int16 with scl_slope 2 keeps 2 * 20000 = 40000', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_INT16,
        Int16Array,
        [-20000, 0, 20000],
        2,
        0
      );

      expect(Array.from(scalarData)).toEqual([-40000, 0, 40000]);
      expect(scalarData).toBeInstanceOf(Float32Array);
    });

    it('int16 with a negative scl_slope uses the swapped scaled range', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_INT16,
        Int16Array,
        [-20000, 100],
        -2,
        0
      );

      expect(Array.from(scalarData)).toEqual([40000, -200]);
      expect(scalarData).toBeInstanceOf(Float32Array);
    });

    it('uint8 with scl_slope 2 and scl_inter 10 keeps 2 * 200 + 10 = 410', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_UINT8,
        Uint8Array,
        [0, 200],
        2,
        10
      );

      expect(Array.from(scalarData)).toEqual([10, 410]);
      expect(scalarData).toBeInstanceOf(Float32Array);
    });

    it('int16 with scl_slope 2 and scl_inter 1 keeps 2 * 20000 + 1 = 40001', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_INT16,
        Int16Array,
        [0, 20000],
        2,
        1
      );

      expect(Array.from(scalarData)).toEqual([1, 40001]);
      expect(scalarData).toBeInstanceOf(Float32Array);
    });

    it('int16 with scl_inter -1024 and values 0..4095 stays Int16Array', () => {
      const { scalarData, pixelRepresentation } = scale(
        NIFTI_TYPE_INT16,
        Int16Array,
        [0, 1024, 4095],
        1,
        -1024
      );

      expect(scalarData).toBeInstanceOf(Int16Array);
      expect(pixelRepresentation).toBe(1);
      expect(Array.from(scalarData)).toEqual([-1024, 0, 3071]);
    });
  });

  describe('guards', () => {
    it('uint16 with scl_slope 2 and scl_inter 1 stays Uint16Array when the values fit', () => {
      const { scalarData, pixelRepresentation } = scale(
        NIFTI_TYPE_UINT16,
        Uint16Array,
        [0, 30000],
        2,
        1
      );

      expect(scalarData).toBeInstanceOf(Uint16Array);
      expect(pixelRepresentation).toBe(0);
      expect(Array.from(scalarData)).toEqual([1, 60001]);
    });

    it('int8 with scl_slope 2 and scl_inter 1 fits the Int16Array allocated for int8', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_INT8,
        Int8Array,
        [-128, 0, 127],
        2,
        1
      );

      expect(scalarData).toBeInstanceOf(Int16Array);
      expect(Array.from(scalarData)).toEqual([-255, 1, 255]);
    });

    it.each([
      ['0', 0],
      ['NaN', NaN],
      ['undefined', undefined],
    ])(
      'does not scale when scl_slope is %s, even with a scl_inter (NIfTI-1: scale only for a nonzero slope)',
      (_label, slope) => {
        const { scalarData } = scale(
          NIFTI_TYPE_INT16,
          Int16Array,
          [0, 1000],
          slope,
          -1000
        );

        expect(Array.from(scalarData)).toEqual([0, 1000]);
      }
    );

    it('applies scl_slope and scl_inter when both are set', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_INT16,
        Int16Array,
        [0, 10, -10],
        2,
        -5
      );

      expect(Array.from(scalarData)).toEqual([-5, 15, -25]);
    });

    it('applies a float scl_slope and scl_inter', () => {
      const { scalarData } = scale(
        NIFTI_TYPE_UINT16,
        Uint16Array,
        [0, 100],
        0.5,
        -0.25
      );

      expect(Array.from(scalarData)).toEqual([-0.25, 49.75]);
      expect(scalarData).toBeInstanceOf(Float32Array);
    });

    it.each([
      ['1 and 0', 1, 0],
      ['0 and 0', 0, 0],
      ['NaN and NaN', NaN, NaN],
      ['undefined', undefined, undefined],
    ])(
      'leaves the values unchanged when scl_slope and scl_inter are %s',
      (_label, slope, inter) => {
        const { scalarData, pixelRepresentation } = scale(
          NIFTI_TYPE_UINT8,
          Uint8Array,
          [0, 7, 255],
          slope,
          inter
        );

        expect(scalarData).toBeInstanceOf(Uint8Array);
        expect(pixelRepresentation).toBe(0);
        expect(Array.from(scalarData)).toEqual([0, 7, 255]);
      }
    );
  });
});
