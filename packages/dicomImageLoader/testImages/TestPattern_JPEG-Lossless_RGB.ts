import type { Types } from '@cornerstonejs/core';
import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const EXPECTED_IMAGE: Types.IImage = {
  // @ts-expect-error Extra fields not defined in IImage
  calibration: {},
  color: true,
  columnPixelSpacing: 1,
  columns: 640,
  dataType: 'Uint8Array',
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
    bluePaletteColorLookupTableData: undefined,
    bluePaletteColorLookupTableDescriptor: undefined,
    columns: 640,
    decodeLevel: undefined,
    // @ts-expect-error jasmine matcher
    decodeTimeInMS: jasmine.any(Number),
    greenPaletteColorLookupTableData: undefined,
    greenPaletteColorLookupTableDescriptor: undefined,
    // @ts-expect-error jasmine matcher
    imageId: jasmine.any(String),
    largestPixelValue: 255,
    photometricInterpretation: 'RGB',
    // @ts-expect-error jasmine matcher
    pixelData: jasmine.any(Uint8Array),
    pixelDataLength: 768000,
    pixelRepresentation: 0,
    planarConfiguration: 0,
    redPaletteColorLookupTableData: undefined,
    redPaletteColorLookupTableDescriptor: undefined,
    rows: 400,
    samplesPerPixel: 3,
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
  'db754473cb0f7754a77e709c199e787285f68beb675a934f8d4567328ab8f107';
const TEST_NAME = 'JPEG Lossless RGB';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/TestPattern_JPEG-Lossless_RGB.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      image: EXPECTED_IMAGE,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/TestPattern_JPEG-Lossless_RGB.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
