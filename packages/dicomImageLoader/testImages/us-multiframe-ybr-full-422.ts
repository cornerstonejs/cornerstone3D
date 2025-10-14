import { Enums, type Types } from '@cornerstonejs/core';
import { tags } from './us-multiframe-ybr-full-422.wado-rs-tags';
import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const CALIBRATION_MODULE = {
  sequenceOfUltrasoundRegions: [
    {
      physicalDeltaX: 0.041258670759110834,
      physicalDeltaY: 0.041258670759110834,
      physicalUnitsXDirection: 3,
      physicalUnitsYDirection: 3,
      referencePhysicalPixelValueX: undefined,
      referencePhysicalPixelValueY: undefined,
      referencePixelX0: null,
      referencePixelY0: null,
      regionDataType: 1,
      regionFlags: 2,
      regionLocationMaxX1: 788,
      regionLocationMaxY1: 592,
      regionLocationMinX0: 11,
      regionLocationMinY0: 30,
      regionSpatialFormat: 1,
      transducerFrequency: undefined,
    },
  ],
};

const CS_IMAGE: Types.IImage = {
  // @ts-expect-error Extra fields not defined in IImage
  calibration: CALIBRATION_MODULE,
  color: true,
  columnPixelSpacing: 1,
  columns: 800,
  dataType: 'Uint8Array',
  data: jasmine.any(Object),
  // @ts-expect-error Extra fields not defined in IImage
  decodeTimeInMS: jasmine.any(Number),
  floatPixelData: undefined,
  // @ts-expect-error jasmine matcher
  getCanvas: jasmine.any(Function),
  // @ts-expect-error jasmine matcher
  getPixelData: jasmine.any(Function),
  height: 600,
  imageFrame: {
    bitsAllocated: 8,
    bitsStored: 8,
    bluePaletteColorLookupTableData: undefined,
    bluePaletteColorLookupTableDescriptor: undefined,
    columns: 800,
    decodeLevel: undefined,
    // @ts-expect-error jasmine matcher
    decodeTimeInMS: jasmine.any(Number),
    greenPaletteColorLookupTableData: undefined,
    greenPaletteColorLookupTableDescriptor: undefined,
    // @ts-expect-error jasmine matcher
    imageId: jasmine.any(String),
    largestPixelValue: 255,
    photometricInterpretation: 'YBR_FULL_422',
    // @ts-expect-error jasmine matcher
    pixelData: jasmine.any(Uint8Array),
    pixelDataLength: 960000,
    pixelRepresentation: 0,
    planarConfiguration: 0,
    redPaletteColorLookupTableData: undefined,
    redPaletteColorLookupTableDescriptor: undefined,
    rows: 600,
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
  rows: 600,
  sizeInBytes: 960000,
  slope: 1,
  voiLUTFunction: undefined,
  width: 800,
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

const WADO_URI_IMAGE_PLANE_MODULE: Types.ImagePlaneModule = {
  columnCosines: null,
  columnPixelSpacing: 1,
  columns: 800,
  frameOfReferenceUID: undefined,
  imageOrientationPatient: undefined,
  imagePositionPatient: undefined,
  pixelSpacing: undefined,
  rowCosines: null,
  rowPixelSpacing: 1,
  rows: 600,
  sliceLocation: undefined,
  sliceThickness: undefined,
  usingDefaultValues: true,
};
// Should be `Types.ImagePixelModule` the actual metadata doesn't conform to it.
const WADO_URI_IMAGE_PIXEL_MODULE = {
  bitsAllocated: 8,
  bitsStored: 8,
  columns: 800,
  highBit: 7,
  largestPixelValue: undefined,
  photometricInterpretation: 'YBR_FULL_422',
  pixelAspectRatio: undefined,
  pixelRepresentation: 0,
  planarConfiguration: 0,
  rows: 600,
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

const MULTIFRAME_MODULE = {
  NumberOfFrames: 78,
  PerFrameFunctionalInformation: {},
  SharedFunctionalInformation: {},
};

const IMAGE_HASH =
  '969155018b2b569d530b22bfdc537650c7162c56bad3783f1d1ecab2d558abf0';
const TEST_NAME = 'US Multiframe YBR Full 422';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/us-multiframe-ybr-full-422.dcm`,
  frames: [
    {
      index: 1,
      pixelDataHash: IMAGE_HASH,
      image: CS_IMAGE,
      metadataModule: {
        [Enums.MetadataModules.CALIBRATION]: CALIBRATION_MODULE,
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_URI_IMAGE_PIXEL_MODULE,
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_URI_IMAGE_PLANE_MODULE,
        [Enums.MetadataModules.MULTIFRAME]: MULTIFRAME_MODULE,
      },
    },
    {
      index: 78,
      pixelDataHash: IMAGE_HASH,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/us-multiframe-ybr-full-422.dcm`,
  wadorsMetadata: tags,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      image: CS_IMAGE,
      // these aren't working yet - the wado-rs metadata provider
      // doesn't return anything for these modules. Need to fix
      // how the data is being cached by the wado-rs loader.
      metadataModule: {
        [Enums.MetadataModules.CALIBRATION]: CALIBRATION_MODULE,
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_URI_IMAGE_PLANE_MODULE,
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_RS_IMAGE_PIXEL_MODULE,
        [Enums.MetadataModules.MULTIFRAME]: MULTIFRAME_MODULE,
      },
    },
  ],
};
