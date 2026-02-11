import type { Types } from '@cornerstonejs/core';
import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const EXPECTED_IMAGE: Types.IImage = {
  // @ts-expect-error Extra fields not defined in IImage
  calibration: {},
  color: true,
  columnPixelSpacing: 1,
  columns: 640,
  dataType: 'Uint8ClampedArray',
  data: jasmine.any(Object),
  // @ts-expect-error Extra fields not defined in IImage
  decodeTimeInMS: jasmine.any(Number),
  floatPixelData: undefined,
  // @ts-expect-error jasmine matcher
  getCanvas: jasmine.any(Function),
  // @ts-expect-error jasmine matcher
  getPixelData: jasmine.any(Function),
  height: 400,
  imageFrame: {
    bitsAllocated: 8,
    bitsStored: 8,
    // @ts-expect-error jasmine matcher
    bluePaletteColorLookupTableData: jasmine.any(Array),
    bluePaletteColorLookupTableDescriptor: [256, 0, 16],
    columns: 640,
    decodeLevel: undefined,
    // @ts-expect-error jasmine matcher
    decodeTimeInMS: jasmine.any(Number),
    // @ts-expect-error jasmine matcher
    greenPaletteColorLookupTableData: jasmine.any(Array),
    greenPaletteColorLookupTableDescriptor: [256, 0, 16],
    // @ts-expect-error jasmine matcher
    imageData: { data: jasmine.any(Uint8ClampedArray) },
    // @ts-expect-error jasmine matcher
    imageId: jasmine.any(String),
    largestPixelValue: 255,
    photometricInterpretation: 'PALETTE COLOR',
    // @ts-expect-error jasmine matcher
    pixelData: jasmine.any(Uint8ClampedArray),
    pixelDataLength: 768000,
    pixelRepresentation: 0,
    planarConfiguration: undefined,
    // @ts-expect-error jasmine matcher
    redPaletteColorLookupTableData: jasmine.any(Array),
    redPaletteColorLookupTableDescriptor: [256, 0, 16],
    rows: 400,
    samplesPerPixel: 1,
    smallestPixelValue: 0,
  },
  // @ts-expect-error jasmine matcher
  imageId: jasmine.any(String),
  intercept: 0,
  invert: false,
  maxPixelValue: 255,
  minPixelValue: 0,
  numberOfComponents: 3,
  preScale: undefined,
  rgba: undefined,
  rowPixelSpacing: 1,
  rows: 400,
  sizeInBytes: 768000,
  slope: 1,
  voiLUTFunction: undefined,
  width: 640,
  windowCenter: 128,
  windowWidth: 256,
  // @todo - add tests for voxelManager.
  // @ts-expect-error jasmine matcher
  voxelManager: jasmine.any(Object),
  // @ts-expect-error jasmine matcher
  loadTimeInMS: jasmine.any(Number),
  totalTimeInMS: jasmine.any(Number),
  // @ts-expect-error jasmine matcher
  imageQualityStatus: jasmine.any(Number),
};

const IMAGE_HASH =
  '7cd0371eb339cb41d63862964d8908a03d548427694a8918bd4debc94f54eeea';
const TEST_NAME = 'TestPattern_Palette_16';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/TestPattern_Palette_16.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      image: EXPECTED_IMAGE,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/TestPattern_Palette_16.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
