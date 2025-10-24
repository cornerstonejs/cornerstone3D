import { Enums, type Types } from '@cornerstonejs/core';
import { tags } from './TestPattern_JPEG-Baseline_YBR422.wado-rs-tags';
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
    // @ts-expect-error jasmine matcher
    imageData: jasmine.any(ImageData),
    largestPixelValue: 255,
    photometricInterpretation: 'YBR_FULL_422',
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
  // @ts-expect-error jasmine matcher
  voxelManager: jasmine.any(Object),
  // @ts-expect-error jasmine matcher
  loadTimeInMS: jasmine.any(Number),
  totalTimeInMS: jasmine.any(Number),
  // @ts-expect-error jasmine matcher
  imageQualityStatus: jasmine.any(Number),
};

const WADO_URI_IMAGE_PLANE_MODULE: Types.ImagePlaneModule = {
  columnCosines: [0, 1, 0],
  columnPixelSpacing: 1,
  columns: 640,
  frameOfReferenceUID: undefined,
  // @ts-expect-error Incorrect type in core
  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
  imagePositionPatient: [0.5, 0.5, 0.5],
  pixelSpacing: [1, 1],
  rowCosines: [1, 0, 0],
  rowPixelSpacing: 1,
  rows: 400,
  sliceLocation: undefined,
  sliceThickness: undefined,
  usingDefaultValues: false,
};
// Should be `Types.ImagePixelModule` the actual metadata doesn't conform to it.
const WADO_URI_IMAGE_PIXEL_MODULE = {
  bitsAllocated: 8,
  bitsStored: 8,
  columns: 640,
  highBit: 7,
  largestPixelValue: undefined,
  photometricInterpretation: 'YBR_FULL_422',
  pixelAspectRatio: undefined,
  pixelRepresentation: 0,
  planarConfiguration: 0,
  rows: 400,
  samplesPerPixel: 3,
  smallestPixelValue: undefined,
};

/**
 * WADO-RS Pixel Module contains additional fields that are not present in
 * WADO-URI Pixel Module.
 */
const WADO_RS_IMAGE_PIXEL_MODULE = {
  ...WADO_URI_IMAGE_PIXEL_MODULE,
  bluePaletteColorLookupTableData: undefined,
  bluePaletteColorLookupTableDescriptor: undefined,
  greenPaletteColorLookupTableData: undefined,
  greenPaletteColorLookupTableDescriptor: undefined,
  redPaletteColorLookupTableData: undefined,
  redPaletteColorLookupTableDescriptor: undefined,
};

const SERIES_MODULE: Types.GeneralSeriesModuleMetadata = {
  modality: 'OT',
  seriesDate: undefined,
  seriesInstanceUID: '1.3.6.1.4.1.34261.90254037371867.41912.1553085024.3',
  seriesNumber: 1,
  seriesTime: undefined,
  studyInstanceUID: '1.3.6.1.4.1.34261.90254037371867.41912.1553085024.2',
  // @ts-expect-error The following fields are not defined in GeneralSeriesModuleMetadata
  acquisitionDate: undefined,
  acquisitionTime: undefined,
  seriesDescription: undefined,
};

const CALIBRATION_MODULE = undefined;

/**
 * The expected image hash on MacOS is
 * `16ceb0ebf838cf705ae3d641c0acda06c9122f2ed42fe8bf250555bd4faa41e5 In GH
 * Actions it is
 * `f8b3f1c75e9ac773a200bba9ce94f8fd1df97d6f27d4e164af002ddcab6a025b`
 */
const IMAGE_HASH =
  'f8b3f1c75e9ac773a200bba9ce94f8fd1df97d6f27d4e164af002ddcab6a025b';
const TEST_NAME = 'JPEG Baseline YBR422';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/TestPattern_JPEG-Baseline_YBR422.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      image: EXPECTED_IMAGE,
      metadataModule: {
        [Enums.MetadataModules.CALIBRATION]: CALIBRATION_MODULE,
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_URI_IMAGE_PLANE_MODULE,
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_URI_IMAGE_PIXEL_MODULE,
        [Enums.MetadataModules.GENERAL_SERIES]: SERIES_MODULE,
      },
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/TestPattern_JPEG-Baseline_YBR422.dcm`,
  wadorsMetadata: tags,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      metadataModule: {
        [Enums.MetadataModules.CALIBRATION]: CALIBRATION_MODULE,
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_URI_IMAGE_PLANE_MODULE,
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_RS_IMAGE_PIXEL_MODULE,
        [Enums.MetadataModules.GENERAL_SERIES]: SERIES_MODULE,
      },
    },
  ],
};
