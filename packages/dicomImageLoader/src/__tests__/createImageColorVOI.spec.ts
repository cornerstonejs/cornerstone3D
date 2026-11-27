/* eslint-disable @typescript-eslint/no-explicit-any */
import { metaData } from '@cornerstonejs/core';

import createImage from '../imageLoader/createImage';
import getImageFrame from '../imageLoader/getImageFrame';
import decodeImageFrame from '../imageLoader/decodeImageFrame';
import type { DICOMLoaderIImage } from '../types';

jest.mock('../imageLoader/getImageFrame');
jest.mock('../imageLoader/decodeImageFrame');

const COLOR_IMAGE_ID = 'test:color';
const GRAYSCALE_IMAGE_ID = 'test:grayscale';

/**
 * A VOI LUT Sequence, a VOI LUT Function, a window and a modality LUT all at
 * once. Per DICOM PS3.3 C.11.2.1.2.2 none of these apply to a color image, so
 * the same metadata has to produce very different images depending only on the
 * photometric interpretation.
 */
const VOI_LUT_SEQUENCE = [
  { firstValueMapped: 0, numBitsPerEntry: 16, lut: [0, 128, 255] },
];
const MODALITY_LUT_SEQUENCE = [
  { firstValueMapped: 0, numBitsPerEntry: 16, lut: [0, 512, 1024] },
];

const METADATA = {
  voiLutModule: {
    windowCenter: [40],
    windowWidth: [400],
    voiLUTFunction: 'SIGMOID',
    voiLUTSequence: VOI_LUT_SEQUENCE,
  },
  modalityLutModule: {
    rescaleIntercept: -1024,
    rescaleSlope: 2,
    modalityLUTSequence: MODALITY_LUT_SEQUENCE,
  },
  generalSeriesModule: { modality: 'CT' },
  // CT Image Storage - makes isModalityLUTForDisplay() true
  sopCommonModule: { sopClassUID: '1.2.840.10008.5.1.4.1.1.2' },
  imagePlaneModule: {},
  calibrationModule: {},
  scalingModule: {},
};

function metadataProvider(type: string) {
  return METADATA[type];
}

function makeImageFrame(imageId: string) {
  const isColor = imageId === COLOR_IMAGE_ID;
  const rows = 2;
  const columns = 2;
  const samplesPerPixel = isColor ? 3 : 1;
  const pixelDataLength = rows * columns * samplesPerPixel;

  return {
    imageId,
    rows,
    columns,
    samplesPerPixel,
    photometricInterpretation: isColor ? 'RGB' : 'MONOCHROME2',
    planarConfiguration: 0,
    bitsAllocated: 8,
    bitsStored: 8,
    highBit: 7,
    pixelRepresentation: 0,
    smallestPixelValue: 0,
    largestPixelValue: 255,
    pixelDataLength,
    pixelData: new Uint8Array(pixelDataLength).fill(120),
  };
}

/** The options object handed to `decodeImageFrame` for the last decode. */
let lastDecodeOptions;

describe('createImage - windowing/VOI on color images (PS3.3 C.11.2.1.2.2)', () => {
  beforeEach(() => {
    lastDecodeOptions = undefined;

    (getImageFrame as jest.Mock).mockImplementation(makeImageFrame);
    (decodeImageFrame as jest.Mock).mockImplementation(
      (imageFrame, transferSyntax, pixelData, canvas, options) => {
        lastDecodeOptions = options;
        return Promise.resolve(imageFrame);
      }
    );

    metaData.addProvider(metadataProvider);
  });

  afterEach(() => {
    metaData.removeProvider(metadataProvider);
    jest.resetAllMocks();
  });

  // The options object is passed through verbatim - the third test below
  // depends on createImage seeing the very same object twice.
  function load(imageId: string, options: any = { useRGBA: false }) {
    return createImage(
      imageId,
      new Uint8Array(12).fill(120),
      '1.2.840.10008.1.2.1',
      options
    ) as Promise<DICOMLoaderIImage>;
  }

  it('ignores the modality LUT, VOI and windowing tags for a color image', async () => {
    const image = await load(COLOR_IMAGE_ID);

    expect(image.color).toBe(true);
    // Identity modality transform instead of the -1024/2 rescale
    expect(image.intercept).toBe(0);
    expect(image.slope).toBe(1);
    expect(image.modalityLUT).toBeUndefined();
    // No VOI at all - neither the sequence, the function, nor the window
    expect(image.voiLUT).toBeUndefined();
    expect(image.voiLUTFunction).toBeUndefined();
    // The DICOM identity window for 8 bit color samples
    expect(image.windowWidth).toBe(256);
    expect(image.windowCenter).toBe(128);
    // Pre-scaling would apply the modality LUT to the RGB samples
    expect(lastDecodeOptions.preScale.enabled).toBe(false);
  });

  it('still honours all of them for a grayscale image', async () => {
    const image = await load(GRAYSCALE_IMAGE_ID);

    expect(image.color).toBe(false);
    expect(image.intercept).toBe(-1024);
    expect(image.slope).toBe(2);
    expect(image.modalityLUT).toEqual(MODALITY_LUT_SEQUENCE[0]);
    expect(image.voiLUT).toEqual(VOI_LUT_SEQUENCE[0]);
    expect(image.voiLUTFunction).toBe('SIGMOID');
    expect(image.windowWidth).toBe(400);
    expect(image.windowCenter).toBe(40);
    expect(lastDecodeOptions.preScale.enabled).toBe(true);
  });

  it('does not let a color image disable pre-scaling for a later grayscale one', async () => {
    // Callers routinely reuse one options object across an entire stack, so
    // createImage must not write its per image decisions back into it.
    const sharedOptions = { useRGBA: false };

    await load(COLOR_IMAGE_ID, sharedOptions);
    expect(lastDecodeOptions.preScale.enabled).toBe(false);

    await load(GRAYSCALE_IMAGE_ID, sharedOptions);
    expect(lastDecodeOptions.preScale.enabled).toBe(true);

    expect(sharedOptions).toEqual({ useRGBA: false });
  });
});
