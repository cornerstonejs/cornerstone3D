import { Enums, type Types } from '@cornerstonejs/core';
import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const EXPECTED_IMAGE: Types.IImage = {
  // @ts-expect-error Extra fields not defined in IImage
  calibration: {},
  color: false,
  columnPixelSpacing: 0.7031,
  columns: 256,
  dataType: 'Float32Array',
  data: jasmine.any(Object),
  // @ts-expect-error Extra fields not defined in IImage
  decodeTimeInMS: jasmine.any(Number),
  floatPixelData: undefined,
  getCanvas: undefined,
  // @ts-expect-error jasmine matcher
  getPixelData: jasmine.any(Function),
  height: 256,
  imageFrame: {
    bitsAllocated: 32,
    bitsStored: undefined,
    bluePaletteColorLookupTableData: undefined,
    bluePaletteColorLookupTableDescriptor: undefined,
    columns: 256,
    decodeLevel: undefined,
    // @ts-expect-error jasmine matcher
    decodeTimeInMS: jasmine.any(Number),
    greenPaletteColorLookupTableData: undefined,
    greenPaletteColorLookupTableDescriptor: undefined,
    // @ts-expect-error jasmine matcher
    imageId: jasmine.any(String),
    largestPixelValue: 0.004095000214874744,
    photometricInterpretation: 'MONOCHROME2',
    // @ts-expect-error jasmine matcher
    pixelData: jasmine.any(Float32Array),
    pixelDataLength: 65536,
    pixelRepresentation: undefined,
    planarConfiguration: undefined,
    redPaletteColorLookupTableData: undefined,
    redPaletteColorLookupTableDescriptor: undefined,
    rows: 256,
    samplesPerPixel: 1,
    smallestPixelValue: 0,
  },
  // @ts-expect-error jasmine matcher
  imageId: jasmine.any(String),
  intercept: 0,
  invert: false,
  maxPixelValue: 0.004095000214874744,
  minPixelValue: 0,
  numberOfComponents: 1,
  preScale: undefined,
  rgba: false,
  rowPixelSpacing: 0.7031,
  rows: 256,
  sizeInBytes: 262144,
  slope: 1,
  voiLUTFunction: undefined,
  width: 256,
  windowCenter: 0.5020475001074374,
  windowWidth: 1.0040950002148747,
  // @ts-expect-error jasmine matcher
  voxelManager: jasmine.any(Object),
  // @ts-expect-error jasmine matcher
  loadTimeInMS: jasmine.any(Number),
  totalTimeInMS: jasmine.any(Number),
  // @ts-expect-error jasmine matcher
  imageQualityStatus: jasmine.any(Number),
};

const WADO_URI_IMAGE_PLANE_MODULE: Types.ImagePlaneModule = {
  columnCosines: [-0.005401652, 0.9847554, 0.1738611],
  columnPixelSpacing: 0.7031,
  columns: 256,
  frameOfReferenceUID:
    '1.3.6.1.4.1.14519.5.2.1.3671.7001.241598906086676267096591752663',
  // @ts-expect-error Incorrect type in core
  imageOrientationPatient: [
    0.999981, 0.004800584, 0.003877514, -0.005401652, 0.9847554, 0.1738611,
  ],
  imagePositionPatient: [-90.0225, -108.462, -43.9748],
  pixelSpacing: [0.7031, 0.7031],
  rowCosines: [0.999981, 0.004800584, 0.003877514],
  rowPixelSpacing: 0.7031,
  rows: 256,
  sliceLocation: undefined,
  sliceThickness: 2.999902,
  usingDefaultValues: false,
  spacingBetweenSlices: undefined,
  isDefaultValueSetForRowCosine: true,
  isDefaultValueSetForColumnCosine: true,
};
// Should be `Types.ImagePixelModule` the actual metadata doesn't conform to it.
const WADO_URI_IMAGE_PIXEL_MODULE = {
  bitsAllocated: 32,
  bitsStored: undefined,
  columns: 256,
  highBit: undefined,
  largestPixelValue: undefined,
  photometricInterpretation: 'MONOCHROME2',
  pixelAspectRatio: undefined,
  pixelRepresentation: undefined,
  planarConfiguration: undefined,
  rows: 256,
  samplesPerPixel: 1,
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
  modality: 'MR',
  seriesDate: { year: 2016, month: 9, day: 29 },
  seriesInstanceUID: '1.2.276.0.7230010.3.1.3.0.50783.1475186871.651944',
  seriesNumber: 701,
  seriesTime: {
    hours: 18,
    minutes: 7,
    seconds: 51,
    fractionalSeconds: undefined,
  },
  studyInstanceUID:
    '1.3.6.1.4.1.14519.5.2.1.3671.7001.133687106572018334063091507027',
  // @ts-expect-error The following fields are not defined in GeneralSeriesModuleMetadata
  acquisitionDate: undefined,
  acquisitionTime: undefined,
  seriesDescription: 'Apparent Diffusion Coefficient',
};

const CALIBRATION_MODULE = undefined;

const IMAGE_HASH =
  '461466d00428dc8a55013aef870cb76bfa13cb41e4e3a0d211ccaf83162f4383';
const TEST_NAME = 'paramap-float';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/paramap-float.dcm`,
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

/**
 * Disabled - dcm2json reports an error
 */
export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/paramap-float.dcm`,
  // wadorsMetadata: tags,
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
