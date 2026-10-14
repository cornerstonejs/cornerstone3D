import fs from 'fs';
import path from 'path';
import * as dicomParser from 'dicom-parser';

import { decodeImageFrame } from '../decodeImageFrameWorker';

// The worker imports every decoder, and the WASM ones don't load under jest.
// These transfer syntaxes go to the JavaScript JPEG decoder, which is real here.
jest.mock('../shared/decoders/decodeJPEGBaseline8Bit', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGLossless', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGLS', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEG2000', () => jest.fn());
jest.mock('../shared/decoders/decodeHTJ2K', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGXL', () => jest.fn());

const testImages = path.resolve(__dirname, '../../testImages');

/** The data set of one of the test images. */
function readDataSet(name: string) {
  return dicomParser.parseDicom(
    new Uint8Array(fs.readFileSync(path.join(testImages, name)))
  );
}

/** Decodes the first frame of a test image with its own transfer syntax. */
async function decode(name: string): Promise<ArrayLike<number>> {
  const dataSet = readDataSet(name);
  const imageFrame = {
    rows: dataSet.uint16('x00280010'),
    columns: dataSet.uint16('x00280011'),
    samplesPerPixel: dataSet.uint16('x00280002'),
    bitsAllocated: dataSet.uint16('x00280100'),
    bitsStored: dataSet.uint16('x00280101'),
    pixelRepresentation: dataSet.uint16('x00280103'),
    photometricInterpretation: dataSet.string('x00280004'),
  };
  const pixelData = dicomParser.readEncapsulatedPixelDataFromFragments(
    dataSet,
    dataSet.elements.x7fe00010,
    0
  );
  const decoded = await decodeImageFrame(
    imageFrame,
    dataSet.string('x00020010'),
    pixelData,
    {},
    { preScale: { enabled: false } }
  );
  return decoded.pixelData;
}

/** The mean absolute difference between two frames of stored values. */
function meanDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    total += Math.abs(a[i] - b[i]);
  }
  return total / a.length;
}

/**
 * The CTImage.dcm test images in the retired progressive JPEG transfer
 * syntaxes were encoded from the same 12 bit image, with the same rescale, as
 * the one in JPEG extended process 2 & 4 (1.2.840.10008.1.2.4.51), so that
 * decoding is the reference.
 */
describe('decodeImageFrame of the retired progressive JPEG transfer syntaxes', () => {
  let reference: ArrayLike<number>;

  beforeAll(async () => {
    reference = await decode(
      'CTImage.dcm_JPEGProcess2_4TransferSyntax_1.2.840.10008.1.2.4.51.dcm'
    );
  });

  it('decodes spectral selection, processes 6 & 8 (1.2.840.10008.1.2.4.53), to the same pixels as process 2 & 4', async () => {
    const pixels = await decode(
      'CTImage.dcm_JPEGProcess6_8TransferSyntax_1.2.840.10008.1.2.4.53.dcm'
    );

    expect(Array.from(pixels)).toEqual(Array.from(reference));
  });

  it('decodes full progression, processes 10 & 12 (1.2.840.10008.1.2.4.55), to the image process 2 & 4 holds', async () => {
    const pixels = await decode(
      'CTImage.dcm_JPEGProcess10_12TransferSyntax_1.2.840.10008.1.2.4.55.dcm'
    );

    expect(pixels.length).toBe(reference.length);
    // Successive approximation quantizes a little differently, so close rather
    // than equal. A frame that decoded wrongly differs by thousands.
    expect(meanDifference(pixels, reference)).toBeLessThan(5);
  });
});
