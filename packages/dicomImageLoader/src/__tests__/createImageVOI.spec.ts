// The decode runs in a web worker; return the frame directly instead.
jest.mock('../imageLoader/decodeImageFrame', () => ({
  __esModule: true,
  default: jest.fn(async (imageFrame) => ({
    ...imageFrame,
    pixelData: new Uint16Array(imageFrame.rows * imageFrame.columns),
    smallestPixelValue: 0,
    largestPixelValue: 0,
  })),
}));

import { metaData } from '@cornerstonejs/core';
import createImage from '../imageLoader/createImage';

const imageId = 'wadors:voi-test';
let voiLutModule;

function provider(type: string, id: string) {
  if (id !== imageId) {
    return;
  }
  switch (type) {
    case 'imagePixelModule':
      return {
        samplesPerPixel: 1,
        photometricInterpretation: 'MONOCHROME2',
        rows: 2,
        columns: 2,
        bitsAllocated: 16,
        bitsStored: 12,
        highBit: 11,
        pixelRepresentation: 0,
      };
    case 'voiLutModule':
      return voiLutModule;
    case 'imagePlaneModule':
      return { rowPixelSpacing: 1, columnPixelSpacing: 1 };
    default:
      return;
  }
}

describe('createImage VOI LUT module', () => {
  beforeAll(() => metaData.addProvider(provider, 10000));
  afterAll(() => metaData.removeProvider(provider));

  // The metadata providers give single values as a string; a string must not
  // be read as an array of characters.
  it('gives the image the whole VOI LUT function and the first window', async () => {
    // An unknown function stays as given, so that the fidelity check reports it.
    for (const [voiLUTFunction, windowCenter, windowWidth, expected] of [
      ['SIGMOID', 40, 400, 'SIGMOID'],
      [['SIGMOID'], [40, 50], [400, 500], 'SIGMOID'],
      ['sigmoid ', 40, 400, 'SIGMOID'],
      ['BOGUS', 40, 400, 'BOGUS'],
    ]) {
      voiLutModule = { voiLUTFunction, windowCenter, windowWidth };
      const image = await createImage(
        imageId,
        new Uint8Array(8),
        '1.2.840.10008.1.2.1'
      );
      expect(image).toMatchObject({
        voiLUTFunction: expected,
        windowCenter: 40,
        windowWidth: 400,
      });
    }
  });
});
