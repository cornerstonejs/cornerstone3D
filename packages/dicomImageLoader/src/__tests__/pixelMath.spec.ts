/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the pure pixel-math layer of dicomImageLoader.
 *
 * These modules are only exercised indirectly today via karma decode
 * fixtures (images run through the whole decode pipeline). This spec drives
 * them directly with tiny, hand-derived byte vectors so the arithmetic
 * (color-space conversion coefficients, LUT shifting, scaling, min/max,
 * typed-array selection) is pinned down independently of any codec/worker.
 *
 * All expected values for the YCbCr -> RGB conversions were derived by
 * applying the *exact* formula implemented in the source files:
 *   r = y + 1.402    * (cr - 128)
 *   g = y - 0.34414  * (cb - 128) - 0.71414 * (cr - 128)
 *   b = y + 1.772    * (cb - 128)
 * and then clamping/rounding the way a Uint8ClampedArray does (round to
 * nearest, clamp to [0, 255]) -- which is how these converters are used in
 * production (the color buffer passed in is a Uint8ClampedArray). The
 * derivations are written out in comments next to each vector.
 */

import convertRGBColorByPixel from '../imageLoader/colorSpaceConverters/convertRGBColorByPixel';
import convertRGBColorByPlane from '../imageLoader/colorSpaceConverters/convertRGBColorByPlane';
import convertYBRFullByPixel from '../imageLoader/colorSpaceConverters/convertYBRFullByPixel';
import convertYBRFullByPlane from '../imageLoader/colorSpaceConverters/convertYBRFullByPlane';
import convertYBRFull422ByPixel from '../imageLoader/colorSpaceConverters/convertYBRFull422ByPixel';
import convertPaletteColor from '../imageLoader/colorSpaceConverters/convertPALETTECOLOR';
import convertColorSpace from '../imageLoader/convertColorSpace';
import removeAFromRGBA from '../imageLoader/removeAFromRGBA';
import isColorConversionRequired from '../imageLoader/isColorConversionRequired';
import isJPEGBaseline8BitColor from '../imageLoader/isJPEGBaseline8BitColor';
import getMinMaxShared from '../shared/getMinMax';
import getMinMaxImageLoader from '../imageLoader/getMinMax';
import getPixelDataTypeFromMinMax, {
  validatePixelDataType,
} from '../shared/getPixelDataTypeFromMinMax';
import setPixelDataType from '../imageLoader/setPixelDataType';
import isColorImage from '../shared/isColorImage';
import scaleArray from '../shared/scaling/scaleArray';
import bilinear from '../shared/scaling/bilinear';
import replicate from '../shared/scaling/replicate';

describe('pixelMath', () => {
  // ---------------------------------------------------------------------
  // colorSpaceConverters/convertRGBColorByPixel
  // ---------------------------------------------------------------------
  describe('convertRGBColorByPixel', () => {
    // Interleaved input: pixel0 = (10,20,30), pixel1 = (40,50,60)
    const imageFrame = [10, 20, 30, 40, 50, 60];

    it('produces RGBA with alpha=255 when useRGBA is true', () => {
      const colorBuffer = new Uint8ClampedArray(8);
      convertRGBColorByPixel(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        10, 20, 30, 255, 40, 50, 60, 255,
      ]);
    });

    it('copies the buffer through unchanged (RGB) when useRGBA is false', () => {
      // The non-RGBA branch just does colorBuffer.set(imageFrame) - i.e. a
      // straight copy, not a de-interleave.
      const colorBuffer = new Uint8ClampedArray(6);
      convertRGBColorByPixel(imageFrame, colorBuffer, false);
      expect(Array.from(colorBuffer)).toEqual([10, 20, 30, 40, 50, 60]);
    });

    it('throws when imageFrame is undefined', () => {
      expect(() =>
        convertRGBColorByPixel(undefined, new Uint8ClampedArray(4), true)
      ).toThrow('decodeRGB: rgbBuffer must be defined');
    });

    it('throws when length is not divisible by 3', () => {
      expect(() =>
        convertRGBColorByPixel([1, 2], new Uint8ClampedArray(4), true)
      ).toThrow('decodeRGB: rgbBuffer length 2 must be divisible by 3');
    });
  });

  // ---------------------------------------------------------------------
  // colorSpaceConverters/convertRGBColorByPlane
  // ---------------------------------------------------------------------
  describe('convertRGBColorByPlane', () => {
    // Planar input: r-plane=[10,40], g-plane=[20,50], b-plane=[30,60]
    // -> pixel0=(10,20,30), pixel1=(40,50,60)
    const imageFrame = [10, 40, 20, 50, 30, 60];

    it('de-interleaves planes into RGBA when useRGBA is true', () => {
      const colorBuffer = new Uint8ClampedArray(8);
      convertRGBColorByPlane(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        10, 20, 30, 255, 40, 50, 60, 255,
      ]);
    });

    it('de-interleaves planes into RGB when useRGBA is false', () => {
      const colorBuffer = new Uint8ClampedArray(6);
      convertRGBColorByPlane(imageFrame, colorBuffer, false);
      expect(Array.from(colorBuffer)).toEqual([10, 20, 30, 40, 50, 60]);
    });

    it('throws when imageFrame is undefined', () => {
      expect(() =>
        convertRGBColorByPlane(undefined, new Uint8ClampedArray(4), true)
      ).toThrow('decodeRGB: rgbBuffer must be defined');
    });

    it('throws when length is not divisible by 3', () => {
      expect(() =>
        convertRGBColorByPlane([1, 2], new Uint8ClampedArray(4), true)
      ).toThrow('decodeRGB: rgbBuffer length 2 must be divisible by 3');
    });
  });

  // ---------------------------------------------------------------------
  // colorSpaceConverters/convertYBRFullByPixel
  // ---------------------------------------------------------------------
  describe('convertYBRFullByPixel', () => {
    // pixel0: y=128,cb=128,cr=128 (neutral gray) -> r=g=b=128 exactly
    //   r = 128 + 1.402*(128-128)   = 128
    //   g = 128 - 0.34414*0 - 0.71414*0 = 128
    //   b = 128 + 1.772*(128-128)   = 128
    // pixel1: y=100,cb=150,cr=200
    //   r = 100 + 1.402*(200-128)   = 100 + 1.402*72   = 100 + 100.944  = 200.944 -> round 201
    //   g = 100 - 0.34414*(150-128) - 0.71414*(200-128)
    //     = 100 - 0.34414*22 - 0.71414*72
    //     = 100 - 7.57108 - 51.41808 = 41.01084 -> round 41
    //   b = 100 + 1.772*(150-128)   = 100 + 1.772*22   = 100 + 38.984   = 138.984 -> round 139
    const imageFrame = [128, 128, 128, 100, 150, 200];

    it('converts YBR to RGBA (alpha=255)', () => {
      const colorBuffer = new Uint8ClampedArray(8);
      convertYBRFullByPixel(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        128, 128, 128, 255, 201, 41, 139, 255,
      ]);
    });

    it('converts YBR to RGB (no alpha)', () => {
      const colorBuffer = new Uint8ClampedArray(6);
      convertYBRFullByPixel(imageFrame, colorBuffer, false);
      expect(Array.from(colorBuffer)).toEqual([128, 128, 128, 201, 41, 139]);
    });

    it('clamps out-of-range results to [0,255]', () => {
      // pixel0: y=255,cb=255,cr=255
      //   r = 255 + 1.402*127 = 255 + 178.054 = 433.054 -> clamp 255
      //   g = 255 - 0.34414*127 - 0.71414*127 = 255 - 43.70578 - 90.69578 = 120.59844 -> round 121
      //   b = 255 + 1.772*127 = 255 + 225.044 = 480.044 -> clamp 255
      // pixel1: y=0,cb=0,cr=0
      //   r = 0 + 1.402*(-128) = -179.456 -> clamp 0
      //   g = 0 - 0.34414*(-128) - 0.71414*(-128) = 44.05192 + 91.40992 = 135.46184 -> round 135
      //   b = 0 + 1.772*(-128) = -226.816 -> clamp 0
      const colorBuffer = new Uint8ClampedArray(8);
      convertYBRFullByPixel([255, 255, 255, 0, 0, 0], colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        255, 121, 255, 255, 0, 135, 0, 255,
      ]);
    });

    it('throws when imageFrame is undefined', () => {
      expect(() =>
        convertYBRFullByPixel(undefined, new Uint8ClampedArray(4), true)
      ).toThrow('convertYBRFullByPixel: ybrBuffer must be defined');
    });

    it('throws when length is not divisible by 3', () => {
      expect(() =>
        convertYBRFullByPixel([1, 2], new Uint8ClampedArray(4), true)
      ).toThrow(
        'convertYBRFullByPixel: ybrBuffer length 2 must be divisible by 3'
      );
    });
  });

  // ---------------------------------------------------------------------
  // colorSpaceConverters/convertYBRFullByPlane
  // ---------------------------------------------------------------------
  describe('convertYBRFullByPlane', () => {
    it('converts planar YBR to RGBA using the same coefficients as by-pixel', () => {
      // Same 2 logical pixels as the convertYBRFullByPixel test above, but
      // laid out as planes: y=[128,100], cb=[128,150], cr=[128,200]
      const imageFrame = [128, 100, 128, 150, 128, 200];
      const colorBuffer = new Uint8ClampedArray(8);
      convertYBRFullByPlane(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        128, 128, 128, 255, 201, 41, 139, 255,
      ]);
    });

    it('converts planar YBR to RGB (no alpha)', () => {
      const imageFrame = [128, 100, 128, 150, 128, 200];
      const colorBuffer = new Uint8ClampedArray(6);
      convertYBRFullByPlane(imageFrame, colorBuffer, false);
      expect(Array.from(colorBuffer)).toEqual([128, 128, 128, 201, 41, 139]);
    });

    it('throws when imageFrame is undefined', () => {
      expect(() =>
        convertYBRFullByPlane(undefined, new Uint8ClampedArray(4), true)
      ).toThrow('convertYBRFullByPlane: ybrBuffer must be defined');
    });

    it('throws when length is not divisible by 3', () => {
      expect(() =>
        convertYBRFullByPlane([1, 2], new Uint8ClampedArray(4), true)
      ).toThrow(
        'convertYBRFullByPlane: ybrBuffer length 2 must be divisible by 3'
      );
    });
  });

  // ---------------------------------------------------------------------
  // colorSpaceConverters/convertYBRFull422ByPixel (chroma subsampling: two
  // luma samples share one Cb/Cr pair)
  // ---------------------------------------------------------------------
  describe('convertYBRFull422ByPixel', () => {
    // Group 1: y1=100, y2=150, cb=150, cr=200 (shared chroma)
    //   pixel0 (y1=100): same math as the convertYBRFullByPixel "colorful"
    //     case above -> (201, 41, 139)
    //   pixel1 (y2=150):
    //     r = 150 + 1.402*72 = 150 + 100.944 = 250.944 -> round 251
    //     g = 150 - 7.57108 - 51.41808 = 91.01084 -> round 91
    //     b = 150 + 38.984 = 188.984 -> round 189
    // Group 2: y1=255, y2=0, cb=0, cr=0 (shared chroma)
    //   pixel2 (y1=255): same math as the clamp case above -> (76, 255, 28)
    //     r = 255 + 1.402*(-128) = 255 - 179.456 = 75.544 -> round 76
    //     g = 255 - 0.34414*(-128) - 0.71414*(-128)
    //       = 255 + 44.05192 + 91.40992 = 390.46184 -> clamp 255
    //     b = 255 + 1.772*(-128) = 255 - 226.816 = 28.184 -> round 28
    //   pixel3 (y2=0): same math as (0,0,0) case above -> (0, 135, 0)
    const imageFrame = [100, 150, 150, 200, 255, 0, 0, 0];

    it('reconstructs 4 RGBA pixels from 2 luma+shared-chroma groups', () => {
      const colorBuffer = new Uint8ClampedArray(16);
      convertYBRFull422ByPixel(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        201, 41, 139, 255, 251, 91, 189, 255, 76, 255, 28, 255, 0, 135, 0, 255,
      ]);
    });

    it('reconstructs 4 RGB pixels (no alpha) from 2 luma+shared-chroma groups', () => {
      const colorBuffer = new Uint8ClampedArray(12);
      convertYBRFull422ByPixel(imageFrame, colorBuffer, false);
      expect(Array.from(colorBuffer)).toEqual([
        201, 41, 139, 251, 91, 189, 76, 255, 28, 0, 135, 0,
      ]);
    });

    it('throws when imageFrame is undefined', () => {
      expect(() =>
        convertYBRFull422ByPixel(undefined, new Uint8ClampedArray(4), true)
      ).toThrow('convertYBRFull422ByPixel: ybrBuffer must be defined');
    });

    it('throws when length is not divisible by 2', () => {
      expect(() =>
        convertYBRFull422ByPixel([1, 2, 3], new Uint8ClampedArray(4), true)
      ).toThrow(
        'convertYBRFull422ByPixel: ybrBuffer length 3 must be divisible by 2'
      );
    });
  });

  // ---------------------------------------------------------------------
  // colorSpaceConverters/convertPALETTECOLOR
  // ---------------------------------------------------------------------
  describe('convertPaletteColor', () => {
    it('maps 8-bit palette indices to RGBA (shift=0)', () => {
      const imageFrame = {
        columns: 4,
        rows: 1,
        pixelData: [0, 1, 2, 3],
        redPaletteColorLookupTableData: [10, 20, 30, 40],
        greenPaletteColorLookupTableData: [50, 60, 70, 80],
        bluePaletteColorLookupTableData: [90, 100, 110, 120],
        // descriptor = [numEntries (unused by this fn), start, bitsStored]
        redPaletteColorLookupTableDescriptor: [4, 0, 8],
      };
      const colorBuffer = new Uint8ClampedArray(16);
      convertPaletteColor(imageFrame as any, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        10, 50, 90, 255, 20, 60, 100, 255, 30, 70, 110, 255, 40, 80, 120, 255,
      ]);
    });

    it('produces RGB (no alpha) when useRGBA is false', () => {
      const imageFrame = {
        columns: 2,
        rows: 1,
        pixelData: [0, 1],
        redPaletteColorLookupTableData: [10, 20],
        greenPaletteColorLookupTableData: [30, 40],
        bluePaletteColorLookupTableData: [50, 60],
        redPaletteColorLookupTableDescriptor: [2, 0, 8],
      };
      const colorBuffer = new Uint8ClampedArray(6);
      convertPaletteColor(imageFrame as any, colorBuffer, false);
      expect(Array.from(colorBuffer)).toEqual([10, 30, 50, 20, 40, 60]);
    });

    it('clamps pixel values below start to index 0, and above (start+len-1) to the last entry', () => {
      const imageFrame = {
        columns: 2,
        rows: 1,
        // 10 is above start(0)+len-1(3) -> clamps to last index (3)
        // -5 is below start(0) -> clamps to index 0
        pixelData: [10, -5],
        redPaletteColorLookupTableData: [10, 20, 30, 40],
        greenPaletteColorLookupTableData: [50, 60, 70, 80],
        bluePaletteColorLookupTableData: [90, 100, 110, 120],
        redPaletteColorLookupTableDescriptor: [4, 0, 8],
      };
      const colorBuffer = new Uint8ClampedArray(8);
      convertPaletteColor(imageFrame as any, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        40, 80, 120, 255, 10, 50, 90, 255,
      ]);
    });

    it('shifts a 16-bit LUT down by 8 bits when values actually exceed 255', () => {
      // bitsStored=16 AND at least one LUT value > 255 -> shift = 8
      // r: 0>>8=0, 256>>8=1, 512>>8=2, 65535>>8=255
      // g: 0>>8=0, 512>>8=2, 1024>>8=4, 65535>>8=255
      // b: 0>>8=0, 1024>>8=4, 2048>>8=8, 65535>>8=255
      const imageFrame = {
        columns: 4,
        rows: 1,
        pixelData: [0, 1, 2, 3],
        redPaletteColorLookupTableData: [0, 256, 512, 65535],
        greenPaletteColorLookupTableData: [0, 512, 1024, 65535],
        bluePaletteColorLookupTableData: [0, 1024, 2048, 65535],
        redPaletteColorLookupTableDescriptor: [4, 0, 16],
      };
      const colorBuffer = new Uint8ClampedArray(16);
      convertPaletteColor(imageFrame as any, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        0, 0, 0, 255, 1, 2, 4, 255, 2, 4, 8, 255, 255, 255, 255, 255,
      ]);
    });

    it('does NOT shift a 16-bit-labeled LUT whose values are all <= 255 (avoids zeroing)', () => {
      // bitsStored=16 but every LUT value is already <= 255 -> shift stays 0
      // per the source's own guard comment ("use shift 0 to avoid zeroing")
      const imageFrame = {
        columns: 4,
        rows: 1,
        pixelData: [0, 1, 2, 3],
        redPaletteColorLookupTableData: [0, 50, 100, 200],
        greenPaletteColorLookupTableData: [0, 60, 110, 210],
        bluePaletteColorLookupTableData: [0, 70, 120, 220],
        redPaletteColorLookupTableDescriptor: [4, 0, 16],
      };
      const colorBuffer = new Uint8ClampedArray(16);
      convertPaletteColor(imageFrame as any, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        0, 0, 0, 255, 50, 60, 70, 255, 100, 110, 120, 255, 200, 210, 220, 255,
      ]);
    });

    it('honors a non-zero descriptor start value', () => {
      const imageFrame = {
        columns: 3,
        rows: 1,
        pixelData: [100, 101, 102], // stored values offset by start=100
        redPaletteColorLookupTableData: [5, 15, 25],
        greenPaletteColorLookupTableData: [6, 16, 26],
        bluePaletteColorLookupTableData: [7, 17, 27],
        redPaletteColorLookupTableDescriptor: [3, 100, 8],
      };
      const colorBuffer = new Uint8ClampedArray(12);
      convertPaletteColor(imageFrame as any, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        5, 6, 7, 255, 15, 16, 17, 255, 25, 26, 27, 255,
      ]);
    });

    it('throws when palette LUT data is incomplete', () => {
      const imageFrame = {
        columns: 1,
        rows: 1,
        pixelData: [0],
        redPaletteColorLookupTableData: undefined,
        greenPaletteColorLookupTableData: [1],
        bluePaletteColorLookupTableData: [1],
        redPaletteColorLookupTableDescriptor: [1, 0, 8],
      };
      expect(() =>
        convertPaletteColor(imageFrame as any, new Uint8ClampedArray(4), true)
      ).toThrow(
        'The image does not have a complete color palette. R, G, and B palette data are required.'
      );
    });
  });

  // ---------------------------------------------------------------------
  // convertColorSpace dispatcher
  // ---------------------------------------------------------------------
  describe('convertColorSpace', () => {
    it('routes RGB + planarConfiguration=0 to convertRGBColorByPixel', () => {
      const imageFrame = {
        photometricInterpretation: 'RGB',
        planarConfiguration: 0,
        pixelData: [10, 20, 30, 40, 50, 60],
      };
      const colorBuffer = new Uint8ClampedArray(8);
      convertColorSpace(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        10, 20, 30, 255, 40, 50, 60, 255,
      ]);
    });

    it('routes RGB + planarConfiguration=1 to convertRGBColorByPlane', () => {
      const imageFrame = {
        photometricInterpretation: 'RGB',
        planarConfiguration: 1,
        pixelData: [10, 40, 20, 50, 30, 60],
      };
      const colorBuffer = new Uint8ClampedArray(8);
      convertColorSpace(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        10, 20, 30, 255, 40, 50, 60, 255,
      ]);
    });

    it.each(['YBR_RCT', 'YBR_ICT', 'YBR_PARTIAL_420'])(
      'falls back to RGB-by-pixel for %s, ignoring planarConfiguration',
      (pmi) => {
        // Per DICOM PS3.5 sect 8.2, by-plane is not permitted for these PMIs,
        // so the dispatcher always treats the data as RGB-by-pixel even when
        // planarConfiguration says otherwise.
        const imageFrame = {
          photometricInterpretation: pmi,
          planarConfiguration: 1, // deliberately "wrong" to prove it's ignored
          pixelData: [10, 20, 30, 40, 50, 60],
        };
        const colorBuffer = new Uint8ClampedArray(8);
        convertColorSpace(imageFrame, colorBuffer, true);
        expect(Array.from(colorBuffer)).toEqual([
          10, 20, 30, 255, 40, 50, 60, 255,
        ]);
      }
    );

    it('routes PALETTE COLOR to convertPaletteColor', () => {
      const imageFrame = {
        photometricInterpretation: 'PALETTE COLOR',
        columns: 2,
        rows: 1,
        pixelData: [0, 1],
        redPaletteColorLookupTableData: [10, 20],
        greenPaletteColorLookupTableData: [30, 40],
        bluePaletteColorLookupTableData: [50, 60],
        redPaletteColorLookupTableDescriptor: [2, 0, 8],
      };
      const colorBuffer = new Uint8ClampedArray(8);
      convertColorSpace(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        10, 30, 50, 255, 20, 40, 60, 255,
      ]);
    });

    it('routes YBR_FULL_422 to convertYBRFull422ByPixel', () => {
      const imageFrame = {
        photometricInterpretation: 'YBR_FULL_422',
        pixelData: [100, 150, 150, 200], // one group -> 2 pixels
      };
      const colorBuffer = new Uint8ClampedArray(8);
      convertColorSpace(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        201, 41, 139, 255, 251, 91, 189, 255,
      ]);
    });

    it('routes YBR_FULL + planarConfiguration=0 to convertYBRFullByPixel', () => {
      const imageFrame = {
        photometricInterpretation: 'YBR_FULL',
        planarConfiguration: 0,
        pixelData: [128, 128, 128, 100, 150, 200],
      };
      const colorBuffer = new Uint8ClampedArray(8);
      convertColorSpace(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        128, 128, 128, 255, 201, 41, 139, 255,
      ]);
    });

    it('routes YBR_FULL + planarConfiguration=1 to convertYBRFullByPlane', () => {
      const imageFrame = {
        photometricInterpretation: 'YBR_FULL',
        planarConfiguration: 1,
        pixelData: [128, 100, 128, 150, 128, 200],
      };
      const colorBuffer = new Uint8ClampedArray(8);
      convertColorSpace(imageFrame, colorBuffer, true);
      expect(Array.from(colorBuffer)).toEqual([
        128, 128, 128, 255, 201, 41, 139, 255,
      ]);
    });

    it('throws for an unsupported photometric interpretation', () => {
      const imageFrame = {
        photometricInterpretation: 'MONOCHROME2',
        pixelData: [1, 2, 3],
      };
      expect(() =>
        convertColorSpace(imageFrame, new Uint8ClampedArray(4), true)
      ).toThrow(
        'No color space conversion for photometric interpretation MONOCHROME2'
      );
    });
  });

  // ---------------------------------------------------------------------
  // removeAFromRGBA
  // ---------------------------------------------------------------------
  describe('removeAFromRGBA', () => {
    it('strips the alpha channel from RGBA data', () => {
      const pixelData = [1, 2, 3, 255, 4, 5, 6, 255];
      const target = new Uint8ClampedArray(6);
      const result = removeAFromRGBA(pixelData as any, target);
      expect(Array.from(target)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(result).toBe(target); // returns the same buffer it was given
    });

    it('handles a length that is not a multiple of 4 by reading past the end (numPixels is fractional)', () => {
      // numPixels = 6/4 = 1.5, and the loop condition `i < numPixels` lets
      // i=0 AND i=1 both run (1 < 1.5), so it reads 2 "pixels" worth (8
      // source slots) out of a 6-element source array. The out-of-range
      // reads come back `undefined`, which a Uint8ClampedArray coerces to 0.
      // This is an edge case worth flagging: the function does not validate
      // that pixelData.length is a multiple of 4.
      const pixelData = [1, 2, 3, 255, 4, 5];
      const target = new Uint8ClampedArray(6);
      removeAFromRGBA(pixelData as any, target);
      expect(Array.from(target)).toEqual([1, 2, 3, 4, 5, 0]);
    });
  });

  // ---------------------------------------------------------------------
  // isColorConversionRequired
  // ---------------------------------------------------------------------
  describe('isColorConversionRequired', () => {
    it('returns false when imageFrame is undefined', () => {
      expect(isColorConversionRequired(undefined)).toBe(false);
    });

    it('returns false when pixelDataLength indicates RGBA (e.g. jpeg/jpeg2000 already decoded to RGBA)', () => {
      const imageFrame = {
        rows: 2,
        columns: 2,
        photometricInterpretation: 'YBR_FULL',
        pixelDataLength: 4 * 2 * 2, // 4 * columns * rows
        planarConfiguration: 0,
      };
      expect(isColorConversionRequired(imageFrame)).toBe(false);
    });

    it('returns true for PALETTE COLOR', () => {
      const imageFrame = {
        rows: 2,
        columns: 2,
        photometricInterpretation: 'PALETTE COLOR',
        pixelDataLength: 4, // columns*rows, not the RGBA guard length
        planarConfiguration: 0,
      };
      expect(isColorConversionRequired(imageFrame)).toBe(true);
    });

    it('applies the 420 length heuristic', () => {
      // columns=4, rows=2:
      // expected length = (3*ceil(4/2) + floor(4/2)) * rows
      //                 = (3*2 + 2) * 2 = 8 * 2 = 16
      const base = {
        rows: 2,
        columns: 4,
        photometricInterpretation: 'YBR_PARTIAL_420',
        planarConfiguration: 0,
      };
      expect(isColorConversionRequired({ ...base, pixelDataLength: 16 })).toBe(
        true
      );
      expect(isColorConversionRequired({ ...base, pixelDataLength: 20 })).toBe(
        false
      );
    });

    it('applies the 422 length heuristic', () => {
      // columns=4, rows=3:
      // expected length = (3*ceil(4/2) + floor(4/2)) * ceil(3/2) + floor(3/2)*4
      //                 = (3*2 + 2) * 2 + 1*4 = 8*2 + 4 = 20
      const base = {
        rows: 3,
        columns: 4,
        photometricInterpretation: 'YBR_PARTIAL_422',
        planarConfiguration: 0,
      };
      expect(isColorConversionRequired({ ...base, pixelDataLength: 20 })).toBe(
        true
      );
      expect(isColorConversionRequired({ ...base, pixelDataLength: 24 })).toBe(
        false
      );
    });

    it('falls through to the default branch based on PMI and planarConfiguration', () => {
      // columns=2, rows=2 -> RGBA guard length would be 16; use 12 so the
      // guard does not short-circuit these cases.
      const rgbPlanar0 = {
        rows: 2,
        columns: 2,
        photometricInterpretation: 'RGB',
        pixelDataLength: 12,
        planarConfiguration: 0,
      };
      expect(isColorConversionRequired(rgbPlanar0)).toBe(false);

      const rgbPlanar1 = {
        rows: 2,
        columns: 2,
        photometricInterpretation: 'RGB',
        pixelDataLength: 12,
        planarConfiguration: 1,
      };
      expect(isColorConversionRequired(rgbPlanar1)).toBe(true);

      const nonRgbPlanar0 = {
        rows: 2,
        columns: 2,
        photometricInterpretation: 'MONOCHROME2',
        pixelDataLength: 12,
        planarConfiguration: 0,
      };
      expect(isColorConversionRequired(nonRgbPlanar0)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // isJPEGBaseline8BitColor
  // ---------------------------------------------------------------------
  describe('isJPEGBaseline8BitColor', () => {
    const jpegBaselineTS = '1.2.840.10008.1.2.4.50';

    it('returns true for 8-bit, JPEG baseline, samplesPerPixel=3', () => {
      const imageFrame = { bitsAllocated: 8, samplesPerPixel: 3 } as any;
      expect(isJPEGBaseline8BitColor(imageFrame, jpegBaselineTS)).toBe(true);
    });

    it('returns true for 8-bit, JPEG baseline, samplesPerPixel=4', () => {
      const imageFrame = { bitsAllocated: 8, samplesPerPixel: 4 } as any;
      expect(isJPEGBaseline8BitColor(imageFrame, jpegBaselineTS)).toBe(true);
    });

    it('returns undefined (falsy) for samplesPerPixel=1', () => {
      const imageFrame = { bitsAllocated: 8, samplesPerPixel: 1 } as any;
      expect(
        isJPEGBaseline8BitColor(imageFrame, jpegBaselineTS)
      ).toBeUndefined();
    });

    it('returns undefined (falsy) for non-8-bit', () => {
      const imageFrame = { bitsAllocated: 16, samplesPerPixel: 3 } as any;
      expect(
        isJPEGBaseline8BitColor(imageFrame, jpegBaselineTS)
      ).toBeUndefined();
    });

    it('returns undefined (falsy) for a different transfer syntax', () => {
      const imageFrame = { bitsAllocated: 8, samplesPerPixel: 3 } as any;
      expect(
        isJPEGBaseline8BitColor(imageFrame, '1.2.840.10008.1.2.1')
      ).toBeUndefined();
    });

    it('falls back to imageFrame.transferSyntax when the parameter is falsy', () => {
      const imageFrame = {
        bitsAllocated: 8,
        samplesPerPixel: 3,
        transferSyntax: jpegBaselineTS,
      } as any;
      expect(isJPEGBaseline8BitColor(imageFrame, undefined)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // shared/getMinMax and imageLoader/getMinMax (near-duplicate implementations)
  // ---------------------------------------------------------------------
  describe.each([
    ['shared/getMinMax', getMinMaxShared],
    ['imageLoader/getMinMax', getMinMaxImageLoader],
  ])('%s', (_name, getMinMax) => {
    it('finds min/max in an unsigned integer array', () => {
      expect(getMinMax([7, 3, 9, 6, 8, 1, 4, 5, 2] as any)).toEqual({
        min: 1,
        max: 9,
      });
    });

    it('finds min/max in a signed array (Int16Array)', () => {
      const data = new Int16Array([-500, 200, -32768, 32767, 0]);
      expect(getMinMax(data)).toEqual({ min: -32768, max: 32767 });
    });

    it('finds min/max in a float array', () => {
      const data = new Float32Array([1.5, -2.75, 3.25, 0]);
      expect(getMinMax(data)).toEqual({ min: -2.75, max: 3.25 });
    });

    it('handles a single-element array', () => {
      expect(getMinMax([42] as any)).toEqual({ min: 42, max: 42 });
    });
  });

  // ---------------------------------------------------------------------
  // shared/getPixelDataTypeFromMinMax + validatePixelDataType
  // ---------------------------------------------------------------------
  describe('getPixelDataTypeFromMinMax', () => {
    it.each([
      [0, 255, Uint8Array, 'Uint8Array upper boundary'],
      [0, 256, Uint16Array, 'just above Uint8 boundary -> Uint16Array'],
      [0, 65535, Uint16Array, 'Uint16Array upper boundary'],
      [0, 65536, Uint32Array, 'just above Uint16 boundary -> Uint32Array'],
      [0, 4294967295, Uint32Array, 'Uint32Array upper boundary'],
      [
        0,
        4294967296,
        Float32Array,
        'above Uint32 boundary -> Float32Array fallback',
      ],
      [-128, 127, Int8Array, 'Int8Array full range'],
      [-129, 127, Int16Array, 'just below Int8 min -> Int16Array'],
      [-32768, 32767, Int16Array, 'Int16Array full range'],
      [-32769, 32767, Float32Array, 'below Int16 min -> Float32Array'],
      [-32768, 32768, Float32Array, 'above Int16 max -> Float32Array'],
      [1.5, 10, Float32Array, 'non-integer min -> Float32Array'],
      [-5, 10.2, Float32Array, 'non-integer max -> Float32Array'],
      [
        -40000,
        -40000,
        Float32Array,
        'negative + large magnitude -> Float32Array',
      ],
      [-128, 128, Int16Array, 'max just above Int8 -> Int16Array'],
    ])('min=%p max=%p -> %p (%s)', (min, max, expected) => {
      expect(getPixelDataTypeFromMinMax(min, max)).toBe(expected);
    });

    it('validatePixelDataType returns true for a matching type', () => {
      expect(validatePixelDataType(0, 255, Uint8Array as any)).toBe(true);
    });

    it('validatePixelDataType returns false for a non-matching type', () => {
      expect(validatePixelDataType(0, 255, Uint16Array as any)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // imageLoader/setPixelDataType
  // ---------------------------------------------------------------------
  describe('setPixelDataType', () => {
    it('mutates imageFrame.pixelData into a Uint8Array for an 8-bit unsigned range', () => {
      const imageFrame: any = {
        smallestPixelValue: 0,
        largestPixelValue: 255,
        pixelData: [1, 2, 3, 4],
      };
      setPixelDataType(imageFrame);
      expect(imageFrame.pixelData).toBeInstanceOf(Uint8Array);
      expect(Array.from(imageFrame.pixelData)).toEqual([1, 2, 3, 4]);
    });

    it('mutates imageFrame.pixelData into an Int16Array for a signed range', () => {
      const imageFrame: any = {
        smallestPixelValue: -100,
        largestPixelValue: 1000,
        pixelData: [-100, 0, 1000],
      };
      setPixelDataType(imageFrame);
      expect(imageFrame.pixelData).toBeInstanceOf(Int16Array);
      expect(Array.from(imageFrame.pixelData)).toEqual([-100, 0, 1000]);
    });

    it('falls back to Float32Array when the range exceeds Int16', () => {
      const imageFrame: any = {
        smallestPixelValue: -50000,
        largestPixelValue: 50000,
        pixelData: [-50000, 0, 50000],
      };
      setPixelDataType(imageFrame);
      expect(imageFrame.pixelData).toBeInstanceOf(Float32Array);
      expect(Array.from(imageFrame.pixelData)).toEqual([-50000, 0, 50000]);
    });

    // NOTE: setPixelDataType has an `else { throw ... }` branch for when
    // getPixelDataTypeFromMinMax returns a falsy TypedArray. That branch is
    // currently unreachable: getPixelDataTypeFromMinMax always returns
    // `pixelDataType || Float32Array`, i.e. it never returns a falsy value.
    // See "suspected bugs" in the final report -- not tested here since
    // reaching it would require modifying src.
  });

  // ---------------------------------------------------------------------
  // shared/isColorImage
  // ---------------------------------------------------------------------
  describe('isColorImage', () => {
    it.each([
      'RGB',
      'PALETTE COLOR',
      'YBR_FULL',
      'YBR_FULL_422',
      'YBR_PARTIAL_422',
      'YBR_PARTIAL_420',
      'YBR_RCT',
      'YBR_ICT',
    ])('returns true for %s', (pmi) => {
      expect(isColorImage(pmi)).toBe(true);
    });

    it.each(['MONOCHROME1', 'MONOCHROME2', '', 'UNKNOWN'])(
      'returns false for %s',
      (pmi) => {
        expect(isColorImage(pmi)).toBe(false);
      }
    );
  });

  // ---------------------------------------------------------------------
  // shared/scaling/scaleArray
  // ---------------------------------------------------------------------
  describe('scaleArray', () => {
    it('applies rescale slope/intercept for the default (non-PT, non-RTDOSE) path', () => {
      const array = [1, 2, 3];
      const result = scaleArray(array as any, {
        rescaleSlope: 2,
        rescaleIntercept: 10,
      });
      expect(result).toBe(true);
      // 1*2+10=12, 2*2+10=14, 3*2+10=16
      expect(array).toEqual([12, 14, 16]);
    });

    it('applies the PT/suvbw path: suvbw * (value*slope + intercept)', () => {
      const array = [1, 2];
      scaleArray(array as any, {
        modality: 'PT',
        suvbw: 5,
        rescaleSlope: 1,
        rescaleIntercept: 0,
      });
      // 5*(1*1+0)=5, 5*(2*1+0)=10
      expect(array).toEqual([5, 10]);
    });

    it('applies the RTDOSE/doseGridScaling path: value * doseGridScaling', () => {
      const array = [10, 20];
      scaleArray(array as any, {
        modality: 'RTDOSE',
        doseGridScaling: 0.5,
      });
      expect(array).toEqual([5, 10]);
    });

    it('ignores the PT branch and falls back to slope/intercept when suvbw is not a usable number', () => {
      const array = [1, 2];
      scaleArray(array as any, {
        modality: 'PT',
        suvbw: undefined,
        rescaleSlope: 3,
        rescaleIntercept: 1,
      });
      // 1*3+1=4, 2*3+1=7
      expect(array).toEqual([4, 7]);
    });

    it('mutates the array in place (same reference) rather than returning a copy', () => {
      const array = [1, 2, 3];
      scaleArray(array as any, { rescaleSlope: 1, rescaleIntercept: 0 });
      expect(array).toEqual([1, 2, 3]);
    });

    it('truncates (does not round) when writing fractional results into an integer typed array', () => {
      // 10*1.5+0.5 = 15.5, but assigning a float into an Int16Array
      // truncates toward zero (JS typed array coercion), giving 15.
      const array = new Int16Array([10]);
      scaleArray(array as any, { rescaleSlope: 1.5, rescaleIntercept: 0.5 });
      expect(Array.from(array)).toEqual([15]);
    });
  });

  // ---------------------------------------------------------------------
  // shared/scaling/bilinear
  // ---------------------------------------------------------------------
  describe('bilinear', () => {
    it('upscales a 2x2 grayscale image to 3x3 with exact interpolated midpoints', () => {
      // src (row-major, 2x2): row0=[0,10], row1=[20,30]
      // Corner points map exactly: (0,0)->0, (2,0)->10, (0,2)->20, (2,2)->30
      // Edge midpoints average their 2 neighbors, center averages all 4:
      //   (1,0) = avg(0,10)=5      (0,1) = avg(0,20)=10   (2,1) = avg(10,30)=20
      //   (1,1) = avg(0,10,20,30)=15
      //   (1,2) = avg(20,30)=25
      const src = { rows: 2, columns: 2, data: [0, 10, 20, 30] };
      const dest = { rows: 3, columns: 3, data: new Array(9).fill(-1) };
      const result = bilinear(src, dest);
      expect(result).toEqual([0, 5, 10, 10, 15, 20, 20, 25, 30]);
      expect(result).toBe(dest.data); // writes into dest.data in place
    });

    it('is a no-op copy when src and dest have the same dimensions', () => {
      const src = { rows: 2, columns: 2, data: [1, 2, 3, 4] };
      const dest = { rows: 2, columns: 2, data: new Array(4).fill(-1) };
      bilinear(src, dest);
      expect(dest.data).toEqual([1, 2, 3, 4]);
    });

    it('BUG: produces NaN when a destination dimension is 1 (division by zero in the offset formula)', () => {
      // xSrc = (x * (srcColumns - 1)) / (columns - 1); when columns===1 this
      // is 0/0 = NaN for every x (and symmetrically for rows). This looks
      // like an unhandled edge case rather than intentional behavior -- see
      // "suspected bugs" in the final report.
      const src = { rows: 2, columns: 2, data: [0, 10, 20, 30] };
      const dest = { rows: 1, columns: 1, data: [-1] };
      bilinear(src, dest);
      expect(Number.isNaN(dest.data[0])).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // shared/scaling/replicate
  // ---------------------------------------------------------------------
  describe('replicate', () => {
    it('nearest-neighbor upscales a single-sample-per-pixel (grayscale) image', () => {
      // src 2x2: row0=[0,10], row1=[20,30]; dest 4x4.
      // xSrc for columns=4 from srcColumns=2: x/3 -> floor maps x=0,1,2 to
      // src column 0, and x=3 to src column 1. Same mapping for y/rows.
      const src = { rows: 2, columns: 2, pixelData: [0, 10, 20, 30] };
      const dest = { rows: 4, columns: 4, pixelData: new Array(16).fill(-1) };
      const result = replicate(src, dest);
      expect(result).toEqual([
        0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10, 20, 20, 20, 30,
      ]);
      expect(result).toBe(dest.pixelData);
    });

    it('BUG: corrupts output when samplesPerPixel > 1 (RGB) because x/y offsets are not scaled by samplesPerPixel', () => {
      // src is 2x2 RGB (samplesPerPixel=3): pixel(0,0)=[1,2,3],
      // pixel(0,1)=[4,5,6], pixel(1,0)=[7,8,9], pixel(1,1)=[10,11,12].
      // Upscaling to 2x4 SHOULD replicate whole (r,g,b) triples, but the
      // source computes `yOff = y * columns` (missing `* samplesPerPixel`)
      // and indexes `pixelData[yOff + x + sample]` (missing `x *
      // samplesPerPixel`), so writes for different x/sample combinations
      // collide and overwrite each other. This regression-pins the CURRENT
      // (incorrect) behavior; see "suspected bugs" in the final report.
      const src = {
        rows: 2,
        columns: 2,
        samplesPerPixel: 3,
        pixelData: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      };
      const dest = {
        rows: 2,
        columns: 4,
        pixelData: new Array(24).fill(-1),
      };
      replicate(src, dest);
      // Only indices 0-9 ever get touched (should have been the full 24
      // for a correctly-scaled 2x4x3 buffer), and several of those are
      // overwritten multiple times by unrelated source samples.
      expect(dest.pixelData.slice(0, 10)).toEqual([
        1, 1, 1, 4, 7, 7, 7, 10, 11, 12,
      ]);
      expect(dest.pixelData.slice(10)).toEqual(new Array(14).fill(-1));
    });
  });
});
