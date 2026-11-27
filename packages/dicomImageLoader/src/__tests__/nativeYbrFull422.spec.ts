import fs from 'fs';
import path from 'path';
import dcmjs from 'dcmjs';
import { metaData } from '@cornerstonejs/core';
import { registerDefaultProviders, utilities } from '@cornerstonejs/metadata';

import { loadImageFromNaturalizedMetadata } from '../imageLoader/wadouri/loadImage';
import isColorConversionRequired from '../imageLoader/isColorConversionRequired';

// The worker imports every decoder, and the WASM ones don't load under jest.
// Native pixel data goes to the little endian decoder, which is real here.
jest.mock('../shared/decoders/decodeJPEGBaseline8Bit', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGLossless', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGLS', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEG2000', () => jest.fn());
jest.mock('../shared/decoders/decodeHTJ2K', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGXL', () => jest.fn());

// Run the decode task of the worker in this thread.
jest.mock('../imageLoader/decodeImageFrame', () => ({
  __esModule: true,
  default: (imageFrame, transferSyntax, pixelData, _canvas, options, config) =>
    jest
      .requireActual('../decodeImageFrameWorker')
      .decodeImageFrame(
        { ...imageFrame },
        transferSyntax,
        pixelData,
        config,
        options
      ),
}));

const EXPLICIT_LE = '1.2.840.10008.1.2.1';
const IMPLICIT_LE = '1.2.840.10008.1.2';

/** The RGB triplet of one YBR_FULL sample (PS3.3 C.7.6.3.1.2). */
function toRGB(y: number, cb: number, cr: number): number[] {
  return Array.from(
    new Uint8ClampedArray([
      y + 1.402 * (cr - 128),
      y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128),
      y + 1.772 * (cb - 128),
    ])
  );
}

/** The RGB pixels of a frame stored as Y1 Y2 Cb Cr. */
function expectedRGB(frame: ArrayLike<number>): number[] {
  const rgb: number[] = [];
  for (let i = 0; i < frame.length; i += 4) {
    rgb.push(...toRGB(frame[i], frame[i + 2], frame[i + 3]));
    rgb.push(...toRGB(frame[i + 1], frame[i + 2], frame[i + 3]));
  }
  return rgb;
}

/** A frame of 2 bytes per pixel with different luma and chroma in each pair. */
function ybr422Frame(rows: number, columns: number, seed = 0): number[] {
  const frame: number[] = [];
  for (let pair = 0; pair < (rows * columns) / 2; pair++) {
    frame.push(
      (20 + seed + pair * 13) % 256,
      (90 + seed + pair * 7) % 256,
      (100 + seed + pair * 3) % 256,
      (160 + seed + pair * 5) % 256
    );
  }
  return frame;
}

function writePart10({
  rows,
  columns,
  frames,
  transferSyntax = EXPLICIT_LE,
}: {
  rows: number;
  columns: number;
  frames: number[][];
  transferSyntax?: string;
}): ArrayBuffer {
  const { DicomDict } = dcmjs.data;
  const dict = new DicomDict({
    '00020002': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.3.1'] },
    '00020003': { vr: 'UI', Value: ['1.2.3.4'] },
    '00020010': { vr: 'UI', Value: [transferSyntax] },
  });
  dict.dict = {
    '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.3.1'] },
    '00080018': { vr: 'UI', Value: ['1.2.3.4'] },
    '00080060': { vr: 'CS', Value: ['US'] },
    '00280002': { vr: 'US', Value: [3] },
    '00280004': { vr: 'CS', Value: ['YBR_FULL_422'] },
    '00280006': { vr: 'US', Value: [0] },
    '00280008': { vr: 'IS', Value: [frames.length] },
    '00280010': { vr: 'US', Value: [rows] },
    '00280011': { vr: 'US', Value: [columns] },
    '00280100': { vr: 'US', Value: [8] },
    '00280101': { vr: 'US', Value: [8] },
    '00280102': { vr: 'US', Value: [7] },
    '00280103': { vr: 'US', Value: [0] },
    '7FE00010': {
      vr: transferSyntax === IMPLICIT_LE ? 'OW' : 'OB',
      Value: [new Uint8Array(frames.flat()).buffer],
    },
  };
  return dict.write();
}

describe('native YBR_FULL_422 pixel data', () => {
  let imageCount = 0;

  async function load(
    part10: ArrayBuffer | Uint8Array,
    { frame = undefined, useRGBA = false } = {}
  ) {
    const baseImageId = `wadouri:https://example.com/ybr422/${++imageCount}`;
    await utilities.addDicomPart10Instance(baseImageId, part10);
    const imageId = frame ? `${baseImageId}?frame=${frame}` : baseImageId;
    return loadImageFromNaturalizedMetadata(imageId, { useRGBA }).promise;
  }

  beforeEach(() => {
    metaData.removeAllProviders();
    registerDefaultProviders();
    // jsdom has no canvas; createImage only needs an ImageData from it.
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width, height) => ({
        data: new Uint8ClampedArray(4 * width * height),
      }),
      getExtension: () => null,
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    metaData.removeAllProviders();
  });

  describe('on the default WADO-URI path', () => {
    // [rows, columns]: 2 * rows * columns is a multiple of 3 for the second and
    // third, and the row count is odd for the third and fourth.
    it.each([
      [2, 4],
      [4, 6],
      [3, 4],
      [5, 2],
    ])('converts a %i x %i frame to RGB', async (rows, columns) => {
      const frame = ybr422Frame(rows, columns);
      const image = await load(writePart10({ rows, columns, frames: [frame] }));

      expect(image.numberOfComponents).toBe(3);
      expect(Array.from(image.getPixelData())).toEqual(expectedRGB(frame));
      expect(image.sizeInBytes).toBe(3 * rows * columns);
    });

    it('converts an implicit VR frame to RGB', async () => {
      const frame = ybr422Frame(4, 6);
      const image = await load(
        writePart10({
          rows: 4,
          columns: 6,
          frames: [frame],
          transferSyntax: IMPLICIT_LE,
        })
      );

      expect(Array.from(image.getPixelData())).toEqual(expectedRGB(frame));
    });

    it.each([1, 2, 3])('converts frame %i of a multiframe', async (frame) => {
      const frames = [0, 40, 80].map((seed) => ybr422Frame(2, 4, seed));
      const image = await load(writePart10({ rows: 2, columns: 4, frames }), {
        frame,
      });

      expect(Array.from(image.getPixelData())).toEqual(
        expectedRGB(frames[frame - 1])
      );
    });

    it('converts to RGBA when useRGBA is set', async () => {
      const frame = ybr422Frame(2, 4);
      const image = await load(
        writePart10({ rows: 2, columns: 4, frames: [frame] }),
        { useRGBA: true }
      );

      const rgb = expectedRGB(frame);
      const rgba: number[] = [];
      for (let i = 0; i < rgb.length; i += 3) {
        rgba.push(rgb[i], rgb[i + 1], rgb[i + 2], 255);
      }
      expect(Array.from(image.getPixelData())).toEqual(rgba);
    });

    it('converts the US-YBR_FULL_422-EVRLE.dcm test image', async () => {
      const file = fs.readFileSync(
        path.resolve(__dirname, '../../testImages/US-YBR_FULL_422-EVRLE.dcm')
      );
      const image = await load(new Uint8Array(file));
      const numberOfPixels = image.rows * image.columns;
      const pixelData = image.getPixelData();

      expect([image.rows, image.columns]).toEqual([555, 800]);
      expect(pixelData.length).toBe(3 * numberOfPixels);
      // Pixel Data is the last element of this file.
      const stored = file.subarray(file.length - 2 * numberOfPixels);
      expect(
        Buffer.from(pixelData).equals(Buffer.from(expectedRGB(stored)))
      ).toBe(true);
    });
  });

  describe('isColorConversionRequired', () => {
    const imageFrame = (pixelDataLength, overrides = {}) => ({
      rows: 600,
      columns: 800,
      photometricInterpretation: 'YBR_FULL_422',
      planarConfiguration: 0,
      pixelDataLength,
      ...overrides,
    });

    it('is true for 2 bytes per pixel', () => {
      expect(isColorConversionRequired(imageFrame(2 * 600 * 800))).toBe(true);
    });

    it('stays true for a single row', () => {
      expect(isColorConversionRequired(imageFrame(2 * 800, { rows: 1 }))).toBe(
        true
      );
    });

    it('is false for a frame that is already RGB', () => {
      expect(isColorConversionRequired(imageFrame(3 * 600 * 800))).toBe(false);
    });

    it('is false for a frame that is already RGBA', () => {
      expect(isColorConversionRequired(imageFrame(4 * 600 * 800))).toBe(false);
    });

    it('is false without rows and columns', () => {
      expect(
        isColorConversionRequired(
          imageFrame(16, { rows: undefined, columns: undefined })
        )
      ).toBe(false);
    });

    it('is false for an empty frame', () => {
      expect(
        isColorConversionRequired(imageFrame(0, { rows: 0, columns: 0 }))
      ).toBe(false);
    });

    it('leaves YBR_PARTIAL_422, which has no converter, as it was', () => {
      expect(
        isColorConversionRequired(
          imageFrame(2 * 600 * 800, {
            photometricInterpretation: 'YBR_PARTIAL_422',
          })
        )
      ).toBe(false);
    });
  });
});
